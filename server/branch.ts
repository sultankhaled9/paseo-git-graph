import { resolve } from "node:path";
import { LOCAL_BRANCH_PREFIX, MAX_LISTED_BRANCHES, REMOTE_BRANCH_PREFIX } from "../shared/constants";
import type { BranchList, LocalBranch, RemoteBranch } from "../shared/contracts";
import { runGit } from "./git";

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
