import type { PluginTheme } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { memo } from "react";
import { Pressable, Text, View } from "react-native";
import { ROW_HEIGHT } from "../../shared/constants";
import type { CommitSummary, Ref } from "../../shared/contracts";
import { formatDate, formatRelative, initials, shortHash } from "../../shared/format";
import type { GraphRow as GraphRowLayout } from "../../shared/graph-layout";
import {
  AUTHOR_BADGE_SIZE,
  AUTHOR_COLUMN_WIDTH,
  authorColor,
  CHIP_ICON_SIZE,
  DATE_COLUMN_WIDTH,
  DIMMED_OPACITY,
  FONT_SIZE,
  HASH_COLUMN_WIDTH,
  laneColor,
  MINE_BAR_WIDTH,
  MONO_FONT,
  ON_LANE_TEXT,
  RADIUS,
  REFS_COLUMN_WIDTH,
  SPACING,
} from "../tokens";
import { LaneCell } from "./LaneCell";

const MAX_VISIBLE_REFS = 3;
const CHIP_BORDER_WIDTH = 1;
const BADGE_FONT_SIZE = 9;

const REF_ICONS: Readonly<Record<Ref["kind"], string>> = {
  branch: "GitBranch",
  remote: "Cloud",
  tag: "Tag",
  head: "CircleDot",
  other: "Bookmark",
};

/** A branch, remote, or tag label in its lane's color; the checked-out branch is filled. */
export function RefChip({ gitRef, lane, theme }: { gitRef: Ref; lane: string; theme: PluginTheme }) {
  const filled = gitRef.isCurrent;
  const textColor = filled ? ON_LANE_TEXT : theme.colors.foreground;
  return (
    <View
      accessibilityLabel={`${gitRef.isCurrent ? "current branch" : gitRef.kind} ${gitRef.name}`}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: SPACING.xs,
        paddingHorizontal: SPACING.xs,
        borderRadius: RADIUS.chip,
        borderWidth: CHIP_BORDER_WIDTH,
        borderColor: lane,
        backgroundColor: filled ? lane : theme.colors.surface1,
        flexShrink: 1,
        minWidth: 0,
      }}
    >
      <Icon
        name={gitRef.isCurrent ? "Check" : REF_ICONS[gitRef.kind]}
        size={CHIP_ICON_SIZE}
        color={filled ? ON_LANE_TEXT : lane}
      />
      <Text numberOfLines={1} style={{ flexShrink: 1, color: textColor, fontSize: FONT_SIZE.small }}>
        {gitRef.name}
      </Text>
    </View>
  );
}

export function AuthorBadge({ name, mine, theme }: { name: string; mine: boolean; theme: PluginTheme }) {
  return (
    <View
      style={{
        width: AUTHOR_BADGE_SIZE,
        height: AUTHOR_BADGE_SIZE,
        borderRadius: AUTHOR_BADGE_SIZE / 2,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: mine ? theme.colors.statusDanger : authorColor(name),
      }}
    >
      <Text style={{ color: ON_LANE_TEXT, fontSize: BADGE_FONT_SIZE, fontWeight: "700" }}>{initials(name)}</Text>
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
  mine: boolean;
  now: number;
  dimmed: boolean;
  focused: boolean;
  onSelect(hash: string): void;
}

export const GraphRow = memo(function GraphRow({
  commit,
  row,
  laneCount,
  theme,
  compact,
  selected,
  mine,
  now,
  dimmed,
  focused,
  onSelect,
}: GraphRowProps) {
  const { colors } = theme;
  const lane = laneColor(row.color);
  const visibleRefs = commit.refs.slice(0, MAX_VISIBLE_REFS);
  const hiddenRefs = commit.refs.length - visibleRefs.length;
  const authorTextColor = mine ? colors.statusDanger : colors.foregroundMuted;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Commit ${shortHash(commit.hash)}: ${commit.subject}, by ${commit.authorName}${mine ? " (you)" : ""}, ${formatDate(commit.authorDate)}`}
      accessibilityState={{ selected }}
      onPress={() => onSelect(commit.hash)}
      style={{
        height: ROW_HEIGHT,
        flexDirection: "row",
        alignItems: "center",
        gap: SPACING.sm,
        paddingHorizontal: SPACING.sm,
        opacity: dimmed ? DIMMED_OPACITY : 1,
        backgroundColor: selected ? colors.surface2 : focused ? colors.surface1 : colors.surface0,
      }}
    >
      {mine ? (
        <View
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: MINE_BAR_WIDTH,
            backgroundColor: colors.statusDanger,
          }}
        />
      ) : null}
      <LaneCell
        column={row.column}
        color={row.color}
        edges={row.edges}
        laneCount={laneCount}
        hollowFill={commit.parents.length > 1 ? colors.surface0 : undefined}
      />
      <View
        style={[
          { flexDirection: "row", alignItems: "center", gap: SPACING.xs, overflow: "hidden" },
          compact ? { flexShrink: 1, maxWidth: REFS_COLUMN_WIDTH } : { width: REFS_COLUMN_WIDTH },
        ]}
      >
        {visibleRefs.map((gitRef) => (
          <RefChip key={`${gitRef.kind}:${gitRef.name}`} gitRef={gitRef} lane={lane} theme={theme} />
        ))}
        {hiddenRefs > 0 ? (
          <Text style={{ color: colors.foregroundMuted, fontSize: FONT_SIZE.small }}>+{hiddenRefs}</Text>
        ) : null}
      </View>
      <Text numberOfLines={1} style={{ flex: 1, color: colors.foreground, fontSize: FONT_SIZE.body }}>
        {commit.subject}
      </Text>
      {compact ? (
        <AuthorBadge name={commit.authorName} mine={mine} theme={theme} />
      ) : (
        <>
          <View style={{ width: AUTHOR_COLUMN_WIDTH, flexDirection: "row", alignItems: "center", gap: SPACING.xs }}>
            <AuthorBadge name={commit.authorName} mine={mine} theme={theme} />
            <Text
              numberOfLines={1}
              style={{ flex: 1, color: authorTextColor, fontSize: FONT_SIZE.small, fontWeight: mine ? "600" : "400" }}
            >
              {commit.authorName}
            </Text>
          </View>
          <Text
            numberOfLines={1}
            style={{ width: DATE_COLUMN_WIDTH, color: colors.foregroundMuted, fontSize: FONT_SIZE.small }}
          >
            {formatRelative(commit.authorDate, now)}
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
