import type { PluginTheme } from "@getpaseo/plugin";
import { useRpc } from "@getpaseo/plugin/client";
import { Icon, ScrollView } from "@getpaseo/plugin/client/react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { type RepoStatus, type RepoTarget, wipDiffRpc } from "../../shared/contracts";
import { fileName } from "../../shared/file-groups";
import {
  fingerprint,
  keepListed,
  keepUnchanged,
  nextUnreviewed,
  type ReviewedFiles,
  reviewItems,
  reviewProgress,
} from "../../shared/review";
import { describeWipChange } from "../../shared/status-text";
import { useWipDiff } from "../hooks/useRepoQueries";
import {
  FONT_SIZE,
  ICON_SIZE,
  RADIUS,
  REVIEW_LIST_WIDTH,
  REVIEW_RECHECK_MS,
  REVIEW_VERIFY_CONCURRENCY,
  SPACING,
} from "../tokens";
import { DiffPane } from "./DiffView";

const DIVIDER_WIDTH = 1;
const PROGRESS_HEIGHT = 4;

const AREA_LABELS = { conflicted: "conflict", staged: "staged", unstaged: "not staged", untracked: "new file" } as const;

interface ReviewModeProps {
  target: RepoTarget;
  status: RepoStatus;
  worktreeToken: string | undefined;
  reviewed: ReviewedFiles;
  onReviewedChange(next: ReviewedFiles): void;
  theme: PluginTheme;
  narrow: boolean;
  onExit(): void;
}

function Button({
  label,
  icon,
  onPress,
  theme,
  primary = false,
  disabled = false,
}: {
  label: string;
  icon?: string;
  onPress(): void;
  theme: PluginTheme;
  primary?: boolean;
  disabled?: boolean;
}) {
  const { colors } = theme;
  const foreground = primary && !disabled ? colors.accentForeground : disabled ? colors.foregroundMuted : colors.foreground;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: SPACING.xs,
        paddingHorizontal: SPACING.md,
        paddingVertical: SPACING.xs,
        borderRadius: RADIUS.chip,
        backgroundColor: primary && !disabled ? colors.accent : colors.surface2,
      }}
    >
      {icon ? <Icon name={icon} size={ICON_SIZE} color={foreground} /> : null}
      <Text style={{ color: foreground, fontSize: FONT_SIZE.small, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
}

/**
 * Steps through every uncommitted file with its full diff and a checklist. A mark is tied to the
 * diff that was reviewed: if that file changes, the mark is dropped, and every mark is re-checked
 * against fresh diffs before the review is called complete. Read-only: nothing is staged or committed.
 */
export function ReviewMode({ target, status, worktreeToken, reviewed, onReviewedChange, theme, narrow, onExit }: ReviewModeProps) {
  const { colors } = theme;
  const fetchWipDiff = useRpc(wipDiffRpc);
  const items = useMemo(() => reviewItems(status.files), [status.files]);
  const [index, setIndex] = useState(0);
  const [showList, setShowList] = useState(false);
  const [checked, setChecked] = useState<{ signature: string; unchanged: boolean } | null>(null);
  const position = Math.min(index, Math.max(items.length - 1, 0));
  const current = items[position] ?? null;
  const diff = useWipDiff(target, current ? { path: current.path, area: current.area } : null, worktreeToken);
  // A diff cut off at the size limit was not fully shown, so it cannot be marked as reviewed.
  const tooLarge = diff.data?.truncated ?? false;
  const currentPrint = diff.data && !diff.error && !tooLarge ? fingerprint(diff.data.text) : null;

  // Files that no longer have changes in their area lose their marks.
  useEffect(() => {
    const listed = keepListed(reviewed, items);
    if (listed.size !== reviewed.size) onReviewedChange(listed);
  }, [items, reviewed, onReviewedChange]);

  // The file on screen changed after it was marked: it needs another look.
  useEffect(() => {
    if (!current || currentPrint === null) return;
    const marked = reviewed.get(current.key);
    if (marked !== undefined && marked !== currentPrint) {
      const next = new Map(reviewed);
      next.delete(current.key);
      onReviewedChange(next);
    }
  }, [current, currentPrint, reviewed, onReviewedChange]);

  const progress = reviewProgress(items, reviewed, status.filesTruncated);
  const allMarked = progress.complete;
  // Identifies the exact set of marks a re-check result belongs to.
  const signature = useMemo(
    () => [...reviewed].map(([key, print]) => `${key}=${print}`).sort().join("\n"),
    [reviewed],
  );

  // Fingerprints of every file's current diff; a diff that cannot be fetched gets none.
  const freshPrints = useCallback(async (isCancelled: () => boolean): Promise<Map<string, string> | null> => {
    const fresh = new Map<string, string>();
    for (let start = 0; start < items.length; start += REVIEW_VERIFY_CONCURRENCY) {
      await Promise.all(
        items.slice(start, start + REVIEW_VERIFY_CONCURRENCY).map(async (item) => {
          try {
            const result = await fetchWipDiff({ target, path: item.path, area: item.area });
            if (!result.truncated) fresh.set(item.key, fingerprint(result.text));
          } catch {
            // A diff that cannot be fetched cannot count as reviewed.
          }
        }),
      );
      if (isCancelled()) return null;
    }
    return fresh;
  }, [items, fetchWipDiff, target]);

  // Before calling the review complete, re-fetch every reviewed diff and drop marks that no longer
  // match. A result only counts for the marks it checked, so any change starts a fresh check.
  useEffect(() => {
    if (!allMarked || checked?.signature === signature) return;
    let cancelled = false;
    void freshPrints(() => cancelled).then((fresh) => {
      if (!fresh) return;
      const kept = keepUnchanged(reviewed, fresh);
      setChecked({ signature, unchanged: kept.size === reviewed.size });
      if (kept.size !== reviewed.size) onReviewedChange(kept);
    });
    return () => {
      cancelled = true;
    };
  }, [allMarked, checked, signature, reviewed, freshPrints, onReviewedChange]);

  const finished = allMarked && checked?.signature === signature && checked.unchanged;

  // While "All reviewed" is on screen, keep checking in the background: a file that is not shown
  // can be edited again without changing git status, and only the shown file's diff polls.
  useEffect(() => {
    if (!finished) return;
    let cancelled = false;
    const recheck = () => {
      void freshPrints(() => cancelled).then((fresh) => {
        if (!fresh) return;
        const kept = keepUnchanged(reviewed, fresh);
        if (kept.size !== reviewed.size) onReviewedChange(kept);
      });
    };
    recheck();
    const timer = setInterval(recheck, REVIEW_RECHECK_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [finished, worktreeToken, reviewed, freshPrints, onReviewedChange]);

  const markReviewed = () => {
    if (!current || currentPrint === null) return;
    const next = new Map(reviewed);
    next.set(current.key, currentPrint);
    onReviewedChange(next);
    const following = nextUnreviewed(items, next, position);
    if (following !== null) setIndex(following);
  };
  const unmark = () => {
    if (!current) return;
    const next = new Map(reviewed);
    next.delete(current.key);
    onReviewedChange(next);
  };

  const currentReviewed = current ? reviewed.has(current.key) : false;

  const topBar = (
    <View style={{ gap: SPACING.sm, padding: SPACING.md, borderBottomWidth: DIVIDER_WIDTH, borderBottomColor: colors.border }}>
      <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: SPACING.sm }}>
        <Icon name="ListChecks" size={ICON_SIZE} color={colors.foreground} />
        <Text style={{ flex: 1, color: colors.foreground, fontSize: FONT_SIZE.title, fontWeight: "700" }}>Review changes</Text>
        <Button label="Previous" icon="ChevronLeft" onPress={() => setIndex(Math.max(position - 1, 0))} disabled={position === 0} theme={theme} />
        <Button label="Next" icon="ChevronRight" onPress={() => setIndex(Math.min(position + 1, items.length - 1))} disabled={position >= items.length - 1} theme={theme} />
        {narrow ? <Button label={showList ? "Hide files" : "Files"} onPress={() => setShowList((open) => !open)} theme={theme} /> : null}
        <Button label="Exit review" icon="LogOut" onPress={onExit} theme={theme} />
      </View>
      <Text style={{ color: colors.foregroundMuted, fontSize: FONT_SIZE.small }}>
        File {items.length === 0 ? 0 : position + 1} of {items.length}, {progress.reviewed} reviewed
        {status.filesTruncated ? `. Only the first ${items.length} changed files can be reviewed here.` : ""}
      </Text>
      <View style={{ height: PROGRESS_HEIGHT, borderRadius: RADIUS.pill, backgroundColor: colors.surface2, overflow: "hidden" }}>
        <View
          style={{
            width: `${items.length === 0 ? 0 : (progress.reviewed / items.length) * 100}%`,
            height: PROGRESS_HEIGHT,
            backgroundColor: colors.statusSuccess,
          }}
        />
      </View>
    </View>
  );

  const checklist = (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: SPACING.sm, gap: SPACING.xs }}>
      {items.map((item, itemIndex) => {
        const done = reviewed.has(item.key);
        const active = itemIndex === position;
        return (
          <Pressable
            key={item.key}
            accessibilityRole="button"
            accessibilityLabel={`${done ? "Reviewed" : "Not reviewed"}: ${item.path}, ${AREA_LABELS[item.area]}`}
            accessibilityState={{ selected: active }}
            onPress={() => {
              setIndex(itemIndex);
              setShowList(false);
            }}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: SPACING.sm,
              padding: SPACING.sm,
              borderRadius: RADIUS.card,
              backgroundColor: active ? colors.surface2 : "transparent",
            }}
          >
            <Icon name={done ? "CircleCheck" : "Circle"} size={ICON_SIZE} color={done ? colors.statusSuccess : colors.foregroundMuted} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: FONT_SIZE.small, fontWeight: active ? "700" : "400" }}>
                {fileName(item.path)}
              </Text>
              <Text numberOfLines={1} style={{ color: colors.foregroundMuted, fontSize: FONT_SIZE.small }}>
                {AREA_LABELS[item.area]}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );

  let main;
  if (finished) {
    main = (
      <View style={{ margin: SPACING.lg, padding: SPACING.lg, gap: SPACING.md, borderRadius: RADIUS.card, backgroundColor: colors.surface1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.sm }}>
          <Icon name="ShieldCheck" size={ICON_SIZE} color={colors.statusSuccess} />
          <Text style={{ color: colors.foreground, fontSize: FONT_SIZE.title, fontWeight: "700" }}>
            All {items.length} {items.length === 1 ? "file" : "files"} reviewed
          </Text>
        </View>
        <Text style={{ color: colors.foregroundMuted, fontSize: FONT_SIZE.body }}>
          Every change was checked against its latest version. When you are ready, stage the files and commit them.
        </Text>
        <View style={{ alignSelf: "flex-start" }}>
          <Button label="Exit review" icon="LogOut" onPress={onExit} primary theme={theme} />
        </View>
      </View>
    );
  } else if (allMarked) {
    main = (
      <View style={{ padding: SPACING.lg, gap: SPACING.sm, alignItems: "center" }}>
        <ActivityIndicator color={colors.foregroundMuted} />
        <Text style={{ color: colors.foregroundMuted, fontSize: FONT_SIZE.body }}>Checking that nothing changed since you reviewed it</Text>
      </View>
    );
  } else if (!current) {
    main = <Text style={{ padding: SPACING.lg, color: colors.foregroundMuted, fontSize: FONT_SIZE.body }}>There is nothing to review.</Text>;
  } else {
    const statusFile = status.files.find((file) => file.path === current.path);
    const header = (
      <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: SPACING.sm, padding: SPACING.md }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: FONT_SIZE.body, fontWeight: "700" }}>
            {current.path}
          </Text>
          <Text style={{ color: colors.foregroundMuted, fontSize: FONT_SIZE.small }}>
            {AREA_LABELS[current.area]}
            {statusFile ? `, ${describeWipChange(statusFile, current.area)}` : ""}
          </Text>
          {tooLarge ? (
            <Text style={{ color: colors.statusWarning, fontSize: FONT_SIZE.small }}>
              This change is too large to show completely here. Review it in your editor; it cannot be marked as reviewed in this view.
            </Text>
          ) : null}
        </View>
        {currentReviewed ? (
          <Button label="Reviewed" icon="CircleCheck" onPress={unmark} theme={theme} />
        ) : (
          <Button label="Mark as reviewed" icon="Check" onPress={markReviewed} disabled={currentPrint === null} primary theme={theme} />
        )}
      </View>
    );
    main = (
      <DiffPane
        header={header}
        text={diff.data?.text}
        truncated={diff.data?.truncated ?? false}
        loading={!diff.data && diff.isFetching}
        error={diff.error}
        theme={theme}
      />
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface0 }}>
      {topBar}
      {narrow ? (
        <View style={{ flex: 1 }}>{showList ? checklist : main}</View>
      ) : (
        <View style={{ flex: 1, flexDirection: "row" }}>
          <View style={{ width: REVIEW_LIST_WIDTH, borderRightWidth: DIVIDER_WIDTH, borderRightColor: colors.border }}>{checklist}</View>
          <View style={{ flex: 1 }}>{main}</View>
        </View>
      )}
    </View>
  );
}
