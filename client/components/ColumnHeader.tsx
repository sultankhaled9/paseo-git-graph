import type { PluginTheme } from "@getpaseo/plugin";
import { Text, View } from "react-native";
import { LANE_WIDTH } from "../../shared/constants";
import {
  AUTHOR_COLUMN_WIDTH,
  DATE_COLUMN_WIDTH,
  FONT_SIZE,
  HASH_COLUMN_WIDTH,
  REFS_COLUMN_WIDTH,
  SPACING,
} from "../tokens";

const BORDER_WIDTH = 1;

/** Column labels for the wide layout; widths mirror GraphRow so labels sit over their cells. */
export function ColumnHeader({ laneCount, theme }: { laneCount: number; theme: PluginTheme }) {
  const { colors } = theme;
  const label = { color: colors.foregroundMuted, fontSize: FONT_SIZE.small, fontWeight: "600" as const };
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: SPACING.sm,
        paddingHorizontal: SPACING.sm,
        paddingVertical: SPACING.xs,
        borderBottomWidth: BORDER_WIDTH,
        borderBottomColor: colors.border,
      }}
    >
      <Text numberOfLines={1} style={[label, { width: laneCount * LANE_WIDTH }]}>
        Graph
      </Text>
      <Text style={[label, { width: REFS_COLUMN_WIDTH }]}>Branch / Tag</Text>
      <Text style={[label, { flex: 1 }]}>Description</Text>
      <Text style={[label, { width: AUTHOR_COLUMN_WIDTH }]}>Author</Text>
      <Text style={[label, { width: DATE_COLUMN_WIDTH }]}>Date</Text>
      <Text style={[label, { width: HASH_COLUMN_WIDTH }]}>Commit</Text>
    </View>
  );
}
