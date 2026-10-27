import type { PluginTheme } from "@getpaseo/plugin";
import { memo } from "react";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { Pressable, Text } from "react-native";
import { ROW_HEIGHT } from "../../shared/constants";
import type { RepoStatus } from "../../shared/contracts";
import type { GraphRow } from "../../shared/graph-layout";
import { FONT_SIZE, ICON_SIZE, SPACING } from "../tokens";
import { LaneCell } from "./LaneCell";

interface WipRowProps {
  status: RepoStatus;
  row: GraphRow;
  laneCount: number;
  theme: PluginTheme;
  selected: boolean;
  compact: boolean;
  onPress(): void;
}

export function hasWorkInProgress(status: RepoStatus): boolean {
  return status.staged + status.unstaged + status.untracked + status.conflicted > 0;
}

/** Uncommitted changes, drawn as a hollow node whose lane runs down to the checked-out commit. */
export const WipRow = memo(function WipRow({
  status,
  row,
  laneCount,
  theme,
  selected,
  compact,
  onPress,
}: WipRowProps) {
  const { colors } = theme;
  const parts = [
    { count: status.conflicted, label: "conflicted", color: colors.statusWarning },
    { count: status.staged, label: "staged", color: colors.statusSuccess },
    { count: status.unstaged, label: "not staged", color: colors.foreground },
    { count: status.untracked, label: "untracked", color: colors.foregroundMuted },
  ].filter((part) => part.count > 0);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Uncommitted changes: ${parts.map((part) => `${part.count} ${part.label}`).join(", ")}. Show files`}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        height: ROW_HEIGHT,
        flexDirection: "row",
        alignItems: "center",
        gap: SPACING.sm,
        paddingHorizontal: SPACING.sm,
        backgroundColor: selected ? colors.surface2 : colors.surface0,
      }}
    >
      <LaneCell
        column={row.column}
        color={row.color}
        edges={row.edges}
        laneCount={laneCount}
        hollowFill={colors.surface0}
      />
      {status.conflicted > 0 ? <Icon name="TriangleAlert" size={ICON_SIZE} color={colors.statusWarning} /> : null}
      <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: FONT_SIZE.body, fontStyle: "italic" }}>
        {compact ? "Uncommitted" : "Uncommitted changes"}
      </Text>
      <Text numberOfLines={1} style={{ flex: 1, fontSize: FONT_SIZE.small }}>
        {parts.map((part, index) => (
          <Text key={part.label} style={{ color: part.color }}>
            {index > 0 ? ", " : ""}
            {part.count} {part.label}
          </Text>
        ))}
      </Text>
      {compact ? null : <Text style={{ color: colors.foregroundMuted, fontSize: FONT_SIZE.small }}>View changes</Text>}
      <Icon name="ChevronRight" size={ICON_SIZE} color={colors.foregroundMuted} />
    </Pressable>
  );
});
