import type { PluginTheme } from "@getpaseo/plugin";
import { memo } from "react";
import { Text, View } from "react-native";
import { ROW_HEIGHT } from "../../shared/constants";
import type { RepoStatus } from "../../shared/contracts";
import type { GraphRow } from "../../shared/graph-layout";
import { FONT_SIZE, SPACING } from "../tokens";
import { LaneCell } from "./LaneCell";

interface WipRowProps {
  status: RepoStatus;
  row: GraphRow;
  laneCount: number;
  theme: PluginTheme;
}

export function hasWorkInProgress(status: RepoStatus): boolean {
  return status.staged + status.unstaged + status.untracked + status.conflicted > 0;
}

/** Uncommitted changes, drawn as a hollow node whose lane runs down to the checked-out commit. */
export const WipRow = memo(function WipRow({ status, row, laneCount, theme }: WipRowProps) {
  const { colors } = theme;
  const parts = [
    { count: status.conflicted, label: "conflicted", color: colors.statusDanger },
    { count: status.staged, label: "staged", color: colors.statusSuccess },
    { count: status.unstaged, label: "unstaged", color: colors.statusWarning },
    { count: status.untracked, label: "untracked", color: colors.foregroundMuted },
  ].filter((part) => part.count > 0);
  return (
    <View
      accessibilityLabel={`Work in progress: ${parts.map((part) => `${part.count} ${part.label}`).join(", ")}`}
      style={{
        height: ROW_HEIGHT,
        flexDirection: "row",
        alignItems: "center",
        gap: SPACING.sm,
        paddingHorizontal: SPACING.sm,
      }}
    >
      <LaneCell
        column={row.column}
        color={row.color}
        edges={row.edges}
        laneCount={laneCount}
        hollowFill={colors.surface0}
      />
      <Text style={{ color: colors.foreground, fontSize: FONT_SIZE.body, fontStyle: "italic" }}>WIP</Text>
      {parts.map((part) => (
        <Text key={part.label} style={{ color: part.color, fontSize: FONT_SIZE.small }}>
          {part.count} {part.label}
        </Text>
      ))}
    </View>
  );
});
