import { LANE_PALETTE } from "../shared/constants";
import { stableHash } from "../shared/format";

export const SPACING = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;
export const FONT_SIZE = { small: 11, body: 13, title: 16 } as const;
export const RADIUS = { chip: 4, card: 8 } as const;
export const ICON_SIZE = 14;
export const AUTHOR_COLUMN_WIDTH = 140;
export const DATE_COLUMN_WIDTH = 120;
export const HASH_COLUMN_WIDTH = 64;
export const REFS_COLUMN_WIDTH = 200;
export const AUTHOR_BADGE_SIZE = 20;
export const CHIP_ICON_SIZE = 11;
/** The left-edge marker on the user's own commits. */
export const MINE_BAR_WIDTH = 3;
/** Text drawn on a lane-colored fill; every LANE_PALETTE color is mid-tone, so white stays legible. */
export const ON_LANE_TEXT = "#ffffff";
export const MONO_FONT = "monospace";
/** Below this width the graph drops metadata columns and shows commit detail in a modal. */
export const NARROW_LAYOUT_WIDTH = 720;

export function laneColor(color: number): string {
  return LANE_PALETTE[color % LANE_PALETTE.length];
}

export function authorColor(name: string): string {
  return LANE_PALETTE[stableHash(name) % LANE_PALETTE.length];
}
