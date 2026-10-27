import { describe, expect, it } from "vitest";
import { isMine } from "../shared/author";
import { LANE_PALETTE } from "../shared/constants";

const author = { name: "Sultan Almansour", email: "SAlmansour@humain.com" };

describe("isMine", () => {
  it("matches the configured email case-insensitively", () => {
    expect(isMine(author, { name: "Someone Else", email: "salmansour@HUMAIN.com" })).toBe(true);
  });

  it("does not fall back to the name when an email is configured", () => {
    expect(isMine(author, { name: "Sultan Almansour", email: "other@humain.com" })).toBe(false);
  });

  it("uses the name when no email is configured", () => {
    expect(isMine(author, { name: "Sultan Almansour", email: null })).toBe(true);
    expect(isMine(author, { name: "Other", email: null })).toBe(false);
  });

  it("is false without an identity", () => {
    expect(isMine(author, { name: null, email: null })).toBe(false);
    expect(isMine(author, undefined)).toBe(false);
  });
});

const RED_HUE_MIN = 330;
const RED_HUE_MAX = 15;
const HEX_RADIX = 16;
const CHANNEL_MAX = 255;
const DEGREES_PER_SEXTANT = 60;
const FULL_CIRCLE = 360;

function hue(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), HEX_RADIX) / CHANNEL_MAX);
  const red = r ?? 0;
  const green = g ?? 0;
  const blue = b ?? 0;
  const max = Math.max(red, green, blue);
  const delta = max - Math.min(red, green, blue);
  if (delta === 0) return 0;
  let sextant: number;
  if (max === red) sextant = ((green - blue) / delta) % 6;
  else if (max === green) sextant = (blue - red) / delta + 2;
  else sextant = (red - green) / delta + 4;
  return (sextant * DEGREES_PER_SEXTANT + FULL_CIRCLE) % FULL_CIRCLE;
}

describe("LANE_PALETTE", () => {
  it("contains no red or pink lane colors", () => {
    const saturatedReds = LANE_PALETTE.filter((color) => {
      const h = hue(color);
      return h >= RED_HUE_MIN || h <= RED_HUE_MAX;
    });
    expect(saturatedReds).toEqual([]);
  });
});
