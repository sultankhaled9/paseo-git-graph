import { createHash } from "node:crypto";
import { DIFF_MAX_BYTES } from "../shared/constants";
import type { CommitDetail, CommitSummary, Identity, LogScope, RepoStatus } from "../shared/contracts";
import { type CappedOutput, runGit, runGitCapped, runGitOptional } from "./git";
import { COMMIT_FORMAT, LOG_FORMAT, parseCommitDetail, parseLog, parseStatus } from "./parse";

const STATUS_ARGS: readonly string[] = [
  "status",
  "--porcelain=v2",
  "--branch",
  "-z",
  "--untracked-files=all",
];

function sha1(...parts: readonly string[]): string {
  const hash = createHash("sha1");
  for (const part of parts) hash.update(part).update("\0");
  return hash.digest("hex");
}

async function configValue(root: string, key: string): Promise<string | null> {
  const value = (await runGitOptional(root, ["config", "--get", key])).trim();
  return value.length > 0 ? value : null;
}

export async function getIdentity(root: string): Promise<Identity> {
  const [name, email] = await Promise.all([
    configValue(root, "user.name"),
    configValue(root, "user.email"),
  ]);
  return { name, email };
}

export async function getStatus(root: string): Promise<RepoStatus> {
  const [stdout, identity] = await Promise.all([runGit(root, STATUS_ARGS), getIdentity(root)]);
  return { ...parseStatus(stdout, root), identity };
}

// Stash refs point at internal index and untracked commits that are noise in a history graph.
const ALL_BRANCHES: readonly string[] = ["--exclude=refs/stash", "--all"];

export async function getLog(
  root: string,
  limit: number,
  scope: LogScope,
): Promise<{ commits: CommitSummary[]; hasMore: boolean }> {
  if (scope === "head" && !(await runGitOptional(root, ["rev-parse", "-q", "--verify", "HEAD"])).trim()) {
    return { commits: [], hasMore: false };
  }
  const stdout = await runGit(root, [
    "log",
    ...(scope === "all" ? ALL_BRANCHES : ["HEAD"]),
    "--topo-order",
    "--decorate=full",
    `--max-count=${limit + 1}`,
    `--format=${LOG_FORMAT}`,
  ]);
  const commits = parseLog(stdout);
  return { commits: commits.slice(0, limit), hasMore: commits.length > limit };
}

export async function getCommit(root: string, hash: string): Promise<CommitDetail> {
  const stdout = await runGit(root, [
    "show",
    "-z",
    "--raw",
    "--numstat",
    "-M",
    "--diff-merges=first-parent",
    `--format=${COMMIT_FORMAT}`,
    "--end-of-options",
    hash,
    "--",
  ]);
  return parseCommitDetail(stdout);
}

/** Passing a rename's old path too lets git pair both sides instead of showing an addition. */
export function getDiff(
  root: string,
  hash: string,
  path: string,
  oldPath?: string,
): Promise<CappedOutput> {
  return runGitCapped(
    root,
    [
      "show",
      "--format=",
      "--no-color",
      "--no-ext-diff",
      "--no-textconv",
      "-M",
      "--diff-merges=first-parent",
      "--end-of-options",
      hash,
      "--",
      ...(oldPath ? [oldPath, path] : [path]),
    ],
    DIFF_MAX_BYTES,
  );
}

export async function getRevision(
  root: string,
): Promise<{ refsToken: string; worktreeToken: string }> {
  const [refs, symbolicHead, headOid, status] = await Promise.all([
    runGit(root, ["for-each-ref", "--format=%(objectname) %(refname)"]),
    runGitOptional(root, ["symbolic-ref", "-q", "HEAD"]),
    runGitOptional(root, ["rev-parse", "-q", "--verify", "HEAD"]),
    runGit(root, STATUS_ARGS),
  ]);
  return { refsToken: sha1(refs, symbolicHead, headOid), worktreeToken: sha1(status) };
}
