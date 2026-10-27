import type { PluginTheme } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/client/react-native";
import type { ReactNode } from "react";
import { Text, View } from "react-native";
import type { RepoStatus } from "../../shared/contracts";
import { describeHead } from "../../shared/status-text";
import { FONT_SIZE, ICON_SIZE, SPACING } from "../tokens";

const BORDER_WIDTH = 1;

/** The "what is now" line in plain words, e.g. "On main, 2 ahead and 1 behind origin/main". */
export function StatusBar({ status, theme, actions }: { status: RepoStatus; theme: PluginTheme; actions?: ReactNode }) {
  const { colors } = theme;
  const head = describeHead(status);
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
      <Icon name={status.detached ? "CircleDot" : "GitBranch"} size={ICON_SIZE} color={colors.foreground} />
      <Text style={{ flex: 1, color: colors.foregroundMuted, fontSize: FONT_SIZE.body }}>
        {head.lead}{" "}
        <Text style={{ color: colors.foreground, fontWeight: "700" }}>{head.name}</Text>
        {head.detail ? `, ${head.detail}` : ""}
      </Text>
      {actions}
    </View>
  );
}
