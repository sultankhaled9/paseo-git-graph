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
import type { CommitSummary, Identity, RepoTarget, WipArea } from "../../shared/contracts";
import { describeWipChange, groupWorkInProgress } from "../../shared/status-text";
import { useNow } from "../hooks/useNow";
import { useRepoState, useSyncCommits, useWipDiff, type WipSelection } from "../hooks/useRepoQueries";
import { FONT_SIZE, ICON_SIZE, NARROW_LAYOUT_WIDTH, RADIUS, SPACING } from "../tokens";
import { CommitDetail } from "./CommitDetail";
import { CommitRow } from "./CommitRow";
import { DiffPane } from "./DiffView";
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

function Section({
  icon,
  title,
  explanation,
  theme,
  children,
}: {
  icon: string;
  title: string;
  explanation: string;
  theme: PluginTheme;
  children: ReactNode;
}) {
  const { colors } = theme;
  return (
    <View style={{ gap: SPACING.xs, paddingVertical: SPACING.sm }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.sm, paddingHorizontal: SPACING.md }}>
        <Icon name={icon} size={ICON_SIZE} color={colors.foreground} />
        <Text style={{ color: colors.foreground, fontSize: FONT_SIZE.body, fontWeight: "700" }}>{title}</Text>
      </View>
      <Text style={{ paddingHorizontal: SPACING.md, color: colors.foregroundMuted, fontSize: FONT_SIZE.small }}>
        {explanation}
      </Text>
      <View>{children}</View>
    </View>
  );
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
  onClose,
}: {
  target: RepoTarget;
  file: WipSelection;
  worktreeToken: string | undefined;
  theme: PluginTheme;
  onClose?: () => void;
}) {
  const { colors } = theme;
  const diff = useWipDiff(target, file, worktreeToken);
  const header = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.sm, padding: SPACING.md }}>
      <Text numberOfLines={1} style={{ flex: 1, color: colors.foreground, fontSize: FONT_SIZE.body, fontWeight: "600" }}>
        {file.path}
      </Text>
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
 * files by kind, commits not pushed yet, and commits to pull. Read-only; it explains next steps.
 */
export function ChangesView({ target, theme, compact }: { target: RepoTarget; theme: PluginTheme; compact: boolean }) {
  const { colors } = theme;
  const now = useNow();
  const { tokens, revision, status, identity } = useRepoState(target);
  const sync = useSyncCommits(target, tokens?.refsToken);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [width, setWidth] = useState<number | null>(null);
  const onLayout = useCallback((event: LayoutChangeEvent) => setWidth(Math.round(event.nativeEvent.layout.width)), []);
  const narrow = compact || (width !== null && width < NARROW_LAYOUT_WIDTH);
  const condensed = narrow || selection !== null;
  const close = useCallback(() => setSelection(null), []);
  const selectCommit = useCallback((hash: string) => setSelection({ kind: "commit", hash }), []);
  const groups = useMemo(() => groupWorkInProgress(status.data?.files ?? []), [status.data?.files]);

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

  const list = (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: SPACING.xl }}>
      <View
        style={{
          margin: SPACING.md,
          padding: SPACING.md,
          borderRadius: RADIUS.card,
          backgroundColor: colors.surface1,
        }}
      >
        <Text style={{ color: colors.foreground, fontSize: FONT_SIZE.title, fontWeight: "600" }}>
          {summarizeChanges(repoStatus, syncData)}
        </Text>
        {noRemote ? (
          <Text style={{ marginTop: SPACING.xs, color: colors.foregroundMuted, fontSize: FONT_SIZE.small }}>{noRemote}</Text>
        ) : null}
      </View>

      {groups.map((group) => (
        <Section
          key={group.area}
          icon={AREA_ICONS[group.area]}
          title={`${group.title} (${group.files.length})`}
          explanation={explainArea(group.area)}
          theme={theme}
        >
          {group.files.map((file) => {
            const entry = { path: file.path, area: group.area };
            const selected =
              selection?.kind === "file" && selection.file.path === file.path && selection.file.area === group.area;
            return (
              <Pressable
                key={`${group.area}:${file.path}`}
                accessibilityRole="button"
                accessibilityLabel={`Show ${group.area} changes in ${file.path}`}
                accessibilityState={{ selected }}
                onPress={() => setSelection({ kind: "file", file: entry })}
                style={{
                  flexDirection: "row",
                  gap: SPACING.sm,
                  paddingHorizontal: SPACING.md,
                  paddingVertical: SPACING.xs,
                  backgroundColor: selected ? colors.surface2 : colors.surface0,
                }}
              >
                <Text numberOfLines={1} style={{ flex: 1, color: colors.foreground, fontSize: FONT_SIZE.small }}>
                  {file.origPath ? `${file.origPath} -> ${file.path}` : file.path}
                </Text>
                <Text style={{ color: colors.foregroundMuted, fontSize: FONT_SIZE.small }}>
                  {describeWipChange(file, group.area)}
                </Text>
              </Pressable>
            );
          })}
        </Section>
      ))}
      {repoStatus.filesTruncated ? (
        <Text style={{ paddingHorizontal: SPACING.md, color: colors.foregroundMuted, fontSize: FONT_SIZE.small }}>
          Only the first {repoStatus.files.length} changed files are listed.
        </Text>
      ) : null}

      {syncData.toPush.length > 0 ? (
        <Section icon="ArrowUp" title={`${toPush.title} (${syncData.toPush.length})`} explanation={toPush.explanation} theme={theme}>
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
        </Section>
      ) : null}

      {syncData.toPull.length > 0 ? (
        <Section icon="ArrowDown" title={`${toPull.title} (${syncData.toPull.length})`} explanation={toPull.explanation} theme={theme}>
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
        </Section>
      ) : null}
    </ScrollView>
  );

  let detail = null;
  if (selection?.kind === "file") {
    detail = (
      <WipFileDiff
        key={`${selection.file.area}:${selection.file.path}`}
        target={target}
        file={selection.file}
        worktreeToken={tokens?.worktreeToken}
        theme={theme}
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
        onSelectCommit={selectCommit}
        onClose={narrow ? undefined : close}
      />
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
            open={detail !== null}
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
          <View style={{ flex: LIST_FLEX }}>{list}</View>
          {detail ? (
            <View style={{ flex: DETAIL_FLEX, borderLeftWidth: DIVIDER_WIDTH, borderLeftColor: colors.border }}>{detail}</View>
          ) : null}
        </View>
      )}
    </View>
  );
}
