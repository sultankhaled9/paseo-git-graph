import { describe, expect, it } from "vitest";
import { withAlpha } from "../shared/color";

describe("withAlpha", () => {
  it("adds an alpha byte to long and short hex colors", () => {
    expect(withAlpha("#3e704a", 0.5)).toBe("#3e704a80");
    expect(withAlpha("#f0a", 1)).toBe("#ff00aaff");
    expect(withAlpha("#3E704A", 0)).toBe("#3E704A00");
  });

  it("clamps alpha and rejects other formats", () => {
    expect(withAlpha("#000000", 2)).toBe("#000000ff");
    expect(withAlpha("rgb(1, 2, 3)", 0.5)).toBeNull();
    expect(withAlpha("green", 0.5)).toBeNull();
  });
});
