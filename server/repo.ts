import { createHash } from "node:crypto";
import { DIFF_MAX_BYTES, SYNC_COMMITS_LIMIT } from "../shared/constants";
import { fileInArea } from "../shared/status-text";
import type {
  CommitDetail,
  CommitSummary,
  Identity,
  LogScope,
  RepoStatus,
  SyncCommits,
  WipArea,
} from "../shared/contracts";
import { type CappedOutput, runGit, runGitCapped, runGitOptional } from "./git";
import {
  COMMIT_FORMAT,
  IDENTITY_KEYS_PATTERN,
  LOG_FORMAT,
  parseCommitDetail,
  parseIdentity,
  parseLog,
  parseStatus,
} from "./parse";

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

function readIdentityConfig(root: string): Promise<string> {
  return runGitOptional(root, ["config", "--get-regexp", IDENTITY_KEYS_PATTERN]);
}

export async function getIdentity(root: string): Promise<Identity> {
  return parseIdentity(await readIdentityConfig(root));
}

export async function getStatus(root: string): Promise<RepoStatus> {
  return parseStatus(await runGit(root, STATUS_ARGS), root);
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
  const [refs, symbolicHead, headOid, status, identity] = await Promise.all([
    // %(upstream) puts each branch's tracking setting in the token, so changing it refreshes views.
    runGit(root, ["for-each-ref", "--format=%(objectname) %(refname) %(upstream)"]),
    runGitOptional(root, ["symbolic-ref", "-q", "HEAD"]),
    runGitOptional(root, ["rev-parse", "-q", "--verify", "HEAD"]),
    runGit(root, STATUS_ARGS),
    readIdentityConfig(root),
  ]);
  // Identity rides on the worktree token so a changed user.email refetches the identity query.
  return { refsToken: sha1(refs, symbolicHead, headOid), worktreeToken: sha1(status, identity) };
}

const DIFF_SAFETY_FLAGS: readonly string[] = ["--no-color", "--no-ext-diff", "--no-textconv"];
const NULL_DEVICE = "/dev/null";
const NO_INDEX_EXIT_CODES: readonly number[] = [0, 1];

/**
 * Diffs one uncommitted file. The path must appear in a fresh, unfiltered `git status` for that
 * exact area before anything runs, because `diff --no-index` would otherwise read any file on
 * disk. Status is not limited to the path: a pathspec hides rename pairing.
 */
export async function getWipDiff(root: string, path: string, area: WipArea): Promise<CappedOutput> {
  const status = parseStatus(await runGit(root, STATUS_ARGS), root, Number.POSITIVE_INFINITY);
  const file = status.files.find((candidate) => candidate.path === path);
  if (!file || !fileInArea(file, area)) throw new Error(`${path} has no ${area} changes now`);

  switch (area) {
    case "staged":
      return runGitCapped(
        root,
        ["diff", "--cached", "-M", ...DIFF_SAFETY_FLAGS, "--", ...(file.origPath ? [file.origPath, path] : [path])],
        DIFF_MAX_BYTES,
      );
    case "unstaged":
    case "conflicted":
      return runGitCapped(root, ["diff", ...DIFF_SAFETY_FLAGS, "--", path], DIFF_MAX_BYTES);
    case "untracked":
      return runGitCapped(
        root,
        ["diff", "--no-index", ...DIFF_SAFETY_FLAGS, "--", NULL_DEVICE, path],
        DIFF_MAX_BYTES,
        NO_INDEX_EXIT_CODES,
      );
  }
}

const SHORT_REFNAME_PREFIX = "refs/remotes/";

async function syncLog(root: string, revisions: readonly string[]): Promise<{ commits: CommitSummary[]; truncated: boolean }> {
  const stdout = await runGit(root, [
    "log",
    "--topo-order",
    "--decorate=full",
    `--max-count=${SYNC_COMMITS_LIMIT + 1}`,
    `--format=${LOG_FORMAT}`,
    ...revisions,
  ]);
  const commits = parseLog(stdout);
  return { commits: commits.slice(0, SYNC_COMMITS_LIMIT), truncated: commits.length > SYNC_COMMITS_LIMIT };
}

/** The branch's tracked remote branch, only if it is configured and has been fetched. */
async function fetchedUpstream(root: string): Promise<string | null> {
  const branch = (await runGitOptional(root, ["symbolic-ref", "-q", "HEAD"])).trim();
  if (!branch) return null;
  const upstream = (await runGit(root, ["for-each-ref", "--format=%(upstream)", branch])).trim();
  if (!upstream) return null;
  return (await runGitOptional(root, ["rev-parse", "-q", "--verify", upstream])).trim() ? upstream : null;
}

/**
 * Commits that exist only on this machine or only on the server, as of the last fetch. Revisions
 * here are git's own (HEAD, full refnames), so `--not --remotes` can follow them as options.
 */
export async function getSyncCommits(root: string): Promise<SyncCommits> {
  const empty = { toPush: [], toPull: [], toPushTruncated: false, toPullTruncated: false };
  const [headOid, remotes, upstream] = await Promise.all([
    runGitOptional(root, ["rev-parse", "-q", "--verify", "HEAD"]),
    runGit(root, ["remote"]),
    fetchedUpstream(root),
  ]);
  const hasRemotes = remotes.trim().length > 0;
  if (!headOid.trim()) return { mode: hasRemotes ? "remotes" : "none", upstream: null, ...empty };

  if (upstream) {
    const [toPush, toPull] = await Promise.all([
      syncLog(root, ["--end-of-options", `${upstream}..HEAD`]),
      syncLog(root, ["--end-of-options", `HEAD..${upstream}`]),
    ]);
    return {
      mode: "upstream",
      upstream: upstream.startsWith(SHORT_REFNAME_PREFIX) ? upstream.slice(SHORT_REFNAME_PREFIX.length) : upstream,
      toPush: toPush.commits,
      toPull: toPull.commits,
      toPushTruncated: toPush.truncated,
      toPullTruncated: toPull.truncated,
    };
  }
  if (!hasRemotes) return { mode: "none", upstream: null, ...empty };
  const localOnly = await syncLog(root, ["HEAD", "--not", "--remotes"]);
  return { mode: "remotes", upstream: null, ...empty, toPush: localOnly.commits, toPushTruncated: localOnly.truncated };
}
