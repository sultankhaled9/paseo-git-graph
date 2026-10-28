import { describe, expect, it } from "vitest";
import type { StatusFile } from "../shared/contracts";
import {
  fingerprint,
  keepListed,
  keepUnchanged,
  nextUnreviewed,
  reviewItems,
  reviewKey,
  reviewProgress,
} from "../shared/review";

const files: StatusFile[] = [
  { path: "new.ts", index: "?", worktree: "?", kind: "untracked" },
  { path: "both.ts", index: "M", worktree: "M", kind: "changed" },
  { path: "clash.ts", index: "U", worktree: "U", kind: "unmerged" },
];

describe("reviewItems", () => {
  it("orders conflicts, staged, not staged, new, and keeps partly staged files twice", () => {
    expect(reviewItems(files).map((item) => item.key)).toEqual([
      "conflicted:clash.ts",
      "staged:both.ts",
      "unstaged:both.ts",
      "untracked:new.ts",
    ]);
  });
});

describe("fingerprint", () => {
  it("changes when the diff changes", () => {
    expect(fingerprint("+a\n")).toBe(fingerprint("+a\n"));
    expect(fingerprint("+a\n")).not.toBe(fingerprint("+b\n"));
  });
});

describe("review marks", () => {
  const items = reviewItems(files);
  const staged = reviewKey("staged", "both.ts");
  const unstaged = reviewKey("unstaged", "both.ts");

  it("keeps staged and not-staged copies of one file independent", () => {
    const reviewed = new Map([[staged, "x"]]);
    expect(reviewProgress(items, reviewed, false)).toEqual({ reviewed: 1, total: 4, complete: false });
    expect(reviewed.has(unstaged)).toBe(false);
  });

  it("drops marks for files that left the list and for diffs that changed", () => {
    const reviewed = new Map([
      [staged, "x"],
      [reviewKey("staged", "gone.ts"), "y"],
    ]);
    expect([...keepListed(reviewed, items).keys()]).toEqual([staged]);
    expect(keepUnchanged(reviewed, new Map([[staged, "changed"]])).size).toBe(0);
    expect(keepUnchanged(reviewed, new Map([[staged, "x"]])).has(staged)).toBe(true);
  });

  it("completes only when every file is marked and nothing was cut off", () => {
    const all = new Map(items.map((item) => [item.key, "fp"]));
    expect(reviewProgress(items, all, false).complete).toBe(true);
    expect(reviewProgress(items, all, true).complete).toBe(false);
    expect(reviewProgress([], new Map(), false).complete).toBe(false);
  });

  it("finds the next unreviewed file, wrapping around", () => {
    const reviewed = new Map([[items[1]?.key ?? "", "fp"]]);
    expect(nextUnreviewed(items, reviewed, 0)).toBe(2);
    expect(nextUnreviewed(items, reviewed, 3)).toBe(0);
    expect(nextUnreviewed(items, new Map(items.map((item) => [item.key, "fp"])), 0)).toBeNull();
  });
});
