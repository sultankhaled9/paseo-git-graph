import type { BranchList, LocalBranch, RemoteBranch, SwitchPreview } from "./contracts";
import { pluralize } from "./format";

/** Branches whose name contains every word of the query, ignoring case; the current branch stays first. */
export function filterBranches(list: BranchList, query: string): { local: LocalBranch[]; remote: RemoteBranch[] } {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = (name: string) => words.every((word) => name.toLowerCase().includes(word));
  const local = list.local.filter((branch) => matches(branch.name));
  return {
    local: [...local.filter((branch) => branch.current), ...local.filter((branch) => !branch.current)],
    remote: list.remote.filter((branch) => matches(branch.name)),
  };
}

/** Why a listed branch cannot be picked, or null when it can. */
export function unavailableReason(branch: LocalBranch | RemoteBranch): string | null {
  if ("current" in branch) {
    if (branch.current) return "You are on this branch";
    if (branch.otherWorktree) return `Open in another worktree (${branch.otherWorktree})`;
    return null;
  }
  return branch.nameTaken ? `A local ${branch.localName} already exists; pick that one` : null;
}

/** The confirmation for an allowed switch, in plain words. */
export function describeSwitch(preview: Extract<SwitchPreview, { allowed: true }>): { title: string; detail: string } {
  const where = preview.tracks
    ? `A new local branch ${preview.branch} is created to track ${preview.tracks}, and you switch to it.`
    : `Your files change to match ${preview.branch}.`;
  const carried =
    preview.carriedFiles === 0
      ? "You have no uncommitted changes."
      : `Your ${pluralize(preview.carriedFiles, "uncommitted file")} ${preview.carriedFiles === 1 ? "comes" : "come"} along. If git would have to overwrite any of them, nothing changes and you are told which.`;
  return { title: `Switch to ${preview.branch}?`, detail: `${where} ${carried}` };
}
