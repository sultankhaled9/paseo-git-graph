import { LANE_PALETTE, LANE_WIDTH } from "../shared/constants";
import { stableHash } from "../shared/format";

export const SPACING = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;
export const FONT_SIZE = { small: 11, body: 13, title: 16 } as const;
export const RADIUS = { chip: 4, card: 8, pill: 999 } as const;
export const ICON_SIZE = 14;
export const AUTHOR_COLUMN_WIDTH = 140;
export const DATE_COLUMN_WIDTH = 120;
export const HASH_COLUMN_WIDTH = 64;
export const REFS_COLUMN_WIDTH = 200;
/** In condensed rows, labels share space with the message, so they get one chip and a tight cap. */
export const COMPACT_REFS_MAX_WIDTH = 96;
/** The graph column never shrinks below this many lanes, so its header label stays readable. */
export const MIN_GRAPH_LANES = 3;
/** Wider histories are clipped to this many lanes so the commit description keeps its room. */
export const MAX_GRAPH_LANES = 10;
/** Narrow views (Explorer, mobile) keep fewer lanes so the message stays readable. */
export const MAX_GRAPH_LANES_NARROW = 4;
export const MIN_SUBJECT_WIDTH = 200;
const WIDE_ROW_GAPS = 5;
const WIDE_ROW_PADDING_SIDES = 2;

export const AUTHOR_BADGE_SIZE = 20;
export const CHIP_ICON_SIZE = 11;
/** The left-edge marker on the user's own commits. */
export const MINE_BAR_WIDTH = 3;
/** Text drawn on a lane-colored fill; every LANE_PALETTE color is mid-tone, so white stays legible. */
export const ON_LANE_TEXT = "#ffffff";
export const MONO_FONT = "monospace";
/** File cards: the size bar comparing how much each file changed. */
export const SIZE_BAR_WIDTH = 48;
export const SIZE_BAR_HEIGHT = 6;
/** Diff viewer: width of one line-number column, the pane width that allows side by side, and tint strengths. */
export const DIFF_GUTTER_WIDTH = 36;
export const DIFF_SPLIT_MIN_WIDTH = 760;
export const DIFF_LINE_TINT = 0.14;
export const DIFF_WORD_TINT = 0.4;
/** Below this width the graph drops metadata columns and shows commit detail in a modal. */
export const NARROW_LAYOUT_WIDTH = 720;
/** Opacity of commits that do not match the search, so the graph stays readable around matches. */
export const DIMMED_OPACITY = 0.3;

export function laneColor(color: number): string {
  return LANE_PALETTE[color % LANE_PALETTE.length];
}

export function authorColor(name: string): string {
  return LANE_PALETTE[stableHash(name) % LANE_PALETTE.length];
}

/** The width a row needs to show every column with a readable description. */
export function wideLayoutMinWidth(lanes: number): number {
  return (
    lanes * LANE_WIDTH +
    REFS_COLUMN_WIDTH +
    MIN_SUBJECT_WIDTH +
    AUTHOR_COLUMN_WIDTH +
    DATE_COLUMN_WIDTH +
    HASH_COLUMN_WIDTH +
    SPACING.sm * (WIDE_ROW_GAPS + WIDE_ROW_PADDING_SIDES)
  );
}
