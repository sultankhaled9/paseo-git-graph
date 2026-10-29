import { lstat } from "node:fs/promises";
import { resolve } from "node:path";
import { runGit } from "./git";

/**
 * Files git keeps while a merge, rebase, cherry-pick, or revert is in progress. REBASE_HEAD is not
 * one: git can leave it behind after a rebase ends, and like git status, only the rebase folders count.
 */
const IN_PROGRESS_MARKERS: readonly string[] = ["MERGE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD", "rebase-merge", "rebase-apply"];

export const OPERATION_IN_PROGRESS_REASON = "A merge, rebase, or cherry-pick is in progress. Finish or abort it first.";

const repositoryLocks = new Map<string, Promise<unknown>>();

/** Runs `task` after every earlier write to the same repository has finished, whatever kind of write it was. */
export function serialized<Result>(root: string, task: () => Promise<Result>): Promise<Result> {
  const previous = repositoryLocks.get(root) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(task);
  repositoryLocks.set(root, run);
  return run;
}

export async function operationInProgress(root: string): Promise<boolean> {
  for (const marker of IN_PROGRESS_MARKERS) {
    const path = (await runGit(root, ["rev-parse", "--git-path", marker])).trim();
    if (await lstat(resolve(root, path)).catch(() => null)) return true;
  }
  return false;
}
