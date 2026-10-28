import type { PluginTheme } from "@getpaseo/plugin";
import { FlatList, Icon } from "@getpaseo/plugin/client/react-native";
import { memo, type ReactElement, useCallback, useMemo, useState } from "react";
import { ActivityIndicator, type LayoutChangeEvent, type ListRenderItem, Pressable, Text, View } from "react-native";
import { withAlpha } from "../../shared/color";
import {
  type DiffRow,
  isLineRow,
  type LineRow,
  parseUnifiedDiff,
  type SplitRow,
  toSplitRows,
  withWordHighlights,
} from "../../shared/diff-parse";
import {
  DIFF_GUTTER_WIDTH,
  DIFF_LINE_TINT,
  DIFF_SPLIT_MIN_WIDTH,
  DIFF_WORD_TINT,
  FONT_SIZE,
  ICON_SIZE,
  MONO_FONT,
  RADIUS,
  SPACING,
} from "../tokens";

const DIVIDER_WIDTH = 1;
const NO_ROWS: readonly DiffRow[] = [];
/** File-level header lines that the surrounding view already shows (file name, blob ids). */
const HIDDEN_META_PREFIXES = ["diff --git", "diff --cc", "index ", "--- ", "+++ "];
const MARKERS: Readonly<Record<LineRow["kind"], string>> = { add: "+", del: "-", context: " " };

interface DiffPalette {
  text: string;
  muted: string;
  band: string;
  addLine: string;
  delLine: string;
  addWord: string;
  delWord: string;
  addMarker: string;
  delMarker: string;
}

function paletteFor(theme: PluginTheme): DiffPalette {
  const { colors } = theme;
  return {
    text: colors.foreground,
    muted: colors.foregroundMuted,
    band: colors.surface1,
    addLine: withAlpha(colors.statusSuccess, DIFF_LINE_TINT) ?? colors.surface1,
    delLine: withAlpha(colors.statusDanger, DIFF_LINE_TINT) ?? colors.surface1,
    addWord: withAlpha(colors.statusSuccess, DIFF_WORD_TINT) ?? colors.surface2,
    delWord: withAlpha(colors.statusDanger, DIFF_WORD_TINT) ?? colors.surface2,
    addMarker: colors.statusSuccess,
    delMarker: colors.statusDanger,
  };
}

function isShown(row: DiffRow): boolean {
  return row.kind !== "meta" || !HIDDEN_META_PREFIXES.some((prefix) => row.text.startsWith(prefix));
}

const monoText = { fontFamily: MONO_FONT, fontSize: FONT_SIZE.small };

function LineText({ row, palette }: { row: LineRow; palette: DiffPalette }) {
  const wordTint = row.kind === "add" ? palette.addWord : palette.delWord;
  return (
    <Text selectable style={[monoText, { flex: 1, color: palette.text }]}>
      {row.segments
        ? row.segments.map((segment, index) => (
            <Text key={index} style={segment.changed ? { backgroundColor: wordTint } : undefined}>
              {segment.text}
            </Text>
          ))
        : row.text.length > 0
          ? row.text
          : " "}
    </Text>
  );
}

function lineBackground(row: LineRow | null, palette: DiffPalette): string | undefined {
  if (!row) return palette.band;
  if (row.kind === "add") return palette.addLine;
  if (row.kind === "del") return palette.delLine;
  return undefined;
}

function Gutter({ value, palette }: { value: number | null; palette: DiffPalette }) {
  return (
    <Text style={[monoText, { width: DIFF_GUTTER_WIDTH, textAlign: "right", color: palette.muted }]}>
      {value === null ? "" : value}
    </Text>
  );
}

/** Rows that span the whole width: hunk context, collapsed unchanged lines, notes, and headers. */
function FullRow({ row, palette }: { row: Exclude<DiffRow, LineRow>; palette: DiffPalette }) {
  let label: string;
  if (row.kind === "gap") label = `${row.hidden} unchanged ${row.hidden === 1 ? "line" : "lines"}`;
  else if (row.kind === "hunk") label = row.text.length > 0 ? row.text : "Changed lines";
  else label = row.text;
  return (
    <Text
      style={[
        monoText,
        {
          paddingHorizontal: SPACING.md,
          paddingVertical: SPACING.xs,
          color: palette.muted,
          backgroundColor: row.kind === "meta" || row.kind === "note" ? undefined : palette.band,
          fontStyle: row.kind === "note" ? "italic" : "normal",
        },
      ]}
    >
      {row.kind === "gap" ? `⋯  ${label}  ⋯` : label}
    </Text>
  );
}

const UnifiedLine = memo(function UnifiedLine({ row, palette }: { row: DiffRow; palette: DiffPalette }) {
  if (!isLineRow(row)) return <FullRow row={row} palette={palette} />;
  return (
    <View style={{ flexDirection: "row", gap: SPACING.xs, paddingRight: SPACING.sm, backgroundColor: lineBackground(row, palette) }}>
      <Gutter value={row.oldNumber} palette={palette} />
      <Gutter value={row.newNumber} palette={palette} />
      <Text style={[monoText, { color: row.kind === "add" ? palette.addMarker : row.kind === "del" ? palette.delMarker : palette.muted }]}>
        {MARKERS[row.kind]}
      </Text>
      <LineText row={row} palette={palette} />
    </View>
  );
});

function SplitHalf({ row, side, palette }: { row: LineRow | null; side: "old" | "new"; palette: DiffPalette }) {
  return (
    <View style={{ flex: 1, flexDirection: "row", gap: SPACING.xs, paddingRight: SPACING.sm, backgroundColor: lineBackground(row, palette) }}>
      <Gutter value={row ? (side === "old" ? row.oldNumber : row.newNumber) : null} palette={palette} />
      {row ? <LineText row={row} palette={palette} /> : <View style={{ flex: 1 }} />}
    </View>
  );
}

const SplitLine = memo(function SplitLine({ row, palette, divider }: { row: SplitRow; palette: DiffPalette; divider: string }) {
  if (row.kind === "full") return <FullRow row={row.row} palette={palette} />;
  return (
    <View style={{ flexDirection: "row" }}>
      <SplitHalf row={row.left} side="old" palette={palette} />
      <View style={{ width: DIVIDER_WIDTH, backgroundColor: divider }} />
      <SplitHalf row={row.right} side="new" palette={palette} />
    </View>
  );
});

function rowKey(_: unknown, index: number): string {
  return String(index);
}

/** Lets the diff take the whole width (hiding the list beside it), which makes room for side by side. */
export interface ExpandControl {
  expanded: boolean;
  onToggle(): void;
}

interface DiffPaneProps {
  header: ReactElement;
  expand?: ExpandControl;
  text: string | undefined;
  truncated: boolean;
  loading: boolean;
  error: Error | null;
  theme: PluginTheme;
}

/**
 * A header (metadata and file list) followed by the diff: line numbers, tinted added and removed
 * lines, highlighted changed words, collapsed unchanged lines, and a side-by-side layout when
 * the pane is wide enough. Virtualized, so large diffs scroll smoothly.
 */
export function DiffPane({ header, expand, text, truncated, loading, error, theme }: DiffPaneProps) {
  const { colors } = theme;
  const palette = useMemo(() => paletteFor(theme), [theme]);
  const [width, setWidth] = useState<number | null>(null);
  const [preferUnified, setPreferUnified] = useState(false);
  const onLayout = useCallback((event: LayoutChangeEvent) => setWidth(Math.round(event.nativeEvent.layout.width)), []);
  const rows = useMemo(
    () => (text === undefined ? NO_ROWS : withWordHighlights(parseUnifiedDiff(text)).filter(isShown)),
    [text],
  );
  const canSplit = width !== null && width >= DIFF_SPLIT_MIN_WIDTH;
  const split = canSplit && !preferUnified;
  const splitRows = useMemo(() => (split ? toSplitRows(rows) : null), [rows, split]);

  const renderUnified = useCallback<ListRenderItem<DiffRow>>(({ item }) => <UnifiedLine row={item} palette={palette} />, [palette]);
  const renderSplit = useCallback<ListRenderItem<SplitRow>>(
    ({ item }) => <SplitLine row={item} palette={palette} divider={colors.border} />,
    [palette, colors.border],
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

  const expandButton =
    rows.length > 0 && expand ? (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={expand.expanded ? "Show the list again" : "Expand the diff"}
        onPress={expand.onToggle}
        style={{ flexDirection: "row", alignItems: "center", gap: SPACING.xs, paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs, borderRadius: RADIUS.chip, backgroundColor: colors.surface2 }}
      >
        <Icon name={expand.expanded ? "Minimize2" : "Maximize2"} size={ICON_SIZE} color={colors.foreground} />
        <Text style={{ color: colors.foreground, fontSize: FONT_SIZE.small }}>{expand.expanded ? "Collapse" : "Expand"}</Text>
      </Pressable>
    ) : null;

  const toggle =
    rows.length > 0 && canSplit ? (
      <View style={{ flexDirection: "row", borderRadius: RADIUS.chip, borderWidth: DIVIDER_WIDTH, borderColor: colors.border }}>
        {(["split", "unified"] as const).map((mode) => {
          const active = (mode === "split") === split;
          return (
            <Pressable
              key={mode}
              accessibilityRole="button"
              accessibilityLabel={mode === "split" ? "Show side by side" : "Show unified"}
              accessibilityState={{ selected: active }}
              onPress={() => setPreferUnified(mode === "unified")}
              style={{ paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs, backgroundColor: active ? colors.surface2 : "transparent" }}
            >
              <Text style={{ color: active ? colors.foreground : colors.foregroundMuted, fontSize: FONT_SIZE.small }}>
                {mode === "split" ? "Side by side" : "Unified"}
              </Text>
            </Pressable>
          );
        })}
      </View>
    ) : null;

  const listHeader = (
    <View style={{ borderBottomWidth: rows.length > 0 ? DIVIDER_WIDTH : 0, borderBottomColor: colors.border }}>
      {header}
      {expandButton || toggle ? (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: SPACING.sm, padding: SPACING.sm }}>
          {expandButton ?? <View />}
          {toggle}
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={{ flex: 1 }} onLayout={onLayout}>
      {splitRows ? (
        <FlatList data={splitRows} renderItem={renderSplit} keyExtractor={rowKey} ListHeaderComponent={listHeader} ListFooterComponent={footer} />
      ) : (
        <FlatList data={rows} renderItem={renderUnified} keyExtractor={rowKey} ListHeaderComponent={listHeader} ListFooterComponent={footer} />
      )}
    </View>
  );
}
