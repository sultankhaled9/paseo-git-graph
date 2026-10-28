import type { PluginTheme } from "@getpaseo/plugin";
import { copyText, Icon, useToast } from "@getpaseo/plugin/client/react-native";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { isMine } from "../../shared/author";
import type {
  ChangeType,
  CommitDetail as CommitDetailData,
  FileChange,
  Identity,
  RepoTarget,
} from "../../shared/contracts";
import { formatDate, shortHash } from "../../shared/format";
import { useCommitDetail, useFileDiff } from "../hooks/useRepoQueries";
import { FONT_SIZE, ICON_SIZE, MONO_FONT, RADIUS, SPACING } from "../tokens";
import { DiffPane, type ExpandControl } from "./DiffView";

interface CommitDetailProps {
  target: RepoTarget;
  hash: string;
  theme: PluginTheme;
  identity: Identity | undefined;
  expand?: ExpandControl;
  onSelectCommit(hash: string): void;
  onClose?: () => void;
}

type ThemeColor = keyof PluginTheme["colors"];

const CHANGE_STYLES: Readonly<Record<ChangeType, { icon: string; label: string; color: ThemeColor }>> = {
  added: { icon: "FilePlus", label: "added", color: "statusSuccess" },
  modified: { icon: "FilePen", label: "modified", color: "foreground" },
  deleted: { icon: "FileMinus", label: "deleted", color: "statusWarning" },
  renamed: { icon: "ArrowRightLeft", label: "renamed", color: "accent" },
  copied: { icon: "CopyPlus", label: "copied", color: "accent" },
  "type-changed": { icon: "FileType", label: "type changed", color: "foregroundMuted" },
};

function fileLabel(file: FileChange): string {
  return file.oldPath ? `${file.oldPath} -> ${file.path}` : file.path;
}

function sameFile(a: FileChange | null, b: FileChange): boolean {
  return a !== null && a.path === b.path && a.oldPath === b.oldPath;
}

function Header({
  detail,
  mine,
  theme,
  selectedFile,
  onSelectFile,
  onSelectCommit,
  onClose,
  onCopy,
}: {
  detail: CommitDetailData;
  mine: boolean;
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
          Author:{" "}
          <Text style={mine ? { color: colors.statusDanger, fontWeight: "600" } : undefined}>
            {detail.authorName}
            {mine ? " (you)" : ""}
          </Text>{" "}
          &lt;{detail.authorEmail}&gt;, {formatDate(detail.authorDate)}
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
          const change = CHANGE_STYLES[file.change];
          return (
            <Pressable
              key={fileLabel(file)}
              accessibilityRole="button"
              accessibilityLabel={`Show diff for ${fileLabel(file)}, ${change.label}`}
              accessibilityState={{ selected }}
              onPress={() => onSelectFile(file)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: SPACING.sm,
                paddingHorizontal: SPACING.sm,
                paddingVertical: SPACING.xs,
                borderRadius: RADIUS.chip,
                backgroundColor: selected ? colors.surface2 : colors.surface1,
              }}
            >
              <Icon name={change.icon} size={ICON_SIZE} color={colors[change.color]} />
              <Text numberOfLines={1} style={{ flex: 1, color: colors.foreground, fontSize: FONT_SIZE.small }}>
                {fileLabel(file)}
              </Text>
              <Text style={{ color: colors[change.color], fontSize: FONT_SIZE.small }}>{change.label}</Text>
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

/** Commit metadata, changed files, and the selected file's diff. */
export function CommitDetail({ target, hash, theme, identity, expand, onSelectCommit, onClose }: CommitDetailProps) {
  const { colors } = theme;
  const toast = useToast();
  const detail = useCommitDetail(target, hash);
  const [selectedFile, setSelectedFile] = useState<FileChange | null>(null);
  const diff = useFileDiff(target, hash, selectedFile);

  const onCopy = useCallback(() => {
    copyText(hash).then(
      () => toast.show("Commit hash copied"),
      () => toast.error("Could not copy the commit hash"),
    );
  }, [hash, toast]);

  if (detail.error) {
    return <Text style={{ padding: SPACING.md, color: colors.statusDanger }}>{detail.error.message}</Text>;
  }
  if (!detail.data) {
    return <ActivityIndicator style={{ marginTop: SPACING.xl }} color={colors.foregroundMuted} />;
  }

  return (
    <DiffPane
      expand={expand}
      header={
        <Header
          detail={detail.data}
          mine={isMine({ name: detail.data.authorName, email: detail.data.authorEmail }, identity)}
          theme={theme}
          selectedFile={selectedFile}
          onSelectFile={setSelectedFile}
          onSelectCommit={onSelectCommit}
          onClose={onClose}
          onCopy={onCopy}
        />
      }
      text={diff.data?.text}
      truncated={diff.data?.truncated ?? false}
      loading={diff.isFetching}
      error={diff.error}
      theme={theme}
    />
  );
}
