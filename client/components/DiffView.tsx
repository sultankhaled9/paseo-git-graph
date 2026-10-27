import type { PluginTheme } from "@getpaseo/plugin";
import { FlatList } from "@getpaseo/plugin/client/react-native";
import { memo, type ReactElement, useCallback, useMemo } from "react";
import { ActivityIndicator, type ListRenderItem, Text, View } from "react-native";
import { FONT_SIZE, MONO_FONT, SPACING } from "../tokens";

const DIVIDER_WIDTH = 1;
const NO_LINES: readonly string[] = [];

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

function lineKey(_: string, index: number): string {
  return String(index);
}

interface DiffPaneProps {
  header: ReactElement;
  text: string | undefined;
  truncated: boolean;
  loading: boolean;
  error: Error | null;
  theme: PluginTheme;
}

/** A header (metadata and file list) followed by a diff, in one virtualized list. */
export function DiffPane({ header, text, truncated, loading, error, theme }: DiffPaneProps) {
  const { colors } = theme;
  const lines = useMemo(() => (text === undefined ? NO_LINES : text.split("\n")), [text]);
  const renderLine = useCallback<ListRenderItem<string>>(
    ({ item }) => <DiffLine line={item} theme={theme} />,
    [theme],
  );

  let footer = null;
  if (error) {
    footer = <Text style={{ padding: SPACING.md, color: colors.statusDanger }}>{error.message}</Text>;
  } else if (loading) {
    footer = <ActivityIndicator style={{ marginVertical: SPACING.md }} color={colors.foregroundMuted} />;
  } else if (truncated) {
    footer = (
      <Text style={{ padding: SPACING.md, color: colors.statusWarning, fontSize: FONT_SIZE.small }}>
        Diff truncated. Open the file in an editor to see the rest.
      </Text>
    );
  }

  return (
    <FlatList
      data={lines}
      renderItem={renderLine}
      keyExtractor={lineKey}
      ListHeaderComponent={
        <View style={{ borderBottomWidth: lines.length > 0 ? DIVIDER_WIDTH : 0, borderBottomColor: colors.border }}>
          {header}
        </View>
      }
      ListFooterComponent={footer}
    />
  );
}
