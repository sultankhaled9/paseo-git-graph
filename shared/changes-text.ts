import type { RepoStatus, SyncCommits, WipArea } from "./contracts";
import { pluralize } from "./format";

function amount(count: number, truncated: boolean, singular: string, plural?: string): string {
  return truncated ? `more than ${pluralize(count, singular, plural)}` : pluralize(count, singular, plural);
}

/**
 * The one-line summary at the top of My Changes, e.g.
 * "3 files changed, 2 commits not pushed to origin/main, 1 commit to pull".
 * Each status entry is one path, so a partly staged file counts once.
 */
export function summarizeChanges(status: RepoStatus, sync: SyncCommits): string {
  const parts: string[] = [];
  if (status.files.length > 0) parts.push(`${amount(status.files.length, status.filesTruncated, "file")} changed`);
  if (sync.toPush.length > 0) {
    const commits = amount(sync.toPush.length, sync.toPushTruncated, "commit");
    parts.push(sync.mode === "upstream" && sync.upstream ? `${commits} not pushed to ${sync.upstream}` : `${commits} not on any remote yet`);
  }
  if (sync.toPull.length > 0 && sync.upstream) {
    parts.push(`${amount(sync.toPull.length, sync.toPullTruncated, "commit")} to pull from ${sync.upstream}`);
  }
  if (parts.length > 0) return parts.join(", ");
  if (sync.mode === "upstream" && sync.upstream) return `Everything is committed and in sync with ${sync.upstream}.`;
  if (sync.mode === "remotes") return "Everything is committed and already on a remote.";
  return "Everything is committed. This repository has no remote, so nothing is shared yet.";
}

const AREA_EXPLANATIONS: Readonly<Record<WipArea, string>> = {
  conflicted: "These files have merge conflicts. Open each one, keep the right version, then stage it.",
  staged: "Ready to commit: these changes go into your next commit.",
  unstaged: "Changed but not staged yet. Stage them to include them in your next commit.",
  untracked: "New files git is not tracking yet. Stage them if they belong in the repository.",
};

export function explainArea(area: WipArea): string {
  return AREA_EXPLANATIONS[area];
}

export interface SectionText {
  title: string;
  explanation: string;
}

/** Title and explanation for the commits that exist only on this machine. */
export function describeToPush(sync: SyncCommits): SectionText {
  if (sync.mode === "upstream" && sync.upstream) {
    return {
      title: "Not pushed yet",
      explanation: `Saved on your machine but not on ${sync.upstream} yet. Push to share them.`,
    };
  }
  return {
    title: "Only on this machine",
    explanation:
      "No remote has these commits yet, and this branch does not track a remote branch. Push it with an upstream to share them.",
  };
}

/** Title and explanation for commits on the server that the local branch does not have. */
export function describeToPull(sync: SyncCommits): SectionText {
  const source = sync.upstream ?? "the remote";
  return {
    title: "To pull",
    explanation: `On ${source} but not on your branch yet, as of your last fetch. Pull to get them.`,
  };
}

/** A note shown when there is nowhere to push to at all. */
export function describeNoRemote(sync: SyncCommits): string | null {
  return sync.mode === "none" ? "This repository has no remote, so commits stay on this machine." : null;
}
