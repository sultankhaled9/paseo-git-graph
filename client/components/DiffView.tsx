import type { PluginTheme } from "@getpaseo/plugin";
import { memo } from "react";
import { Text } from "react-native";
import { FONT_SIZE, MONO_FONT, SPACING } from "../tokens";

const META_PREFIXES = [
  "diff --git",
  "index ",
  "--- ",
  "+++ ",
  "new file",
  "deleted file",
  "similarity",
  "rename ",
  "old mode",
  "new mode",
  "Binary files",
];

function lineColor(line: string, theme: PluginTheme): string {
  const { colors } = theme;
  if (META_PREFIXES.some((prefix) => line.startsWith(prefix))) return colors.foregroundMuted;
  if (line.startsWith("@@")) return colors.accent;
  if (line.startsWith("+")) return colors.statusSuccess;
  if (line.startsWith("-")) return colors.statusDanger;
  return colors.foreground;
}

/** One line of unified diff output, colored by its prefix. */
export const DiffLine = memo(function DiffLine({ line, theme }: { line: string; theme: PluginTheme }) {
  return (
    <Text
      selectable
      style={{
        paddingHorizontal: SPACING.md,
        color: lineColor(line, theme),
        fontFamily: MONO_FONT,
        fontSize: FONT_SIZE.small,
      }}
    >
      {line.length > 0 ? line : " "}
    </Text>
  );
});
