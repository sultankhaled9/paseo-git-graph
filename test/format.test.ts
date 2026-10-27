import { describe, expect, it } from "vitest";
import { formatRelative, initials, stableHash } from "../shared/format";

const NOW = Date.parse("2026-10-27T12:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("formatRelative", () => {
  it("describes recent times relative to now", () => {
    expect(formatRelative(ago(10_000), NOW)).toBe("just now");
    expect(formatRelative(ago(5 * MINUTE), NOW)).toBe("5m ago");
    expect(formatRelative(ago(3 * HOUR), NOW)).toBe("3h ago");
    expect(formatRelative(ago(2 * DAY), NOW)).toBe("2d ago");
  });

  it("falls back to the calendar date after a week", () => {
    expect(formatRelative(ago(30 * DAY), NOW)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("treats future timestamps (clock skew) as just now", () => {
    expect(formatRelative(new Date(NOW + HOUR).toISOString(), NOW)).toBe("just now");
  });

  it("returns unparseable input unchanged", () => {
    expect(formatRelative("not a date", NOW)).toBe("not a date");
  });
});

describe("initials", () => {
  it("takes the first and last name initials", () => {
    expect(initials("Sultan Almansour")).toBe("SA");
    expect(initials("Ada King Lovelace")).toBe("AL");
  });

  it("handles single names and empty input", () => {
    expect(initials("mona")).toBe("MO");
    expect(initials("  ")).toBe("?");
  });
});

describe("stableHash", () => {
  it("is deterministic and non-negative", () => {
    expect(stableHash("Mona")).toBe(stableHash("Mona"));
    expect(stableHash("Mona")).not.toBe(stableHash("Omar"));
    expect(stableHash("a very long author name ".repeat(20))).toBeGreaterThanOrEqual(0);
  });
});
