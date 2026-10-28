import { describe, expect, it } from "vitest";
import {
  type DiffRow,
  diffWords,
  parseUnifiedDiff,
  toSplitRows,
  WORD_DIFF_MAX_LINE_LENGTH,
  withWordHighlights,
} from "../shared/diff-parse";

const SAMPLE = [
  "diff --git a/src/auth.ts b/src/auth.ts",
  "index 1111111..2222222 100644",
  "--- a/src/auth.ts",
  "+++ b/src/auth.ts",
  "@@ -12,3 +12,3 @@ export function login(user) {",
  " export function login(user) {",
  "-  const token = sign(user.id)",
  "+  const token = sign(user.id, { ttl: 3600 })",
  "   return token",
  "@@ -40,2 +40,3 @@",
  " a",
  "+b",
  " c",
  "\\ No newline at end of file",
  "",
].join("\n");

function kinds(rows: readonly DiffRow[]): string[] {
  return rows.map((row) => row.kind);
}

describe("parseUnifiedDiff", () => {
  it("numbers old and new lines and keeps headers as meta rows", () => {
    const rows = parseUnifiedDiff(SAMPLE);
    expect(kinds(rows).slice(0, 4)).toEqual(["meta", "meta", "meta", "meta"]);
    expect(rows).toContainEqual({ kind: "hunk", text: "export function login(user) {" });
    expect(rows).toContainEqual({ kind: "context", text: "export function login(user) {", oldNumber: 12, newNumber: 12 });
    expect(rows).toContainEqual({ kind: "del", text: "  const token = sign(user.id)", oldNumber: 13, newNumber: null });
    expect(rows).toContainEqual({ kind: "add", text: "  const token = sign(user.id, { ttl: 3600 })", oldNumber: null, newNumber: 13 });
    expect(rows).toContainEqual({ kind: "add", text: "b", oldNumber: null, newNumber: 41 });
    expect(rows).toContainEqual({ kind: "note", text: "No newline at end of file" });
  });

  it("adds gap rows for the unchanged lines before and between hunks", () => {
    const gaps = parseUnifiedDiff(SAMPLE).filter((row) => row.kind === "gap");
    expect(gaps).toEqual([
      { kind: "gap", hidden: 11 },
      { kind: "gap", hidden: 25 },
    ]);
  });

  it("does not add a gap for a new file", () => {
    const rows = parseUnifiedDiff("diff --git a/n b/n\nnew file mode 100644\n--- /dev/null\n+++ b/n\n@@ -0,0 +1,2 @@\n+x\n+y\n");
    expect(rows.some((row) => row.kind === "gap")).toBe(false);
    expect(rows.filter((row) => row.kind === "add")).toHaveLength(2);
  });

  it("keeps binary and rename headers as readable meta rows", () => {
    const rows = parseUnifiedDiff("diff --git a/a b/b\nsimilarity index 100%\nrename from a\nrename to b\nBinary files a/x and b/x differ\n");
    expect(rows.every((row) => row.kind === "meta")).toBe(true);
    expect(rows).toHaveLength(5);
  });

  it("reads combined conflict diffs without inventing line numbers", () => {
    const rows = parseUnifiedDiff("diff --cc c.txt\n@@@ -1,1 -1,1 +1,5 @@@\n++<<<<<<< HEAD\n +ours\n+ theirs\n");
    expect(rows.slice(2)).toEqual([
      { kind: "add", text: "<<<<<<< HEAD", oldNumber: null, newNumber: null },
      { kind: "add", text: "ours", oldNumber: null, newNumber: null },
      { kind: "add", text: "theirs", oldNumber: null, newNumber: null },
    ]);
  });

  it("restarts numbering for each file and tolerates truncated input", () => {
    const rows = parseUnifiedDiff("diff --git a/x b/x\n@@ -5,2 +5,2 @@\n a\n-b\ndiff --git a/y b/y\n@@ -1 +1 @@\n-q");
    expect(rows).toContainEqual({ kind: "del", text: "b", oldNumber: 6, newNumber: null });
    expect(rows).toContainEqual({ kind: "del", text: "q", oldNumber: 1, newNumber: null });
    expect(parseUnifiedDiff("")).toEqual([]);
  });
});

describe("diffWords", () => {
  it("marks only the words that changed", () => {
    const words = diffWords("const token = sign(user.id)", "const token = sign(user.id, { ttl: 3600 })");
    expect(words?.old.every((segment) => !segment.changed)).toBe(true);
    expect(words?.new.filter((segment) => segment.changed).map((segment) => segment.text).join("")).toBe(", { ttl: 3600 }");
  });

  it("skips lines too long to compare cheaply", () => {
    expect(diffWords("a".repeat(WORD_DIFF_MAX_LINE_LENGTH + 1), "b")).toBeNull();
  });
});

describe("withWordHighlights", () => {
  it("attaches segments to paired removed and added lines only", () => {
    const rows = withWordHighlights(parseUnifiedDiff(SAMPLE));
    const removed = rows.find((row) => row.kind === "del");
    const lone = rows.find((row) => row.kind === "add" && row.text === "b");
    expect(removed && "segments" in removed ? removed.segments?.length : 0).toBeGreaterThan(0);
    expect(lone && "segments" in lone ? lone.segments : undefined).toBeUndefined();
  });
});

describe("toSplitRows", () => {
  it("puts context on both sides and removed lines beside their replacements", () => {
    const split = toSplitRows(parseUnifiedDiff(SAMPLE));
    const pairs = split.filter((row) => row.kind === "pair");
    const replaced = pairs.find((row) => row.kind === "pair" && row.left?.kind === "del");
    expect(replaced?.kind === "pair" ? replaced.right?.kind : null).toBe("add");
    const added = pairs.find((row) => row.kind === "pair" && row.right?.text === "b");
    expect(added?.kind === "pair" ? added.left : undefined).toBeNull();
    expect(split.filter((row) => row.kind === "full").length).toBeGreaterThan(0);
  });
});
