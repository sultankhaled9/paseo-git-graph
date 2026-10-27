import type { RepoStatus, StatusFile, WipArea } from "./contracts";
import { STATUS_UNCHANGED as UNCHANGED } from "./constants";
import { pluralize, shortHash } from "./format";

export interface HeadDescription {
  lead: string;
  name: string;
  detail: string | null;
}

/** The "what is now" sentence, split so the branch name can be emphasized. */
export function describeHead(status: RepoStatus): HeadDescription {
  if (status.detached) {
    return { lead: "Detached at", name: status.headOid ? shortHash(status.headOid) : "HEAD", detail: "not on a branch" };
  }
  const name = status.branch ?? "HEAD";
  if (!status.headOid) return { lead: "On", name, detail: "no commits yet" };
  if (!status.upstream) return { lead: "On", name, detail: "not tracking a remote branch" };
  const { ahead, behind, upstream } = status;
  if (ahead === 0 && behind === 0) return { lead: "On", name, detail: `up to date with ${upstream}` };
  if (ahead > 0 && behind > 0) return { lead: "On", name, detail: `${ahead} ahead and ${behind} behind ${upstream}` };
  if (ahead > 0) return { lead: "On", name, detail: `${pluralize(ahead, "commit")} ahead of ${upstream}` };
  return { lead: "On", name, detail: `${pluralize(behind, "commit")} behind ${upstream}` };
}

export interface WipGroup {
  area: WipArea;
  title: string;
  files: StatusFile[];
}

const AREA_TITLES: Readonly<Record<WipArea, string>> = {
  conflicted: "Conflicts",
  staged: "Staged (ready to commit)",
  unstaged: "Not staged",
  untracked: "New files (untracked)",
};

const AREA_ORDER: readonly WipArea[] = ["conflicted", "staged", "unstaged", "untracked"];

/** Whether a worktree file has changes in an area. The daemon uses this to authorize WIP diffs. */
export function fileInArea(file: StatusFile, area: WipArea): boolean {
  switch (area) {
    case "staged":
      return (file.kind === "changed" || file.kind === "renamed") && file.index !== UNCHANGED;
    case "unstaged":
      return (file.kind === "changed" || file.kind === "renamed") && file.worktree !== UNCHANGED;
    case "untracked":
      return file.kind === "untracked";
    case "conflicted":
      return file.kind === "unmerged";
  }
}

/** Groups worktree files by area; a file both staged and edited again appears in both groups. */
export function groupWorkInProgress(files: readonly StatusFile[]): WipGroup[] {
  return AREA_ORDER.map((area) => ({
    area,
    title: AREA_TITLES[area],
    files: files.filter((file) => fileInArea(file, area)),
  })).filter((group) => group.files.length > 0);
}

const CHANGE_WORDS: Readonly<Record<string, string>> = {
  M: "modified",
  A: "added",
  D: "deleted",
  R: "renamed",
  C: "copied",
  T: "type changed",
  U: "conflict",
};

/** A plain word for a file's change in one area, from its porcelain status letter. */
export function describeWipChange(file: StatusFile, area: WipArea): string {
  if (area === "untracked") return "new";
  if (area === "conflicted") return "conflict";
  const letter = area === "staged" ? file.index : file.worktree;
  return CHANGE_WORDS[letter] ?? "changed";
}
