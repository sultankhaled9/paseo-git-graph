import type { Dirent } from "node:fs";
import { lstat, readdir } from "node:fs/promises";
import { join } from "node:path";
import {
  FOLDER_SCAN_CONCURRENCY,
  FOLDER_SCAN_DEPTH,
  FOLDER_SCAN_MAX_ENTRIES,
  FOLDER_SCAN_TIMEOUT_MS,
  MAX_FOLDER_REPOS,
} from "../shared/constants";
import type { FolderRepo } from "../shared/contracts";

const GIT_MARKER = ".git";
const SKIPPED_DIRECTORIES = new Set(["node_modules"]);
const HIDDEN_PREFIX = ".";

export interface FolderScanLimits {
  depth: number;
  maxRepos: number;
  maxEntries: number;
  timeoutMs: number;
  concurrency: number;
  now: () => number;
}

export const DEFAULT_SCAN_LIMITS: FolderScanLimits = {
  depth: FOLDER_SCAN_DEPTH,
  maxRepos: MAX_FOLDER_REPOS,
  maxEntries: FOLDER_SCAN_MAX_ENTRIES,
  timeoutMs: FOLDER_SCAN_TIMEOUT_MS,
  concurrency: FOLDER_SCAN_CONCURRENCY,
  now: Date.now,
};

export interface FolderScanResult {
  repos: FolderRepo[];
  truncated: boolean;
}

export class FolderScanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FolderScanError";
  }
}

async function mapLimit<Item, Result>(
  items: readonly Item[],
  limit: number,
  task: (item: Item) => Promise<Result>,
): Promise<Result[]> {
  const results: Result[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      const item = items[index];
      if (item !== undefined) results[index] = await task(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** A `.git` directory, or a `.git` file as used by worktrees and submodules. Symlinks never count. */
async function hasGitMarker(directory: string): Promise<boolean> {
  try {
    const marker = await lstat(join(directory, GIT_MARKER));
    return marker.isDirectory() || marker.isFile();
  } catch {
    return false;
  }
}

function isCandidate(entry: Dirent): boolean {
  return (
    entry.isDirectory() &&
    !entry.isSymbolicLink() &&
    !entry.name.startsWith(HIDDEN_PREFIX) &&
    !SKIPPED_DIRECTORIES.has(entry.name)
  );
}

/**
 * Finds repositories under a canonical folder, breadth first, up to `depth` levels. It does not
 * descend into a repository it found. Only the `.git` marker is checked here, which keeps periodic
 * rescans cheap; opening a repository still goes through the full git toplevel guard.
 */
export async function scanFolder(root: string, limits: FolderScanLimits = DEFAULT_SCAN_LIMITS): Promise<FolderScanResult> {
  const deadline = limits.now() + limits.timeoutMs;
  const checkDeadline = () => {
    if (limits.now() > deadline) throw new FolderScanError("Scanning the folder took too long");
  };
  const repos: FolderRepo[] = [];
  let entriesSeen = 0;
  let truncated = false;
  let level: string[] = [""];

  for (let depth = 1; depth <= limits.depth && level.length > 0 && !truncated; depth += 1) {
    const nextLevel: string[] = [];
    await mapLimit(level, limits.concurrency, async (relativeDir) => {
      if (truncated) return;
      checkDeadline();
      let entries: Dirent[];
      try {
        entries = await readdir(join(root, relativeDir), { withFileTypes: true });
      } catch (error) {
        if (relativeDir === "") throw error;
        return;
      }
      entriesSeen += entries.length;
      if (entriesSeen > limits.maxEntries) {
        truncated = true;
        return;
      }
      const candidates = entries.filter(isCandidate);
      await mapLimit(candidates, limits.concurrency, async (entry) => {
        checkDeadline();
        const relativePath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
        if (await hasGitMarker(join(root, relativePath))) repos.push({ relativePath, name: entry.name });
        else if (depth < limits.depth) nextLevel.push(relativePath);
      });
    });
    level = nextLevel;
  }

  repos.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  if (repos.length > limits.maxRepos) return { repos: repos.slice(0, limits.maxRepos), truncated: true };
  return { repos, truncated };
}
