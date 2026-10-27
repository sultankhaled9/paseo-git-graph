import { LANE_PALETTE } from "../shared/constants";

export const SPACING = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;
export const FONT_SIZE = { small: 11, body: 13, title: 16 } as const;
export const RADIUS = { chip: 4, card: 8 } as const;
export const ICON_SIZE = 14;
export const AUTHOR_COLUMN_WIDTH = 140;
export const DATE_COLUMN_WIDTH = 120;
export const HASH_COLUMN_WIDTH = 64;
export const MONO_FONT = "monospace";

export function laneColor(color: number): string {
  return LANE_PALETTE[color % LANE_PALETTE.length];
}
