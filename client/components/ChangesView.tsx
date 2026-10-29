import type { PluginTheme } from "@getpaseo/plugin";
import { Icon, Modal, ScrollView } from "@getpaseo/plugin/client/react-native";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { ActivityIndicator, type LayoutChangeEvent, Pressable, Text, View } from "react-native";
import { isMine } from "../../shared/author";
import {
  describeNoRemote,
  describeToPull,
  describeToPush,
  explainArea,
  summarizeChanges,
} from "../../shared/changes-text";
import type { CommitSummary, FileStat, Identity, RepoTarget, WipArea } from "../../shared/contracts";
import { changeBadge, groupByFolder } from "../../shared/file-groups";
import type { ReviewedFiles } from "../../shared/review";
import { pluralize } from "../../shared/format";
import { describeWipChange, groupWorkInProgress } from "../../shared/status-text";
import { type ChangeFlow, useChangeFlow } from "../hooks/useChangeFlow";
import { useNow } from "../hooks/useNow";
import { useRepoState, useSyncCommits, useWipDiff, useWipStats, type WipSelection } from "../hooks/useRepoQueries";
import { FONT_SIZE, ICON_SIZE, NARROW_LAYOUT_WIDTH, RADIUS, SPACING } from "../tokens";
import { ActionButton, BackupsCard, ChangeConfirmModal, FileActions, UndoBanner } from "./ChangeControls";
import { CommitDetail } from "./CommitDetail";
import { CommitRow } from "./CommitRow";
import { DiffPane, type ExpandControl } from "./DiffView";
import { FileCard } from "./FileCard";
import { ReviewMode } from "./ReviewMode";
import { StatusBar } from "./StatusBar";

const LIST_FLEX = 3;
const DETAIL_FLEX = 2;
const DIVIDER_WIDTH = 1;

type Selection = { kind: "file"; file: WipSelection } | { kind: "commit"; hash: string };

const AREA_ICONS: Readonly<Record<WipArea, string>> = {
  conflicted: "TriangleAlert",
  staged: "CircleCheck",
  unstaged: "FilePen",
  untracked: "FilePlus",
};

function SectionCard({
  icon,
  title,
  count,
  explanation,
  theme,
  children,
}: {
  icon: string;
  title: string;
  count: number;
  explanation: string;
  theme: PluginTheme;
  children: ReactNode;
}) {
  const { colors } = theme;
  return (
    <View
      style={{
        marginHorizontal: SPACING.md,
        marginBottom: SPACING.md,
        paddingVertical: SPACING.sm,
        gap: SPACING.xs,
        borderRadius: RADIUS.card,
        borderWidth: DIVIDER_WIDTH,
        borderColor: colors.border,
        backgroundColor: colors.surface1,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.sm, paddingHorizontal: SPACING.md }}>
        <Icon name={icon} size={ICON_SIZE} color={colors.foreground} />
        <Text style={{ flexShrink: 1, color: colors.foreground, fontSize: FONT_SIZE.body, fontWeight: "700" }}>{title}</Text>
        <View style={{ paddingHorizontal: SPACING.sm, borderRadius: RADIUS.pill, backgroundColor: colors.surface2 }}>
          <Text style={{ color: colors.foreground, fontSize: FONT_SIZE.small, fontWeight: "600" }}>{count}</Text>
        </View>
      </View>
      <Text style={{ paddingHorizontal: SPACING.md, color: colors.foregroundMuted, fontSize: FONT_SIZE.small }}>
        {explanation}
      </Text>
      <View style={{ gap: SPACING.xs }}>{children}</View>
    </View>
  );
}

function CountChip({ icon, label, theme }: { icon: string; label: string; theme: PluginTheme }) {
  const { colors } = theme;
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: SPACING.xs,
        paddingHorizontal: SPACING.sm,
        paddingVertical: SPACING.xs,
        borderRadius: RADIUS.pill,
        backgroundColor: colors.surface2,
      }}
    >
      <Icon name={icon} size={ICON_SIZE} color={colors.foreground} />
      <Text style={{ color: colors.foreground, fontSize: FONT_SIZE.small, fontWeight: "600" }}>{label}</Text>
    </View>
  );
}

function FolderLabel({ folder, theme }: { folder: string; theme: PluginTheme }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.xs, paddingHorizontal: SPACING.md, paddingTop: SPACING.xs }}>
      <Icon name="Folder" size={ICON_SIZE} color={theme.colors.foregroundMuted} />
      <Text numberOfLines={1} style={{ flexShrink: 1, color: theme.colors.foregroundMuted, fontSize: FONT_SIZE.small }}>
        {folder || "Top level"}
      </Text>
    </View>
  );
}

function statsByPath(stats: readonly FileStat[] | undefined): ReadonlyMap<string, FileStat> {
  return new Map((stats ?? []).map((stat) => [stat.path, stat]));
}

function largestChange(stats: Iterable<FileStat | undefined>): number {
  let largest = 0;
  for (const stat of stats) largest = Math.max(largest, (stat?.additions ?? 0) + (stat?.deletions ?? 0));
  return largest;
}

interface CommitListProps {
  commits: readonly CommitSummary[];
  truncated: boolean;
  identity: Identity | undefined;
  selectedHash: string | null;
  compact: boolean;
  now: number;
  theme: PluginTheme;
  onSelect(hash: string): void;
}

function CommitList({ commits, truncated, identity, selectedHash, compact, now, theme, onSelect }: CommitListProps) {
  return (
    <>
      {commits.map((commit) => (
        <CommitRow
          key={commit.hash}
          commit={commit}
          theme={theme}
          compact={compact}
          selected={commit.hash === selectedHash}
          mine={isMine({ name: commit.authorName, email: commit.authorEmail }, identity)}
          now={now}
          dimmed={false}
          focused={false}
          onSelect={onSelect}
        />
      ))}
      {truncated ? (
        <Text style={{ paddingHorizontal: SPACING.md, color: theme.colors.foregroundMuted, fontSize: FONT_SIZE.small }}>
          Showing the newest {commits.length}.
        </Text>
      ) : null}
    </>
  );
}

function WipFileDiff({
  target,
  file,
  worktreeToken,
  theme,
  flow,
  expand,
  onClose,
}: {
  target: RepoTarget;
  file: WipSelection;
  worktreeToken: string | undefined;
  theme: PluginTheme;
  flow: ChangeFlow;
  expand?: ExpandControl;
  onClose?: () => void;
}) {
  const { colors } = theme;
  const diff = useWipDiff(target, file, worktreeToken);
  const header = (
    <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: SPACING.sm, padding: SPACING.md }}>
      <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, color: colors.foreground, fontSize: FONT_SIZE.body, fontWeight: "600" }}>
        {file.path}
      </Text>
      <FileActions path={file.path} area={file.area} flow={flow} theme={theme} />
      {onClose ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close file changes"
          onPress={onClose}
          style={{ padding: SPACING.xs, borderRadius: RADIUS.chip, backgroundColor: colors.surface2 }}
        >
          <Icon name="X" size={ICON_SIZE} color={colors.foreground} />
        </Pressable>
      ) : null}
    </View>
  );
  return (
    <DiffPane
      expand={expand}
      header={header}
      text={diff.data?.text}
      truncated={diff.data?.truncated ?? false}
      loading={!diff.data && diff.isFetching}
      error={diff.error}
      theme={theme}
    />
  );
}

/**
 * Everything that exists only on this machine or only on the server, in plain words: uncommitted
 * files by kind, commits not pushed yet, and commits to pull. It explains next steps, and can discard
 * uncommitted changes after a confirmation, keeping a backup for Undo.
 */
export function ChangesView({ target, theme, compact }: { target: RepoTarget; theme: PluginTheme; compact: boolean }) {
  const { colors } = theme;
  const now = useNow();
  const { tokens, revision, status, identity } = useRepoState(target);
  const sync = useSyncCommits(target, tokens?.refsToken);
  const wipStats = useWipStats(target, tokens?.worktreeToken);
  const stagedStats = useMemo(() => statsByPath(wipStats.data?.staged), [wipStats.data?.staged]);
  const unstagedStats = useMemo(() => statsByPath(wipStats.data?.unstaged), [wipStats.data?.unstaged]);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [reviewed, setReviewed] = useState<ReviewedFiles>(new Map());
  const startReview = useCallback(() => {
    setSelection(null);
    setReviewing(true);
  }, []);
  const exitReview = useCallback(() => setReviewing(false), []);
  const [width, setWidth] = useState<number | null>(null);
  const onLayout = useCallback((event: LayoutChangeEvent) => setWidth(Math.round(event.nativeEvent.layout.width)), []);
  const narrow = compact || (width !== null && width < NARROW_LAYOUT_WIDTH);
  const condensed = narrow || selection !== null;
  const [expanded, setExpanded] = useState(false);
  const toggleExpanded = useCallback(() => setExpanded((value) => !value), []);
  const close = useCallback(() => {
    setSelection(null);
    setExpanded(false);
  }, []);
  const selectCommit = useCallback((hash: string) => setSelection({ kind: "commit", hash }), []);
  const groups = useMemo(() => groupWorkInProgress(status.data?.files ?? []), [status.data?.files]);
  const flow = useChangeFlow(target);
  const { done, dismiss } = flow;
  const forgetRestored = useCallback(
    (backupId: string) => {
      if (done?.backupId === backupId) dismiss();
    },
    [done?.backupId, dismiss],
  );

  // Any failed request that leaves required data missing must surface, not spin forever.
  const error = revision.error ?? status.error ?? sync.error;
  if (error && (!status.data || !sync.data)) {
    return (
      <View style={{ flex: 1, padding: SPACING.lg, gap: SPACING.md, backgroundColor: colors.surface0 }}>
        <Text style={{ color: colors.statusDanger, fontSize: FONT_SIZE.body }}>{error.message}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Try again"
          onPress={() => {
            void revision.refetch();
            void status.refetch();
            void sync.refetch();
          }}
          style={{
            alignSelf: "flex-start",
            paddingHorizontal: SPACING.md,
            paddingVertical: SPACING.xs,
            borderRadius: RADIUS.chip,
            backgroundColor: colors.surface2,
          }}
        >
          <Text style={{ color: colors.foreground, fontSize: FONT_SIZE.small }}>Try again</Text>
        </Pressable>
      </View>
    );
  }
  if (!status.data || !sync.data) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.surface0 }} onLayout={onLayout}>
        <ActivityIndicator style={{ marginTop: SPACING.xl }} color={colors.foregroundMuted} />
      </View>
    );
  }

  const repoStatus = status.data;
  const syncData = sync.data;
  const selectedHash = selection?.kind === "commit" ? selection.hash : null;
  const toPush = describeToPush(syncData);
  const toPull = describeToPull(syncData);
  const noRemote = describeNoRemote(syncData);

  const filesChanged = repoStatus.files.length;
  // A file whose change was discarded or committed has nothing left to show.
  const selectedFile = selection?.kind === "file" ? selection.file : null;
  const selectionGone =
    selectedFile !== null &&
    !groups.some((group) => group.area === selectedFile.area && group.files.some((file) => file.path === selectedFile.path));
  const list = (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingVertical: SPACING.md }}>
      <View
        style={{
          marginHorizontal: SPACING.md,
          marginBottom: SPACING.md,
          padding: SPACING.lg,
          gap: SPACING.md,
          borderRadius: RADIUS.card,
          borderWidth: DIVIDER_WIDTH,
          borderColor: colors.border,
          backgroundColor: colors.surface1,
        }}
      >
        <Text style={{ color: colors.foreground, fontSize: FONT_SIZE.title, fontWeight: "700" }}>
          {summarizeChanges(repoStatus, syncData)}
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm }}>
          {filesChanged > 0 ? (
            <CountChip icon="FileDiff" label={pluralize(filesChanged, "file")} theme={theme} />
          ) : null}
          {syncData.toPush.length > 0 ? (
            <CountChip icon="ArrowUp" label={`${syncData.toPush.length} to push`} theme={theme} />
          ) : null}
          {syncData.toPull.length > 0 ? (
            <CountChip icon="ArrowDown" label={`${syncData.toPull.length} to pull`} theme={theme} />
          ) : null}
          {filesChanged + syncData.toPush.length + syncData.toPull.length === 0 ? (
            <CountChip icon="CircleCheck" label="All clear" theme={theme} />
          ) : null}
        </View>
        {noRemote ? <Text style={{ color: colors.foregroundMuted, fontSize: FONT_SIZE.small }}>{noRemote}</Text> : null}
        {filesChanged > 0 ? (
          <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: SPACING.sm }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Review changes file by file"
              onPress={startReview}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: SPACING.xs,
                paddingHorizontal: SPACING.md,
                paddingVertical: SPACING.sm,
                borderRadius: RADIUS.chip,
                backgroundColor: colors.accent,
              }}
            >
              <Icon name="ListChecks" size={ICON_SIZE} color={colors.accentForeground} />
              <Text style={{ color: colors.accentForeground, fontSize: FONT_SIZE.small, fontWeight: "700" }}>
                Review changes{reviewed.size > 0 ? ` (${reviewed.size} reviewed)` : ""}
              </Text>
            </Pressable>
            <ActionButton
              label="Discard all"
              icon="Trash2"
              onPress={() => flow.request({ kind: "discard-all" }, filesChanged)}
              destructive
              theme={theme}
            />
          </View>
        ) : null}
      </View>
      {flow.done ? (
        <View style={{ marginHorizontal: SPACING.md, marginBottom: SPACING.md }}>
          <UndoBanner flow={flow} theme={theme} />
        </View>
      ) : null}

      {groups.map((group) => {
        const counts = group.area === "staged" ? stagedStats : group.area === "untracked" ? null : unstagedStats;
        const sectionStats = group.files.map((file) => counts?.get(file.path));
        const largest = largestChange(sectionStats);
        return (
          <SectionCard
            key={group.area}
            icon={AREA_ICONS[group.area]}
            title={group.title}
            count={group.files.length}
            explanation={explainArea(group.area)}
            theme={theme}
          >
            {groupByFolder(group.files, (file) => file.path).map((folderGroup) => (
              <View key={folderGroup.folder} style={{ gap: SPACING.xs }}>
                <FolderLabel folder={folderGroup.folder} theme={theme} />
                {folderGroup.items.map((file) => {
                  const selected =
                    selection?.kind === "file" && selection.file.path === file.path && selection.file.area === group.area;
                  const word = describeWipChange(file, group.area);
                  return (
                    <FileCard
                      key={file.path}
                      path={file.path}
                      oldPath={file.origPath}
                      badge={changeBadge(word)}
                      stat={counts?.get(file.path)}
                      largestChange={largest}
                      selected={selected}
                      compact={narrow}
                      label={`Show ${group.area} changes in ${file.path}, ${word}`}
                      theme={theme}
                      onPress={() => setSelection({ kind: "file", file: { path: file.path, area: group.area } })}
                      actions={
                        narrow ? undefined : <FileActions path={file.path} area={group.area} flow={flow} theme={theme} iconOnly />
                      }
                    />
                  );
                })}
              </View>
            ))}
          </SectionCard>
        );
      })}
      {repoStatus.filesTruncated ? (
        <Text style={{ paddingHorizontal: SPACING.md, color: colors.foregroundMuted, fontSize: FONT_SIZE.small }}>
          Only the first {repoStatus.files.length} changed files are listed.
        </Text>
      ) : null}

      {syncData.toPush.length > 0 ? (
        <SectionCard icon="ArrowUp" title={toPush.title} count={syncData.toPush.length} explanation={toPush.explanation} theme={theme}>
          <CommitList
            commits={syncData.toPush}
            truncated={syncData.toPushTruncated}
            identity={identity.data}
            selectedHash={selectedHash}
            compact={condensed}
            now={now}
            theme={theme}
            onSelect={selectCommit}
          />
        </SectionCard>
      ) : null}

      {syncData.toPull.length > 0 ? (
        <SectionCard icon="ArrowDown" title={toPull.title} count={syncData.toPull.length} explanation={toPull.explanation} theme={theme}>
          <CommitList
            commits={syncData.toPull}
            truncated={syncData.toPullTruncated}
            identity={identity.data}
            selectedHash={selectedHash}
            compact={condensed}
            now={now}
            theme={theme}
            onSelect={selectCommit}
          />
        </SectionCard>
      ) : null}

      <BackupsCard target={target} theme={theme} now={now} onRestored={forgetRestored} />
    </ScrollView>
  );

  let detail = null;
  if (selectedFile !== null && !selectionGone) {
    detail = (
      <WipFileDiff
        key={`${selectedFile.area}:${selectedFile.path}`}
        target={target}
        file={selectedFile}
        worktreeToken={tokens?.worktreeToken}
        theme={theme}
        flow={flow}
        expand={narrow ? undefined : { expanded, onToggle: toggleExpanded }}
        onClose={narrow ? undefined : close}
      />
    );
  } else if (selection?.kind === "commit") {
    detail = (
      <CommitDetail
        key={selection.hash}
        target={target}
        hash={selection.hash}
        theme={theme}
        identity={identity.data}
        expand={narrow ? undefined : { expanded, onToggle: toggleExpanded }}
        onSelectCommit={selectCommit}
        onClose={narrow ? undefined : close}
      />
    );
  }

  if (reviewing) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.surface0 }} onLayout={onLayout}>
        <StatusBar status={repoStatus} theme={theme} />
        <ReviewMode
          target={target}
          status={repoStatus}
          worktreeToken={tokens?.worktreeToken}
          reviewed={reviewed}
          onReviewedChange={setReviewed}
          theme={theme}
          narrow={narrow}
          flow={flow}
          onExit={exitReview}
        />
        {flow.done ? (
          <View style={{ padding: SPACING.md }}>
            <UndoBanner flow={flow} theme={theme} />
          </View>
        ) : null}
        <ChangeConfirmModal flow={flow} theme={theme} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface0 }} onLayout={onLayout}>
      <StatusBar status={repoStatus} theme={theme} />
      {narrow ? (
        <>
          {list}
          <Modal
            title={selection?.kind === "commit" ? "Commit" : "File changes"}
            open={detail !== null && flow.pending === null}
            onOpenChange={(open) => {
              if (!open) close();
            }}
          >
            <Modal.Content scrollable={false} contentContainerStyle={{ padding: 0, gap: 0 }}>
              {detail}
            </Modal.Content>
          </Modal>
        </>
      ) : (
        <View style={{ flex: 1, flexDirection: "row" }}>
          <View style={{ flex: LIST_FLEX, display: expanded && detail ? "none" : "flex" }}>{list}</View>
          {detail ? (
            <View style={{ flex: DETAIL_FLEX, borderLeftWidth: DIVIDER_WIDTH, borderLeftColor: colors.border }}>{detail}</View>
          ) : null}
        </View>
      )}
      <ChangeConfirmModal flow={flow} theme={theme} />
    </View>
  );
}
