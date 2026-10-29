import type { PluginTheme } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/client/react-native";
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import type { RepoStatus } from "../../shared/contracts";
import { describeHead } from "../../shared/status-text";
import { FONT_SIZE, ICON_SIZE, RADIUS, SPACING } from "../tokens";

const BORDER_WIDTH = 1;

/** The "what is now" line in plain words, e.g. "On main, 2 ahead and 1 behind origin/main". */
export function StatusBar({
  status,
  theme,
  actions,
  onPressHead,
}: {
  status: RepoStatus;
  theme: PluginTheme;
  actions?: ReactNode;
  /** When set, the line is a button that opens the branch picker. */
  onPressHead?: () => void;
}) {
  const { colors } = theme;
  const head = describeHead(status);
  const line = (
    <>
      <Icon name={status.detached ? "CircleDot" : "GitBranch"} size={ICON_SIZE} color={colors.foreground} />
      <Text style={{ flexShrink: 1, color: colors.foregroundMuted, fontSize: FONT_SIZE.body }}>
        {head.lead}{" "}
        <Text style={{ color: colors.foreground, fontWeight: "700" }}>{head.name}</Text>
        {head.detail ? `, ${head.detail}` : ""}
      </Text>
    </>
  );
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: SPACING.sm,
        paddingHorizontal: SPACING.md,
        paddingVertical: SPACING.sm,
        borderBottomWidth: BORDER_WIDTH,
        borderBottomColor: colors.border,
      }}
    >
      {onPressHead ? (
        <View style={{ flex: 1, flexDirection: "row" }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Switch branch. ${head.lead} ${head.name}`}
            onPress={onPressHead}
            style={{
              flexDirection: "row",
              alignItems: "center",
              flexShrink: 1,
              gap: SPACING.sm,
              paddingHorizontal: SPACING.xs,
              marginHorizontal: -SPACING.xs,
              borderRadius: RADIUS.chip,
            }}
          >
            {line}
            <Icon name="ChevronDown" size={ICON_SIZE} color={colors.foregroundMuted} />
          </Pressable>
        </View>
      ) : (
        <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: SPACING.sm }}>{line}</View>
      )}
      {actions}
    </View>
  );
}
