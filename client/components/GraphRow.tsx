import type { PluginTheme } from "@getpaseo/plugin";
import { memo } from "react";
import { Pressable, Text, View } from "react-native";
import { ROW_HEIGHT } from "../../shared/constants";
import type { CommitSummary, Ref } from "../../shared/contracts";
import type { GraphRow as GraphRowLayout } from "../../shared/graph-layout";
import { formatDate, shortHash } from "../format";
import {
  AUTHOR_COLUMN_WIDTH,
  DATE_COLUMN_WIDTH,
  FONT_SIZE,
  HASH_COLUMN_WIDTH,
  MONO_FONT,
  RADIUS,
  SPACING,
} from "../tokens";
import { LaneCell } from "./LaneCell";

const MAX_VISIBLE_REFS = 3;
const CHIP_BORDER_WIDTH = 1;

function chipColors(ref: Ref, theme: PluginTheme): { background: string; foreground: string } {
  const { colors } = theme;
  if (ref.isCurrent || ref.kind === "head") {
    return { background: colors.accent, foreground: colors.accentForeground };
  }
  if (ref.kind === "tag") return { background: colors.surface2, foreground: colors.statusWarning };
  if (ref.kind === "remote") return { background: colors.surface1, foreground: colors.foregroundMuted };
  return { background: colors.surface2, foreground: colors.foreground };
}

function RefChip({ gitRef, theme }: { gitRef: Ref; theme: PluginTheme }) {
  const { background, foreground } = chipColors(gitRef, theme);
  return (
    <View
      style={{
        paddingHorizontal: SPACING.xs,
        borderRadius: RADIUS.chip,
        borderWidth: CHIP_BORDER_WIDTH,
        borderColor: theme.colors.border,
        backgroundColor: background,
      }}
    >
      <Text numberOfLines={1} style={{ color: foreground, fontSize: FONT_SIZE.small }}>
        {gitRef.kind === "tag" ? `tag ${gitRef.name}` : gitRef.name}
      </Text>
    </View>
  );
}

interface GraphRowProps {
  commit: CommitSummary;
  row: GraphRowLayout;
  laneCount: number;
  theme: PluginTheme;
  compact: boolean;
  selected: boolean;
  onSelect(hash: string): void;
}

export const GraphRow = memo(function GraphRow({
  commit,
  row,
  laneCount,
  theme,
  compact,
  selected,
  onSelect,
}: GraphRowProps) {
  const { colors } = theme;
  const visibleRefs = commit.refs.slice(0, MAX_VISIBLE_REFS);
  const hiddenRefs = commit.refs.length - visibleRefs.length;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Commit ${shortHash(commit.hash)}: ${commit.subject}, by ${commit.authorName}`}
      accessibilityState={{ selected }}
      onPress={() => onSelect(commit.hash)}
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
        hollowFill={commit.parents.length > 1 ? colors.surface0 : undefined}
      />
      {visibleRefs.map((gitRef) => (
        <RefChip key={`${gitRef.kind}:${gitRef.name}`} gitRef={gitRef} theme={theme} />
      ))}
      {hiddenRefs > 0 ? (
        <Text style={{ color: colors.foregroundMuted, fontSize: FONT_SIZE.small }}>+{hiddenRefs}</Text>
      ) : null}
      <Text numberOfLines={1} style={{ flex: 1, color: colors.foreground, fontSize: FONT_SIZE.body }}>
        {commit.subject}
      </Text>
      {compact ? null : (
        <>
          <Text
            numberOfLines={1}
            style={{ width: AUTHOR_COLUMN_WIDTH, color: colors.foregroundMuted, fontSize: FONT_SIZE.small }}
          >
            {commit.authorName}
          </Text>
          <Text
            numberOfLines={1}
            style={{ width: DATE_COLUMN_WIDTH, color: colors.foregroundMuted, fontSize: FONT_SIZE.small }}
          >
            {formatDate(commit.authorDate)}
          </Text>
        </>
      )}
      <Text
        style={{
          width: HASH_COLUMN_WIDTH,
          color: colors.foregroundMuted,
          fontSize: FONT_SIZE.small,
          fontFamily: MONO_FONT,
        }}
      >
        {shortHash(commit.hash)}
      </Text>
    </Pressable>
  );
});
