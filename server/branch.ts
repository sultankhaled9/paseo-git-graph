import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { LOCAL_BRANCH_PREFIX, MAX_LISTED_BRANCHES, REMOTE_BRANCH_PREFIX } from "../shared/constants";
import type { BranchList, LocalBranch, RemoteBranch, SwitchPreview } from "../shared/contracts";
import { GitError, runGit, runGitOptional, runGitRaw } from "./git";
import { parseStatus } from "./parse";
import { STATUS_ARGS } from "./repo";
import { OPERATION_IN_PROGRESS_REASON, operationInProgress, serialized } from "./repo-lock";

const FIELD = "\x1f";
const RECORD = "\x1e";
/** for-each-ref spells hex escapes as %XX (not %xXX). */
const BRANCH_FORMAT = [
  "%(refname)",
  "%(upstream)",
  "%(upstream:short)",
  "%(HEAD)",
  "%(worktreepath)",
  "%(symref)",
  "%(committerdate:iso-strict)",
  "%(contents:subject)",
].join("%1f");
const CURRENT_MARKER = "*";
/** git's messages are matched in English, whatever the daemon's locale. */
const ENGLISH_GIT: Readonly<Record<string, string>> = { LC_ALL: "C", LANGUAGE: "" };
/** Never create branches by guessing, never clobber ignored files such as .env, never force. */
const SWITCH_ARGS: readonly string[] = ["switch", "--no-guess", "--no-overwrite-ignore"];
const OVERWRITE_HEADINGS: readonly { heading: string; kind: "changed" | "untracked" }[] = [
  { heading: "Your local changes to the following files would be overwritten by checkout:", kind: "changed" },
  { heading: "The following untracked working tree files would be overwritten by checkout:", kind: "untracked" },
];
const REMOTE_HEAD_SUFFIX = "/HEAD";

interface RefRecord {
  ref: string;
  upstream: string;
  upstreamShort: string;
  current: boolean;
  worktree: string;
  symref: string;
  date: string;
  subject: string;
}

function parseRecords(stdout: string): RefRecord[] {
  const records: RefRecord[] = [];
  for (const raw of stdout.split(RECORD)) {
    const record = raw.replace(/^\n/, "");
    if (!record) continue;
    const [ref = "", upstream = "", upstreamShort = "", head = "", worktree = "", symref = "", date = "", subject = ""] = record.split(FIELD);
    records.push({ ref, upstream, upstreamShort, current: head === CURRENT_MARKER, worktree, symref, date, subject });
  }
  return records;
}

/** The local name git would give a branch tracking `remoteName` ("origin/feature/x" becomes "feature/x"). */
export function localNameFor(remoteName: string): string {
  const slash = remoteName.indexOf("/");
  return slash < 0 ? remoteName : remoteName.slice(slash + 1);
}

/**
 * Local branches, then remote branches that no local branch tracks yet, newest commit first, from
 * one git call. A remote whose local name is already used by another branch is marked, not hidden.
 */
export async function listBranches(root: string): Promise<BranchList> {
  const stdout = await runGit(root, [
    "for-each-ref",
    "--sort=-committerdate",
    `--count=${MAX_LISTED_BRANCHES + 1}`,
    `--format=${BRANCH_FORMAT}%1e`,
    LOCAL_BRANCH_PREFIX,
    REMOTE_BRANCH_PREFIX,
  ]);
  const all = parseRecords(stdout);
  const truncated = all.length > MAX_LISTED_BRANCHES;
  const records = all.slice(0, MAX_LISTED_BRANCHES);
  const here = resolve(root);

  const local: LocalBranch[] = [];
  const tracked = new Set<string>();
  const localNames = new Set<string>();
  for (const record of records) {
    if (!record.ref.startsWith(LOCAL_BRANCH_PREFIX)) continue;
    const name = record.ref.slice(LOCAL_BRANCH_PREFIX.length);
    if (record.upstream) tracked.add(record.upstream);
    localNames.add(name);
    local.push({
      ref: record.ref,
      name,
      upstream: record.upstreamShort || null,
      current: record.current,
      otherWorktree: record.worktree && resolve(record.worktree) !== here ? record.worktree : null,
      subject: record.subject,
      date: record.date,
    });
  }

  const remote: RemoteBranch[] = [];
  for (const record of records) {
    if (!record.ref.startsWith(REMOTE_BRANCH_PREFIX) || record.symref || record.ref.endsWith(REMOTE_HEAD_SUFFIX)) continue;
    if (tracked.has(record.ref)) continue;
    const name = record.ref.slice(REMOTE_BRANCH_PREFIX.length);
    const localName = localNameFor(name);
    remote.push({ ref: record.ref, name, localName, nameTaken: localNames.has(localName), subject: record.subject, date: record.date });
  }
  return { local, remote, truncated };
}

/**
 * Explains why git refused a switch, in plain words. git only refuses before touching anything, so
 * the message always says nothing changed.
 */
export function describeSwitchRefusal(stderr: string): string {
  const lines = stderr.split("\n");
  const clashes: string[] = [];
  for (const { heading, kind } of OVERWRITE_HEADINGS) {
    const start = lines.findIndex((line) => line.endsWith(heading));
    if (start < 0) continue;
    const files = [];
    for (const line of lines.slice(start + 1)) {
      if (!line.startsWith("\t")) break;
      files.push(line.slice(1));
    }
    clashes.push(
      kind === "changed"
        ? `your uncommitted changes in ${files.join(", ")}`
        : `files git does not track (${files.join(", ")}), which that branch has too`,
    );
  }
  if (clashes.length > 0) {
    return `Switching would overwrite ${clashes.join(" and ")}, so nothing changed. Commit, discard, or move them first.`;
  }
  const first = stderr.trim().split("\n")[0]?.replace(/^(error|fatal): /, "") ?? "";
  return `${first || "git refused to switch"}. Nothing changed.`;
}

interface SwitchPlan {
  branch: string;
  /** The remote branch to track when a new local branch is created. */
  tracks: { ref: string; name: string } | null;
  carriedFiles: number;
  fingerprint: string;
}

async function headState(root: string): Promise<{ ref: string; oid: string }> {
  const [ref, oid] = await Promise.all([
    runGitOptional(root, ["symbolic-ref", "-q", "HEAD"]),
    runGitOptional(root, ["rev-parse", "-q", "--verify", "HEAD"]),
  ]);
  return { ref: ref.trim(), oid: oid.trim() };
}

async function validBranchName(root: string, name: string): Promise<boolean> {
  try {
    await runGit(root, ["check-ref-format", "--branch", name]);
    return true;
  } catch {
    return false;
  }
}

async function planSwitch(root: string, ref: string): Promise<SwitchPlan | { reason: string }> {
  if (await operationInProgress(root)) return { reason: OPERATION_IN_PROGRESS_REASON };
  const rawStatus = await runGit(root, STATUS_ARGS);
  const status = parseStatus(rawStatus, root, Number.POSITIVE_INFINITY);
  if (status.conflicted > 0) return { reason: "Some files have merge conflicts. Resolve them before switching." };
  const list = await listBranches(root);
  const local = list.local.find((branch) => branch.ref === ref);
  const remote = list.remote.find((branch) => branch.ref === ref);
  let branch: string;
  let tracks: SwitchPlan["tracks"] = null;
  if (local) {
    if (local.current) return { reason: `You are already on ${local.name}.` };
    if (local.otherWorktree) {
      return { reason: `${local.name} is open in another worktree at ${local.otherWorktree}, and git allows a branch in only one place.` };
    }
    branch = local.name;
  } else if (remote) {
    if (remote.nameTaken) {
      return { reason: `A local branch named ${remote.localName} already exists and tracks something else. Switch to ${remote.localName} instead.` };
    }
    branch = remote.localName;
    tracks = { ref: remote.ref, name: remote.name };
  } else {
    return { reason: "That branch no longer exists. Reopen the list to see the current branches." };
  }
  if (!(await validBranchName(root, branch))) return { reason: `${branch} is not a valid branch name.` };
  const [head, target] = await Promise.all([headState(root), runGit(root, ["rev-parse", "--verify", `${ref}^{commit}`])]);
  const fingerprint = createHash("sha256")
    .update([ref, target.trim(), head.ref, head.oid].join("\0"))
    .update("\0")
    .update(rawStatus)
    .digest("hex");
  return { branch, tracks, carriedFiles: status.files.length, fingerprint };
}

/** What a switch would do, or why it cannot; changes nothing. */
export async function previewSwitch(root: string, ref: string): Promise<SwitchPreview> {
  const plan = await planSwitch(root, ref);
  if ("reason" in plan) return { allowed: false, reason: plan.reason };
  return { allowed: true, branch: plan.branch, tracks: plan.tracks?.name ?? null, carriedFiles: plan.carriedFiles, fingerprint: plan.fingerprint };
}

/**
 * Switches only if nothing moved since the preview. Uncommitted changes come along; git refuses,
 * changing nothing, if it would have to overwrite any of them or an ignored file. Shares the lock
 * with discard and restore, so writes to one repository never interleave.
 */
export function switchBranch(root: string, ref: string, expected: string): Promise<{ branch: string; previous: string | null }> {
  return serialized(root, async () => {
    const plan = await planSwitch(root, ref);
    if ("reason" in plan) throw new Error(plan.reason);
    if (plan.fingerprint !== expected) {
      throw new Error("The branch or your files changed since you looked, so nothing changed. Open the list and try again.");
    }
    const previous = (await headState(root)).ref;
    const args = plan.tracks
      ? [...SWITCH_ARGS, "--track", "--create", plan.branch, "--end-of-options", plan.tracks.ref]
      : [...SWITCH_ARGS, "--end-of-options", plan.branch];
    try {
      await runGitRaw(root, args, { env: ENGLISH_GIT });
    } catch (error) {
      throw new Error(error instanceof GitError ? describeSwitchRefusal(error.stderr) : "git refused to switch. Nothing changed.");
    }
    return { branch: plan.branch, previous: previous.startsWith(LOCAL_BRANCH_PREFIX) ? previous : null };
  });
}
