import type { PluginTheme } from "@getpaseo/plugin";
import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { NODE_SIZE } from "../../shared/constants";
import type { Identity } from "../../shared/contracts";
import { DIMMED_OPACITY, FONT_SIZE, laneColor, MINE_BAR_WIDTH, SPACING } from "../tokens";
import { AuthorBadge, RefChip } from "./CommitRow";

const BORDER_WIDTH = 1;
const RING_WIDTH = 2;
const SAMPLE_LANE = 0;
const LEGEND_ITEM_MIN_WIDTH = 220;

function Node({ hollow, fill }: { hollow: boolean; fill: string }) {
  const lane = laneColor(SAMPLE_LANE);
  return (
    <View
      style={{
        width: NODE_SIZE,
        height: NODE_SIZE,
        borderRadius: NODE_SIZE / 2,
        borderWidth: hollow ? RING_WIDTH : 0,
        borderColor: lane,
        backgroundColor: hollow ? fill : lane,
      }}
      accessibilityLabel={hollow ? "ring" : "dot"}
    />
  );
}

function Item({ sample, children, theme }: { sample: ReactNode; children: string; theme: PluginTheme }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.sm, minWidth: LEGEND_ITEM_MIN_WIDTH, flex: 1 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.xs }}>{sample}</View>
      <Text style={{ flexShrink: 1, color: theme.colors.foregroundMuted, fontSize: FONT_SIZE.small }}>{children}</Text>
    </View>
  );
}

/** Explains the graph's shapes, labels, and colors in plain words. */
export function Legend({ theme, identity }: { theme: PluginTheme; identity: Identity | undefined }) {
  const { colors } = theme;
  const lane = laneColor(SAMPLE_LANE);
  const who = identity?.email ?? identity?.name;
  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        gap: SPACING.sm,
        padding: SPACING.md,
        borderBottomWidth: BORDER_WIDTH,
        borderBottomColor: colors.border,
        backgroundColor: colors.surface1,
      }}
    >
      <Item theme={theme} sample={<Node hollow={false} fill={colors.surface1} />}>
        A commit. Lines connect it to its parent below.
      </Item>
      <Item theme={theme} sample={<Node hollow fill={colors.surface1} />}>
        A ring is a merge (two parents), or your uncommitted changes at the top.
      </Item>
      <Item theme={theme} sample={<RefChip gitRef={{ name: "main", kind: "branch", isCurrent: true }} lane={lane} theme={theme} />}>
        The branch you are on (checked out).
      </Item>
      <Item theme={theme} sample={<RefChip gitRef={{ name: "feature", kind: "branch", isCurrent: false }} lane={lane} theme={theme} />}>
        Another local branch.
      </Item>
      <Item theme={theme} sample={<RefChip gitRef={{ name: "origin/main", kind: "remote", isCurrent: false }} lane={lane} theme={theme} />}>
        A branch on the remote server.
      </Item>
      <Item theme={theme} sample={<RefChip gitRef={{ name: "v1.0", kind: "tag", isCurrent: false }} lane={lane} theme={theme} />}>
        A tag (a named release point).
      </Item>
      <Item
        theme={theme}
        sample={
          <>
            <View style={{ width: MINE_BAR_WIDTH, height: NODE_SIZE * 2, backgroundColor: colors.statusDanger }} />
            <AuthorBadge name={identity?.name ?? "You"} mine theme={theme} />
          </>
        }
      >
        {who
          ? `Red name and left bar: commits by you (${who}). In diffs, red lines are removed lines.`
          : "Set git user.email to see your own commits marked in red."}
      </Item>
      <Item theme={theme} sample={<Text style={{ opacity: DIMMED_OPACITY, color: colors.foreground }}>Abc</Text>}>
        Faded rows do not match the current search.
      </Item>
    </View>
  );
}
