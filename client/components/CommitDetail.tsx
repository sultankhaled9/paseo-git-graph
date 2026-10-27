import type { PluginTheme } from "@getpaseo/plugin";
import { copyText, FlatList, Icon, useToast } from "@getpaseo/plugin/client/react-native";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, type ListRenderItem, Pressable, Text, View } from "react-native";
import type { CommitDetail as CommitDetailData, FileChange, RepoTarget } from "../../shared/contracts";
import { formatDate, shortHash } from "../format";
import { useCommitDetail, useFileDiff } from "../hooks/useRepoQueries";
import { FONT_SIZE, ICON_SIZE, MONO_FONT, RADIUS, SPACING } from "../tokens";
import { DiffLine } from "./DiffView";

const DIVIDER_WIDTH = 1;
const NO_LINES: readonly string[] = [];

interface CommitDetailProps {
  target: RepoTarget;
  hash: string;
  theme: PluginTheme;
  onSelectCommit(hash: string): void;
  onClose?: () => void;
}

function fileLabel(file: FileChange): string {
  return file.oldPath ? `${file.oldPath} -> ${file.path}` : file.path;
}

function lineKey(_: string, index: number): string {
  return String(index);
}

function sameFile(a: FileChange | null, b: FileChange): boolean {
  return a !== null && a.path === b.path && a.oldPath === b.oldPath;
}

function Header({
  detail,
  theme,
  selectedFile,
  onSelectFile,
  onSelectCommit,
  onClose,
  onCopy,
}: {
  detail: CommitDetailData;
  theme: PluginTheme;
  selectedFile: FileChange | null;
  onSelectFile(file: FileChange): void;
  onSelectCommit(hash: string): void;
  onClose?: () => void;
  onCopy(): void;
}) {
  const { colors } = theme;
  const muted = { color: colors.foregroundMuted, fontSize: FONT_SIZE.small };
  const committedSeparately =
    detail.committerName !== detail.authorName || detail.committerDate !== detail.authorDate;
  const chip = {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.chip,
    backgroundColor: colors.surface2,
  };
  return (
    <View style={{ padding: SPACING.md, gap: SPACING.md }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.sm }}>
        <Text style={{ flex: 1, color: colors.foreground, fontFamily: MONO_FONT, fontSize: FONT_SIZE.body }}>
          {shortHash(detail.hash)}
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Copy commit hash" onPress={onCopy} style={chip}>
          <Icon name="Copy" size={ICON_SIZE} color={colors.foreground} />
        </Pressable>
        {onClose ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Close commit details" onPress={onClose} style={chip}>
            <Icon name="X" size={ICON_SIZE} color={colors.foreground} />
          </Pressable>
        ) : null}
      </View>

      <Text selectable style={{ color: colors.foreground, fontSize: FONT_SIZE.body }}>
        {detail.message}
      </Text>

      <View style={{ gap: SPACING.xs }}>
        <Text style={muted}>
          Author: {detail.authorName} &lt;{detail.authorEmail}&gt;, {formatDate(detail.authorDate)}
        </Text>
        {committedSeparately ? (
          <Text style={muted}>
            Committer: {detail.committerName} &lt;{detail.committerEmail}&gt;, {formatDate(detail.committerDate)}
          </Text>
        ) : null}
      </View>

      {detail.parents.length > 0 ? (
        <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: SPACING.sm }}>
          <Text style={muted}>{detail.parents.length > 1 ? "Parents" : "Parent"}</Text>
          {detail.parents.map((parent) => (
            <Pressable
              key={parent}
              accessibilityRole="button"
              accessibilityLabel={`Show parent commit ${shortHash(parent)}`}
              onPress={() => onSelectCommit(parent)}
              style={chip}
            >
              <Text style={{ color: colors.accent, fontFamily: MONO_FONT, fontSize: FONT_SIZE.small }}>
                {shortHash(parent)}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={{ gap: SPACING.xs }}>
        <Text style={muted}>
          {detail.files.length} {detail.files.length === 1 ? "file" : "files"} changed
          {detail.parents.length > 1 ? " (against first parent)" : ""}
        </Text>
        {detail.files.map((file) => {
          const selected = sameFile(selectedFile, file);
          return (
            <Pressable
              key={fileLabel(file)}
              accessibilityRole="button"
              accessibilityLabel={`Show diff for ${fileLabel(file)}`}
              accessibilityState={{ selected }}
              onPress={() => onSelectFile(file)}
              style={{
                flexDirection: "row",
                gap: SPACING.sm,
                paddingHorizontal: SPACING.sm,
                paddingVertical: SPACING.xs,
                borderRadius: RADIUS.chip,
                backgroundColor: selected ? colors.surface2 : colors.surface1,
              }}
            >
              <Text numberOfLines={1} style={{ flex: 1, color: colors.foreground, fontSize: FONT_SIZE.small }}>
                {fileLabel(file)}
              </Text>
              {file.additions === null || file.deletions === null ? (
                <Text style={muted}>binary</Text>
              ) : (
                <>
                  <Text style={{ color: colors.statusSuccess, fontSize: FONT_SIZE.small }}>+{file.additions}</Text>
                  <Text style={{ color: colors.statusDanger, fontSize: FONT_SIZE.small }}>-{file.deletions}</Text>
                </>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Commit metadata, changed files, and the selected file's diff in one virtualized list. */
export function CommitDetail({ target, hash, theme, onSelectCommit, onClose }: CommitDetailProps) {
  const { colors } = theme;
  const toast = useToast();
  const detail = useCommitDetail(target, hash);
  const [selectedFile, setSelectedFile] = useState<FileChange | null>(null);
  const diff = useFileDiff(target, hash, selectedFile);
  const diffText = diff.data?.text;
  const lines = useMemo(() => (diffText === undefined ? NO_LINES : diffText.split("\n")), [diffText]);

  const onCopy = useCallback(() => {
    copyText(hash).then(
      () => toast.show("Commit hash copied"),
      () => toast.error("Could not copy the commit hash"),
    );
  }, [hash, toast]);
  const renderLine = useCallback<ListRenderItem<string>>(
    ({ item }) => <DiffLine line={item} theme={theme} />,
    [theme],
  );

  if (detail.error) {
    return <Text style={{ padding: SPACING.md, color: colors.statusDanger }}>{detail.error.message}</Text>;
  }
  if (!detail.data) {
    return <ActivityIndicator style={{ marginTop: SPACING.xl }} color={colors.foregroundMuted} />;
  }

  let footer = null;
  if (diff.error) {
    footer = <Text style={{ padding: SPACING.md, color: colors.statusDanger }}>{diff.error.message}</Text>;
  } else if (diff.isFetching) {
    footer = <ActivityIndicator style={{ marginVertical: SPACING.md }} color={colors.foregroundMuted} />;
  } else if (diff.data?.truncated) {
    footer = (
      <Text style={{ padding: SPACING.md, color: colors.statusWarning, fontSize: FONT_SIZE.small }}>
        Diff truncated. Open the file in an editor to see the rest.
      </Text>
    );
  }

  return (
    <FlatList
      data={lines}
      renderItem={renderLine}
      keyExtractor={lineKey}
      ListHeaderComponent={
        <View style={{ borderBottomWidth: lines.length > 0 ? DIVIDER_WIDTH : 0, borderBottomColor: colors.border }}>
          <Header
            detail={detail.data}
            theme={theme}
            selectedFile={selectedFile}
            onSelectFile={setSelectedFile}
            onSelectCommit={onSelectCommit}
            onClose={onClose}
            onCopy={onCopy}
          />
        </View>
      }
      ListFooterComponent={footer}
    />
  );
}
