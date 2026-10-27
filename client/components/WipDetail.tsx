import type { PluginTheme } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { RepoStatus, RepoTarget } from "../../shared/contracts";
import { describeWipChange, groupWorkInProgress } from "../../shared/status-text";
import { useWipDiff, type WipSelection } from "../hooks/useRepoQueries";
import { FONT_SIZE, ICON_SIZE, RADIUS, SPACING } from "../tokens";
import { DiffPane } from "./DiffView";

interface WipDetailProps {
  target: RepoTarget;
  status: RepoStatus;
  worktreeToken: string | undefined;
  theme: PluginTheme;
  onClose?: () => void;
}

function sameSelection(a: WipSelection | null, b: WipSelection): boolean {
  return a !== null && a.path === b.path && a.area === b.area;
}

/** Uncommitted changes grouped by area, with the selected file's diff. */
export function WipDetail({ target, status, worktreeToken, theme, onClose }: WipDetailProps) {
  const { colors } = theme;
  const groups = useMemo(() => groupWorkInProgress(status.files), [status.files]);
  const [selection, setSelection] = useState<WipSelection | null>(null);
  const stillChanged =
    selection !== null &&
    groups.some((group) => group.area === selection.area && group.files.some((file) => file.path === selection.path));
  const activeSelection = stillChanged ? selection : null;
  const diff = useWipDiff(target, activeSelection, worktreeToken);
  const muted = { color: colors.foregroundMuted, fontSize: FONT_SIZE.small };

  const header = (
    <View style={{ padding: SPACING.md, gap: SPACING.md }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.sm }}>
        <Text style={{ flex: 1, color: colors.foreground, fontSize: FONT_SIZE.title, fontWeight: "600" }}>
          Uncommitted changes
        </Text>
        {onClose ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close uncommitted changes"
            onPress={onClose}
            style={{ padding: SPACING.xs, borderRadius: RADIUS.chip, backgroundColor: colors.surface2 }}
          >
            <Icon name="X" size={ICON_SIZE} color={colors.foreground} />
          </Pressable>
        ) : null}
      </View>
      <Text style={muted}>Changes in your working folder that are not committed yet. Select a file to see what changed.</Text>
      {selection !== null && !stillChanged ? (
        <Text style={{ color: colors.statusWarning, fontSize: FONT_SIZE.small }}>
          {selection.path} has no {selection.area} changes anymore.
        </Text>
      ) : null}
      {groups.map((group) => (
        <View key={group.area} style={{ gap: SPACING.xs }}>
          <Text style={{ color: colors.foreground, fontSize: FONT_SIZE.small, fontWeight: "600" }}>
            {group.title} ({group.files.length})
          </Text>
          {group.files.map((file) => {
            const entry = { path: file.path, area: group.area };
            const selected = sameSelection(activeSelection, entry);
            return (
              <Pressable
                key={`${group.area}:${file.path}`}
                accessibilityRole="button"
                accessibilityLabel={`Show ${group.area} diff for ${file.path}`}
                accessibilityState={{ selected }}
                onPress={() => setSelection(entry)}
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
                  {file.origPath ? `${file.origPath} -> ${file.path}` : file.path}
                </Text>
                <Text style={muted}>{describeWipChange(file, group.area)}</Text>
              </Pressable>
            );
          })}
        </View>
      ))}
      {status.filesTruncated ? (
        <Text style={muted}>Only the first {status.files.length} changed files are listed.</Text>
      ) : null}
    </View>
  );

  return (
    <DiffPane
      header={header}
      text={activeSelection ? diff.data?.text : undefined}
      truncated={diff.data?.truncated ?? false}
      loading={activeSelection !== null && !diff.data && diff.isFetching}
      error={activeSelection ? diff.error : null}
      theme={theme}
    />
  );
}
