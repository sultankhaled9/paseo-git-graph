/** A run of text inside a changed line; `changed` marks the words that differ from the paired line. */
export interface Segment {
  text: string;
  changed: boolean;
}

export type DiffRow =
  | { kind: "meta"; text: string }
  | { kind: "hunk"; text: string }
  | { kind: "gap"; hidden: number }
  | { kind: "note"; text: string }
  | {
      kind: "add" | "del" | "context";
      text: string;
      oldNumber: number | null;
      newNumber: number | null;
      segments?: Segment[];
    };

export type LineRow = Extract<DiffRow, { kind: "add" | "del" | "context" }>;

/** One visual row of the side-by-side view: paired old and new lines, or a full-width row. */
export type SplitRow =
  | { kind: "pair"; left: LineRow | null; right: LineRow | null }
  | { kind: "full"; row: Exclude<DiffRow, LineRow> };

const HUNK_PATTERN = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@ ?(.*)$/;
const COMBINED_HUNK_PREFIX = "@@@";
const NO_NEWLINE_PREFIX = "\\";
const FILE_HEADER_PREFIX = "diff ";
const DEFAULT_HUNK_LENGTH = 1;

/** Lines longer than this, or pairs whose comparison grid is larger, skip word highlighting. */
export const WORD_DIFF_MAX_LINE_LENGTH = 500;
export const WORD_DIFF_MAX_CELLS = 40_000;

interface HunkState {
  oldLine: number;
  newLine: number;
  combined: boolean;
}

/**
 * Parses unified diff text into display rows with old and new line numbers, and "gap" rows for
 * the unchanged lines git left out between hunks. Combined conflict diffs (`@@@`) keep their
 * lines readable but carry no line numbers, since they compare more than two versions.
 */
export function parseUnifiedDiff(text: string): DiffRow[] {
  const rows: DiffRow[] = [];
  let hunk: HunkState | null = null;
  let previousOldEnd = 1;
  const lines = text.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();

  for (const line of lines) {
    if (line.startsWith(FILE_HEADER_PREFIX)) {
      hunk = null;
      previousOldEnd = 1;
      rows.push({ kind: "meta", text: line });
      continue;
    }
    if (line.startsWith(COMBINED_HUNK_PREFIX)) {
      hunk = { oldLine: 0, newLine: 0, combined: true };
      rows.push({ kind: "hunk", text: line });
      continue;
    }
    const header = HUNK_PATTERN.exec(line);
    if (header) {
      const oldStart = Number(header[1]);
      const oldLength = header[2] === undefined ? DEFAULT_HUNK_LENGTH : Number(header[2]);
      const newStart = Number(header[3]);
      const hidden = oldStart - previousOldEnd;
      if (hidden > 0 && oldLength > 0) rows.push({ kind: "gap", hidden });
      previousOldEnd = oldStart + oldLength;
      hunk = { oldLine: oldStart, newLine: newStart, combined: false };
      rows.push({ kind: "hunk", text: header[5] ?? "" });
      continue;
    }
    if (!hunk) {
      rows.push({ kind: "meta", text: line });
      continue;
    }
    if (line.startsWith(NO_NEWLINE_PREFIX)) {
      rows.push({ kind: "note", text: line.slice(1).trim() });
      continue;
    }
    if (hunk.combined) {
      const markers = line.slice(0, 2);
      const kind = markers.includes("+") ? "add" : markers.includes("-") ? "del" : "context";
      rows.push({ kind, text: line.slice(2), oldNumber: null, newNumber: null });
      continue;
    }
    const marker = line.charAt(0);
    const body = line.slice(1);
    if (marker === "+") {
      rows.push({ kind: "add", text: body, oldNumber: null, newNumber: hunk.newLine });
      hunk.newLine += 1;
    } else if (marker === "-") {
      rows.push({ kind: "del", text: body, oldNumber: hunk.oldLine, newNumber: null });
      hunk.oldLine += 1;
    } else {
      rows.push({ kind: "context", text: body, oldNumber: hunk.oldLine, newNumber: hunk.newLine });
      hunk.oldLine += 1;
      hunk.newLine += 1;
    }
  }
  return rows;
}

const TOKEN_PATTERN = /\s+|\w+|[^\w\s]/g;

function tokenize(text: string): string[] {
  return text.match(TOKEN_PATTERN) ?? [];
}

function merge(segments: Segment[]): Segment[] {
  const merged: Segment[] = [];
  for (const segment of segments) {
    const last = merged[merged.length - 1];
    if (last && last.changed === segment.changed) last.text += segment.text;
    else merged.push({ ...segment });
  }
  return merged;
}

/**
 * Word-level comparison of a removed line and its replacement (longest common subsequence on
 * words, spaces, and punctuation). Returns null when the lines are too long to compare cheaply.
 */
export function diffWords(oldText: string, newText: string): { old: Segment[]; new: Segment[] } | null {
  if (oldText.length > WORD_DIFF_MAX_LINE_LENGTH || newText.length > WORD_DIFF_MAX_LINE_LENGTH) return null;
  const a = tokenize(oldText);
  const b = tokenize(newText);
  if (a.length * b.length > WORD_DIFF_MAX_CELLS) return null;

  const table: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    const row = table[i];
    const below = table[i + 1];
    if (!row || !below) continue;
    for (let j = b.length - 1; j >= 0; j -= 1) {
      row[j] = a[i] === b[j] ? (below[j + 1] ?? 0) + 1 : Math.max(below[j] ?? 0, row[j + 1] ?? 0);
    }
  }

  const oldSegments: Segment[] = [];
  const newSegments: Segment[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const tokenA = a[i] ?? "";
    const tokenB = b[j] ?? "";
    if (tokenA === tokenB) {
      oldSegments.push({ text: tokenA, changed: false });
      newSegments.push({ text: tokenB, changed: false });
      i += 1;
      j += 1;
    } else if ((table[i + 1]?.[j] ?? 0) >= (table[i]?.[j + 1] ?? 0)) {
      oldSegments.push({ text: tokenA, changed: true });
      i += 1;
    } else {
      newSegments.push({ text: tokenB, changed: true });
      j += 1;
    }
  }
  for (; i < a.length; i += 1) oldSegments.push({ text: a[i] ?? "", changed: true });
  for (; j < b.length; j += 1) newSegments.push({ text: b[j] ?? "", changed: true });
  return { old: merge(oldSegments), new: merge(newSegments) };
}

function isLine(row: DiffRow | undefined, kind: "add" | "del"): row is LineRow {
  return row !== undefined && row.kind === kind;
}

/**
 * Pairs each block of removed lines with the added block right after it, line by line, and
 * attaches word highlights to both sides of every pair.
 */
export function withWordHighlights(rows: readonly DiffRow[]): DiffRow[] {
  const result: DiffRow[] = rows.map((row) => ({ ...row }));
  let index = 0;
  while (index < result.length) {
    if (!isLine(result[index], "del")) {
      index += 1;
      continue;
    }
    const delStart = index;
    while (isLine(result[index], "del")) index += 1;
    const addStart = index;
    while (isLine(result[index], "add")) index += 1;
    const pairs = Math.min(addStart - delStart, index - addStart);
    for (let offset = 0; offset < pairs; offset += 1) {
      const removed = result[delStart + offset];
      const added = result[addStart + offset];
      if (!isLine(removed, "del") || !isLine(added, "add")) continue;
      const words = diffWords(removed.text, added.text);
      if (!words) continue;
      removed.segments = words.old;
      added.segments = words.new;
    }
  }
  return result;
}

function takeRun(rows: readonly DiffRow[], start: number, kind: "add" | "del"): LineRow[] {
  const run: LineRow[] = [];
  for (let index = start; index < rows.length; index += 1) {
    const row = rows[index];
    if (!isLine(row, kind)) break;
    run.push(row);
  }
  return run;
}

export function isLineRow(row: DiffRow): row is LineRow {
  return row.kind === "add" || row.kind === "del" || row.kind === "context";
}

/** Arranges rows side by side: context on both sides, removed blocks beside the added block after them. */
export function toSplitRows(rows: readonly DiffRow[]): SplitRow[] {
  const split: SplitRow[] = [];
  let index = 0;
  while (index < rows.length) {
    const row = rows[index];
    if (!row) break;
    if (!isLineRow(row)) {
      split.push({ kind: "full", row });
      index += 1;
    } else if (row.kind === "context") {
      split.push({ kind: "pair", left: row, right: row });
      index += 1;
    } else {
      const removed = takeRun(rows, index, "del");
      index += removed.length;
      const added = takeRun(rows, index, "add");
      index += added.length;
      const length = Math.max(removed.length, added.length);
      for (let offset = 0; offset < length; offset += 1) {
        split.push({ kind: "pair", left: removed[offset] ?? null, right: added[offset] ?? null });
      }
    }
  }
  return split;
}
