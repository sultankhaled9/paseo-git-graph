import type { StatusFile, WipArea } from "./contracts";
import { groupWorkInProgress } from "./status-text";

export interface ReviewItem {
  key: string;
  path: string;
  area: WipArea;
}

/** File key -> fingerprint of the diff that was on screen when the file was marked reviewed. */
export type ReviewedFiles = ReadonlyMap<string, string>;

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const HEX_RADIX = 16;

/** A fast 32-bit FNV-1a hash of a diff, enough to notice that a reviewed file changed again. */
export function fingerprint(text: string): string {
  let hash = FNV_OFFSET;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return `${text.length}:${(hash >>> 0).toString(HEX_RADIX)}`;
}

export function reviewKey(area: WipArea, path: string): string {
  return `${area}:${path}`;
}

/** Every uncommitted file in review order: conflicts, staged, not staged, then new files. */
export function reviewItems(files: readonly StatusFile[]): ReviewItem[] {
  return groupWorkInProgress(files).flatMap((group) =>
    group.files.map((file) => ({ key: reviewKey(group.area, file.path), path: file.path, area: group.area })),
  );
}

/** Drops marks for files that no longer have changes in that area. */
export function keepListed(reviewed: ReviewedFiles, items: readonly ReviewItem[]): Map<string, string> {
  const listed = new Set(items.map((item) => item.key));
  return new Map([...reviewed].filter(([key]) => listed.has(key)));
}

/** Drops marks whose diff no longer matches what was reviewed; `current` holds freshly fetched fingerprints. */
export function keepUnchanged(reviewed: ReviewedFiles, current: ReadonlyMap<string, string>): Map<string, string> {
  return new Map([...reviewed].filter(([key, marked]) => current.get(key) === marked));
}

export interface ReviewProgress {
  reviewed: number;
  total: number;
  /** True only when every file is marked and the file list was not cut off. */
  complete: boolean;
}

export function reviewProgress(items: readonly ReviewItem[], reviewed: ReviewedFiles, filesTruncated: boolean): ReviewProgress {
  const count = items.filter((item) => reviewed.has(item.key)).length;
  return { reviewed: count, total: items.length, complete: !filesTruncated && items.length > 0 && count === items.length };
}

/** The next file after `from` that is not reviewed yet, wrapping around; null when none is left. */
export function nextUnreviewed(items: readonly ReviewItem[], reviewed: ReviewedFiles, from: number): number | null {
  for (let step = 1; step <= items.length; step += 1) {
    const index = (from + step) % items.length;
    const item = items[index];
    if (item && !reviewed.has(item.key)) return index;
  }
  return null;
}
