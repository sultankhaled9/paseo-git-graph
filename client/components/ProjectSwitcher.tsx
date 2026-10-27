import type { PluginTheme } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import type { Folder, Project, RepoTarget } from "../../shared/contracts";
import type { FolderScan } from "../hooks/useFolderRepos";
import { targetKey } from "../hooks/useRepoQueries";
import { FONT_SIZE, ICON_SIZE, RADIUS, SPACING } from "../tokens";

interface ProjectSwitcherProps {
  projects: readonly Project[];
  folderScans: readonly FolderScan[];
  selectedKey: string | null;
  theme: PluginTheme;
  compact: boolean;
  onSelect(target: RepoTarget): void;
  onRemoveProject(project: Project): void;
  onRemoveFolder(folder: Folder): void;
}

interface EntryProps {
  label: string;
  detail?: string;
  selected: boolean;
  compact: boolean;
  theme: PluginTheme;
  onPress(): void;
  onRemove?: () => void;
}

function Entry({ label, detail, selected, compact, theme, onPress, onRemove }: EntryProps) {
  const { colors } = theme;
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        borderRadius: RADIUS.chip,
        backgroundColor: selected ? colors.surface2 : "transparent",
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Show ${label}`}
        accessibilityState={{ selected }}
        onPress={onPress}
        style={[
          { paddingHorizontal: SPACING.sm, paddingVertical: SPACING.sm, gap: SPACING.xs },
          compact ? null : { flex: 1 },
        ]}
      >
        <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: FONT_SIZE.body }}>
          {label}
        </Text>
        {compact || !detail ? null : (
          <Text numberOfLines={1} style={{ color: colors.foregroundMuted, fontSize: FONT_SIZE.small }}>
            {detail}
          </Text>
        )}
      </Pressable>
      {selected && onRemove ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Stop tracking ${label}`}
          onPress={onRemove}
          style={{ padding: SPACING.sm }}
        >
          <Icon name="Trash2" size={ICON_SIZE} color={colors.foregroundMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

function FolderGroup({
  scan,
  selectedKey,
  theme,
  compact,
  onSelect,
  onRemove,
}: {
  scan: FolderScan;
  selectedKey: string | null;
  theme: PluginTheme;
  compact: boolean;
  onSelect(target: RepoTarget): void;
  onRemove(folder: Folder): void;
}) {
  const { colors } = theme;
  const [expanded, setExpanded] = useState(true);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const { folder } = scan;
  const muted = { color: colors.foregroundMuted, fontSize: FONT_SIZE.small };
  const iconButton = { padding: SPACING.xs, borderRadius: RADIUS.chip };

  return (
    <View style={{ gap: SPACING.xs }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.xs }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${expanded ? "Collapse" : "Expand"} folder ${folder.name}`}
          accessibilityState={{ expanded }}
          onPress={() => setExpanded((open) => !open)}
          style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: SPACING.xs, paddingVertical: SPACING.xs }}
        >
          <Icon name={expanded ? "ChevronDown" : "ChevronRight"} size={ICON_SIZE} color={colors.foregroundMuted} />
          <Icon name="FolderGit2" size={ICON_SIZE} color={colors.foreground} />
          <Text numberOfLines={1} style={{ flexShrink: 1, color: colors.foreground, fontSize: FONT_SIZE.body, fontWeight: "600" }}>
            {folder.name}
          </Text>
          <Text style={muted}>({scan.scanned ? scan.repos.length : "..."})</Text>
        </Pressable>
        {scan.scanning ? (
          <ActivityIndicator accessibilityLabel={`Scanning ${folder.name}`} color={colors.foregroundMuted} />
        ) : (
          <Pressable accessibilityRole="button" accessibilityLabel={`Rescan ${folder.name}`} onPress={scan.rescan} style={iconButton}>
            <Icon name="RefreshCw" size={ICON_SIZE} color={colors.foregroundMuted} />
          </Pressable>
        )}
        {confirmingRemove ? (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Confirm removing folder ${folder.name}`}
              onPress={() => onRemove(folder)}
              style={[iconButton, { backgroundColor: colors.surface2 }]}
            >
              <Text style={{ color: colors.statusWarning, fontSize: FONT_SIZE.small }}>Remove</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Keep folder"
              onPress={() => setConfirmingRemove(false)}
              style={iconButton}
            >
              <Icon name="X" size={ICON_SIZE} color={colors.foregroundMuted} />
            </Pressable>
          </>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Stop tracking folder ${folder.name}`}
            onPress={() => setConfirmingRemove(true)}
            style={iconButton}
          >
            <Icon name="Trash2" size={ICON_SIZE} color={colors.foregroundMuted} />
          </Pressable>
        )}
      </View>
      {compact ? null : (
        <Text numberOfLines={1} style={[muted, { paddingLeft: SPACING.lg }]}>
          {folder.path}
        </Text>
      )}
      {expanded ? (
        <View
          style={{
            paddingLeft: compact ? 0 : SPACING.md,
            gap: SPACING.xs,
            flexDirection: compact ? "row" : "column",
            flexWrap: compact ? "wrap" : "nowrap",
          }}
        >
          {scan.error ? <Text style={{ color: colors.statusWarning, fontSize: FONT_SIZE.small }}>{scan.error}</Text> : null}
          {scan.scanned && scan.repos.length === 0 ? <Text style={muted}>No repositories found right now.</Text> : null}
          {scan.repos.map((repo) => {
            const target: RepoTarget = { kind: "folder-repo", folderId: folder.id, relativePath: repo.relativePath };
            return (
              <Entry
                key={repo.relativePath}
                label={repo.relativePath}
                selected={targetKey(target) === selectedKey}
                compact={compact}
                theme={theme}
                onPress={() => onSelect(target)}
              />
            );
          })}
          {scan.truncated ? <Text style={muted}>Showing the first {scan.repos.length} repositories.</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

/** Tracked repositories, then each tracked folder as a group of the repositories found in it. */
export function ProjectSwitcher({
  projects,
  folderScans,
  selectedKey,
  theme,
  compact,
  onSelect,
  onRemoveProject,
  onRemoveFolder,
}: ProjectSwitcherProps) {
  const { colors } = theme;
  if (projects.length === 0 && folderScans.length === 0) {
    return (
      <Text style={{ color: colors.foregroundMuted, fontSize: FONT_SIZE.small }}>
        No repositories or folders tracked yet.
      </Text>
    );
  }
  return (
    <View style={{ gap: SPACING.md }}>
      {projects.length > 0 ? (
        <View style={{ gap: SPACING.xs, flexDirection: compact ? "row" : "column", flexWrap: compact ? "wrap" : "nowrap" }}>
          {projects.map((project) => {
            const target: RepoTarget = { kind: "project", projectId: project.id };
            return (
              <Entry
                key={project.id}
                label={project.name}
                detail={project.path}
                selected={targetKey(target) === selectedKey}
                compact={compact}
                theme={theme}
                onPress={() => onSelect(target)}
                onRemove={() => onRemoveProject(project)}
              />
            );
          })}
        </View>
      ) : null}
      {folderScans.map((scan) => (
        <FolderGroup
          key={scan.folder.id}
          scan={scan}
          selectedKey={selectedKey}
          theme={theme}
          compact={compact}
          onSelect={onSelect}
          onRemove={onRemoveFolder}
        />
      ))}
    </View>
  );
}
