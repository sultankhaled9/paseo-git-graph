const HEX_LONG = /^#([0-9a-f]{6})$/i;
const HEX_SHORT = /^#([0-9a-f]{3})$/i;
const ALPHA_SCALE = 255;
const HEX_RADIX = 16;
const HEX_BYTE_WIDTH = 2;

/**
 * A translucent version of a hex color ("#rrggbb" or "#rgb") as "#rrggbbaa", or null for any
 * other format so callers can fall back to a solid theme color.
 */
export function withAlpha(color: string, alpha: number): string | null {
  const clamped = Math.min(Math.max(alpha, 0), 1);
  const suffix = Math.round(clamped * ALPHA_SCALE).toString(HEX_RADIX).padStart(HEX_BYTE_WIDTH, "0");
  const long = HEX_LONG.exec(color);
  if (long) return `#${long[1]}${suffix}`;
  const short = HEX_SHORT.exec(color);
  if (short) {
    const expanded = [...(short[1] ?? "")].map((digit) => digit + digit).join("");
    return `#${expanded}${suffix}`;
  }
  return null;
}
