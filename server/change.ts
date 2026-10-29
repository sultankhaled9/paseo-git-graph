import { createHash } from "node:crypto";
import { lstat, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import type { ChangeAction, ChangePreview, RepoStatus } from "../shared/contracts";
import { fileInArea } from "../shared/status-text";
import { backupRef, createBackup, fingerprintPaths, pruneBackups, recordAfterState, repoFilePath, restoreBackup } from "./backup";
import { runGit, runGitOptional } from "./git";
import { parseStatus } from "./parse";
import { STATUS_ARGS } from "./repo";

/** Files git keeps while a merge, rebase, cherry-pick, or revert is in progress. */
const IN_PROGRESS_MARKERS: readonly string[] = [
  "MERGE_HEAD",
  "CHERRY_PICK_HEAD",
  "REVERT_HEAD",
  "REBASE_HEAD",
  "rebase-merge",
  "rebase-apply",
];

const repositoryLocks = new Map<string, Promise<unknown>>();

/** Runs `task` after every earlier write to the same repository has finished. */
function serialized<Result>(root: string, task: () => Promise<Result>): Promise<Result> {
  const previous = repositoryLocks.get(root) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(task);
  repositoryLocks.set(root, run);
  return run;
}

async function operationInProgress(root: string): Promise<boolean> {
  for (const marker of IN_PROGRESS_MARKERS) {
    const path = (await runGit(root, ["rev-parse", "--git-path", marker])).trim();
    if (await lstat(resolve(root, path)).catch(() => null)) return true;
  }
  return false;
}

async function headExists(root: string): Promise<boolean> {
  return (await runGitOptional(root, ["rev-parse", "-q", "--verify", "HEAD"])).trim().length > 0;
}

type Plan = { allowed: true; paths: string[]; untracked: string[] } | { allowed: false; reason: string };

function planFor(action: ChangeAction, status: RepoStatus): Plan {
  if (action.kind === "discard-all") {
    if (status.conflicted > 0) return { allowed: false, reason: "Resolve the merge conflicts before discarding everything." };
    const untracked = status.files.filter((file) => file.kind === "untracked").map((file) => file.path);
    const tracked = status.files.filter((file) => file.kind !== "untracked").flatMap((file) => (file.origPath ? [file.origPath, file.path] : [file.path]));
    const paths = [...new Set([...tracked, ...untracked])];
    if (paths.length === 0) return { allowed: false, reason: "There is nothing to discard." };
    return { allowed: true, paths, untracked };
  }
  const file = status.files.find((candidate) => candidate.path === action.path);
  if (file?.kind === "unmerged") return { allowed: false, reason: `${action.path} has a merge conflict. Resolve it first.` };
  const area = action.kind === "discard" ? action.area : action.kind === "unstage" ? "staged" : "untracked";
  if (!file || !fileInArea(file, area)) return { allowed: false, reason: `${action.path} has no ${area === "untracked" ? "new file" : area} changes now.` };
  const paths = file.origPath && action.kind !== "delete" && area === "staged" ? [file.origPath, file.path] : [file.path];
  return { allowed: true, paths, untracked: action.kind === "delete" ? [file.path] : [] };
}

async function currentPlan(root: string, action: ChangeAction): Promise<Plan> {
  if (action.kind === "discard-all" && (await operationInProgress(root))) {
    return { allowed: false, reason: "A merge, rebase, or cherry-pick is in progress. Finish or abort it first." };
  }
  const status = parseStatus(await runGit(root, STATUS_ARGS), root, Number.POSITIVE_INFINITY);
  return planFor(action, status);
}

async function fingerprintFor(root: string, action: ChangeAction, paths: readonly string[]): Promise<string> {
  return createHash("sha256")
    .update(JSON.stringify(action))
    .update("\0")
    .update(await fingerprintPaths(root, paths))
    .digest("hex");
}

/** What an action would change, with a fingerprint of the exact current state of those paths. */
export async function previewChange(root: string, action: ChangeAction): Promise<ChangePreview> {
  const plan = await currentPlan(root, action);
  if (!plan.allowed) return plan;
  return { allowed: true, paths: plan.paths, fingerprint: await fingerprintFor(root, action, plan.paths) };
}

async function removeFromFolder(root: string, path: string): Promise<void> {
  const absolute = await repoFilePath(root, path);
  const info = await lstat(absolute).catch(() => null);
  if (!info) return;
  if (info.isDirectory()) throw new Error(`${path} is a folder, which this view does not delete`);
  await unlink(absolute);
}

/** Index and folder back to the last commit; files that are not in it are removed from both. */
async function backToLastCommit(root: string, paths: readonly string[]): Promise<void> {
  if (paths.length === 0) return;
  if (await headExists(root)) {
    await runGit(root, ["restore", "--source=HEAD", "--staged", "--worktree", "--", ...paths]);
    return;
  }
  await runGit(root, ["rm", "--cached", "-q", "--ignore-unmatch", "--", ...paths]);
  for (const path of paths) await removeFromFolder(root, path);
}

async function perform(root: string, action: ChangeAction, plan: Extract<Plan, { allowed: true }>): Promise<void> {
  switch (action.kind) {
    case "discard":
      if (action.area === "unstaged") await runGit(root, ["restore", "--worktree", "--", ...plan.paths]);
      else await backToLastCommit(root, plan.paths);
      return;
    case "unstage":
      if (await headExists(root)) await runGit(root, ["restore", "--staged", "--", ...plan.paths]);
      else await runGit(root, ["rm", "--cached", "-q", "--", ...plan.paths]);
      return;
    case "delete":
      for (const path of plan.untracked) await removeFromFolder(root, path);
      return;
    case "discard-all": {
      const untracked = new Set(plan.untracked);
      await backToLastCommit(root, plan.paths.filter((path) => !untracked.has(path)));
      for (const path of untracked) await removeFromFolder(root, path);
      return;
    }
  }
}

/**
 * Applies an action only if the repository still matches the fingerprint the user confirmed.
 * A backup ref is written and verified first; its after-state is recorded even if the action
 * fails partway, so Undo can always put everything back.
 */
export function applyChange(root: string, action: ChangeAction, expected: string): Promise<string> {
  return serialized(root, async () => {
    const plan = await currentPlan(root, action);
    if (!plan.allowed) throw new Error(plan.reason);
    if ((await fingerprintFor(root, action, plan.paths)) !== expected) {
      throw new Error("The files changed since you looked, so nothing was changed. Review them and try again.");
    }
    const backupId = await createBackup(root, action, plan.paths);
    if (!(await runGitOptional(root, ["rev-parse", "-q", "--verify", backupRef(backupId)])).trim()) {
      throw new Error("The backup could not be saved, so nothing was changed.");
    }
    try {
      await perform(root, action, plan);
    } catch (error) {
      await recordAfterState(root, backupId);
      const reason = error instanceof Error ? error.message : "The change failed";
      throw new Error(`${reason}. Your files before the change are saved in backup ${backupId}, which you can restore.`);
    }
    await recordAfterState(root, backupId);
    await pruneBackups(root);
    return backupId;
  });
}

/** Restores a backup under the same per-repository lock as the writes. */
export function restoreChange(root: string, backupId: string): Promise<string[]> {
  return serialized(root, () => restoreBackup(root, backupId));
}
