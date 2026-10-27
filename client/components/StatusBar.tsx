import type { PluginTheme } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { Text, View } from "react-native";
import type { RepoStatus } from "../../shared/contracts";
import { shortHash } from "../format";
import { FONT_SIZE, ICON_SIZE, SPACING } from "../tokens";

const BORDER_WIDTH = 1;

function headLabel(status: RepoStatus): string {
  if (status.detached) return status.headOid ? `detached at ${shortHash(status.headOid)}` : "detached";
  if (!status.headOid) return `${status.branch ?? "HEAD"} (no commits yet)`;
  return status.branch ?? "HEAD";
}

/** The "what is now" line: checked-out branch, upstream, and ahead/behind counts. */
export function StatusBar({ status, theme }: { status: RepoStatus; theme: PluginTheme }) {
  const { colors } = theme;
  const muted = { color: colors.foregroundMuted, fontSize: FONT_SIZE.small };
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        flexWrap: "wrap",
        gap: SPACING.sm,
        paddingHorizontal: SPACING.md,
        paddingVertical: SPACING.sm,
        borderBottomWidth: BORDER_WIDTH,
        borderBottomColor: colors.border,
      }}
    >
      <Icon name="GitBranch" size={ICON_SIZE} color={colors.foreground} />
      <Text style={{ color: colors.foreground, fontSize: FONT_SIZE.body, fontWeight: "600" }}>
        {headLabel(status)}
      </Text>
      {status.upstream ? (
        <>
          <Text style={muted}>tracking {status.upstream}</Text>
          <Icon name="ArrowUp" size={ICON_SIZE} color={colors.foregroundMuted} />
          <Text style={muted}>{status.ahead}</Text>
          <Icon name="ArrowDown" size={ICON_SIZE} color={colors.foregroundMuted} />
          <Text style={muted}>{status.behind}</Text>
        </>
      ) : status.headOid && !status.detached ? (
        <Text style={muted}>no upstream</Text>
      ) : null}
    </View>
  );
}
