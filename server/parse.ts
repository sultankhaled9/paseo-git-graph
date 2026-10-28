import { STATUS_MAX_FILES, STATUS_UNCHANGED as UNCHANGED } from "../shared/constants";
import type {
  ChangeType,
  CommitDetail,
  FileStat,
  Identity,
  CommitSummary,
  FileChange,
  Ref,
  RepoStatus,
  StatusFile,
} from "../shared/contracts";

const FIELD = "\x1f";
const RECORD = "\x1e";

export const LOG_FORMAT = `${["%H", "%P", "%an", "%ae", "%aI", "%D", "%s"].join("%x1f")}%x1e`;
export const COMMIT_FORMAT = `${["%H", "%P", "%an", "%ae", "%aI", "%cn", "%ce", "%cI", "%B"].join("%x1f")}%x1e`;

const LOG_FIELDS_BEFORE_SUBJECT = 6;
const COMMIT_FIELDS_BEFORE_MESSAGE = 8;

const HEAD_POINTER = "HEAD -> ";
const TAG_DECORATION = "tag: ";
const HEADS_PREFIX = "refs/heads/";
const REMOTES_PREFIX = "refs/remotes/";
const TAGS_PREFIX = "refs/tags/";
const REFS_PREFIX = "refs/";
const REMOTE_HEAD_SUFFIX = "/HEAD";

function splitParents(value: string): string[] {
  return value.split(" ").filter((parent) => parent.length > 0);
}

function classifyRef(fullName: string, isCurrent: boolean): Ref | null {
  if (fullName.startsWith(HEADS_PREFIX)) {
    return { name: fullName.slice(HEADS_PREFIX.length), kind: "branch", isCurrent };
  }
  if (fullName.startsWith(REMOTES_PREFIX)) {
    const name = fullName.slice(REMOTES_PREFIX.length);
    return name.endsWith(REMOTE_HEAD_SUFFIX) ? null : { name, kind: "remote", isCurrent: false };
  }
  if (fullName.startsWith(TAGS_PREFIX)) {
    return { name: fullName.slice(TAGS_PREFIX.length), kind: "tag", isCurrent: false };
  }
  const name = fullName.startsWith(REFS_PREFIX) ? fullName.slice(REFS_PREFIX.length) : fullName;
  return { name, kind: "other", isCurrent: false };
}

/** Parses a `%D` decoration produced with `--decorate=full`. Ref names cannot contain spaces. */
export function parseRefs(decoration: string): Ref[] {
  const refs: Ref[] = [];
  for (const entry of decoration.split(", ")) {
    if (entry.length === 0) continue;
    let ref: Ref | null;
    if (entry === "HEAD") {
      ref = { name: "HEAD", kind: "head", isCurrent: true };
    } else if (entry.startsWith(HEAD_POINTER)) {
      ref = classifyRef(entry.slice(HEAD_POINTER.length), true);
    } else if (entry.startsWith(TAG_DECORATION)) {
      ref = classifyRef(entry.slice(TAG_DECORATION.length), false);
    } else {
      ref = classifyRef(entry, false);
    }
    if (ref) refs.push(ref);
  }
  return refs;
}

function records(stdout: string): string[] {
  return stdout
    .split(RECORD)
    .map((record) => record.replace(/^\n/, ""))
    .filter((record) => record.length > 0);
}

export function parseLog(stdout: string): CommitSummary[] {
  return records(stdout).map((record) => {
    const fields = record.split(FIELD);
    const [hash = "", parents = "", authorName = "", authorEmail = "", authorDate = "", refs = ""] =
      fields;
    return {
      hash,
      parents: splitParents(parents),
      authorName,
      authorEmail,
      authorDate,
      refs: parseRefs(refs),
      subject: fields.slice(LOG_FIELDS_BEFORE_SUBJECT).join(FIELD),
    };
  });
}

const BRANCH_OID = "# branch.oid ";
const BRANCH_HEAD = "# branch.head ";
const BRANCH_UPSTREAM = "# branch.upstream ";
const BRANCH_AB = "# branch.ab ";
const INITIAL_OID = "(initial)";
const DETACHED_HEAD = "(detached)";

const ORDINARY_FIELDS = 8;
const RENAMED_FIELDS = 9;
const UNMERGED_FIELDS = 10;
const XY_INDEX = 2;
const PATH_AFTER_MARKER = 2;

function statusXY(entry: string): { x: string; y: string } {
  return { x: entry.charAt(XY_INDEX), y: entry.charAt(XY_INDEX + 1) };
}

/** Returns the remainder of `line` after `count` space-separated fields; paths may contain spaces. */
function afterFields(line: string, count: number): string {
  let index = -1;
  for (let field = 0; field < count; field += 1) index = line.indexOf(" ", index + 1);
  return line.slice(index + 1);
}

export function parseStatus(stdout: string, root: string, maxFiles = STATUS_MAX_FILES): RepoStatus {
  const status: RepoStatus = {
    root,
    branch: null,
    headOid: null,
    detached: false,
    upstream: null,
    ahead: 0,
    behind: 0,
    staged: 0,
    unstaged: 0,
    untracked: 0,
    conflicted: 0,
    files: [],
    filesTruncated: false,
  };
  const addFile = (file: StatusFile) => {
    if (status.files.length < maxFiles) status.files.push(file);
    else status.filesTruncated = true;
  };
  const tokens = stdout.split("\0");

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index] ?? "";
    if (token.length === 0) continue;

    if (token.startsWith(BRANCH_OID)) {
      const oid = token.slice(BRANCH_OID.length);
      status.headOid = oid === INITIAL_OID ? null : oid;
    } else if (token.startsWith(BRANCH_HEAD)) {
      const head = token.slice(BRANCH_HEAD.length);
      status.detached = head === DETACHED_HEAD;
      status.branch = status.detached ? null : head;
    } else if (token.startsWith(BRANCH_UPSTREAM)) {
      status.upstream = token.slice(BRANCH_UPSTREAM.length);
    } else if (token.startsWith(BRANCH_AB)) {
      const match = /^\+(\d+) -(\d+)$/.exec(token.slice(BRANCH_AB.length));
      if (match) {
        status.ahead = Number(match[1]);
        status.behind = Number(match[2]);
      }
    } else if (token.startsWith("1 ") || token.startsWith("2 ")) {
      const renamed = token.startsWith("2 ");
      const { x, y } = statusXY(token);
      if (x !== UNCHANGED) status.staged += 1;
      if (y !== UNCHANGED) status.unstaged += 1;
      const path = afterFields(token, renamed ? RENAMED_FIELDS : ORDINARY_FIELDS);
      if (renamed) {
        index += 1;
        addFile({ path, origPath: tokens[index] ?? "", index: x, worktree: y, kind: "renamed" });
      } else {
        addFile({ path, index: x, worktree: y, kind: "changed" });
      }
    } else if (token.startsWith("u ")) {
      const { x, y } = statusXY(token);
      status.conflicted += 1;
      addFile({ path: afterFields(token, UNMERGED_FIELDS), index: x, worktree: y, kind: "unmerged" });
    } else if (token.startsWith("? ")) {
      status.untracked += 1;
      addFile({ path: token.slice(PATH_AFTER_MARKER), index: "?", worktree: "?", kind: "untracked" });
    }
  }
  return status;
}

const NUMSTAT_PATTERN = /^(-|\d+)\t(-|\d+)\t([\s\S]*)$/;
const BINARY_STAT = "-";
const RAW_PREFIX = ":";

const CHANGE_TYPES: Readonly<Record<string, ChangeType>> = {
  A: "added",
  M: "modified",
  D: "deleted",
  R: "renamed",
  C: "copied",
  T: "type-changed",
};
const PAIRED_STATUSES = new Set(["R", "C"]);

function changeKey(path: string, oldPath?: string): string {
  return `${oldPath ?? ""}\0${path}`;
}

function toCount(value: string): number | null {
  return value === BINARY_STAT ? null : Number(value);
}

interface NumstatRecord {
  stat: FileStat;
  /** Extra NUL-separated tokens the record used after its first (rename old and new paths). */
  extraTokens: number;
}

/** Reads one `--numstat -z` record at `index`: "A\tD\tpath", or "A\tD\t" then old and new paths. */
function readNumstat(tokens: readonly string[], index: number): NumstatRecord | null {
  const match = NUMSTAT_PATTERN.exec(tokens[index] ?? "");
  if (!match) return null;
  const [, additions = BINARY_STAT, deletions = BINARY_STAT, path = ""] = match;
  const counts = { additions: toCount(additions), deletions: toCount(deletions) };
  if (path.length > 0) return { stat: { path, ...counts }, extraTokens: 0 };
  return {
    stat: { path: tokens[index + 2] ?? "", oldPath: tokens[index + 1] ?? "", ...counts },
    extraTokens: 2,
  };
}

/** Parses `git diff --numstat -z` output into per-file line counts (null counts for binary files). */
export function parseNumstat(stdout: string): FileStat[] {
  const tokens = stdout.replace(/^\n/, "").split("\0");
  const stats: FileStat[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const record = readNumstat(tokens, index);
    if (!record) continue;
    stats.push(record.stat);
    index += record.extraTokens;
  }
  return stats;
}

/**
 * Parses `git show -z --raw --numstat --format=COMMIT_FORMAT`. Raw records (":modes shas STATUS",
 * then the path, or old and new paths for renames and copies) come first, then numstat records;
 * numstat renames emit an empty path then old and new as separate fields. Files are joined on
 * their path pair; a numstat entry without a raw record is reported as modified.
 */
export function parseCommitDetail(stdout: string): CommitDetail {
  const headerEnd = stdout.indexOf(RECORD);
  if (headerEnd < 0) throw new Error("Unexpected git show output");
  const header = stdout.slice(0, headerEnd).split(FIELD);
  const [
    hash = "",
    parents = "",
    authorName = "",
    authorEmail = "",
    authorDate = "",
    committerName = "",
    committerEmail = "",
    committerDate = "",
  ] = header;

  const files: FileChange[] = [];
  const changes = new Map<string, ChangeType>();
  const tokens = stdout
    .slice(headerEnd + RECORD.length)
    .replace(/^\0?\n?/, "")
    .split("\0");
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index] ?? "";
    if (token.startsWith(RAW_PREFIX)) {
      const letter = (token.split(" ").pop() ?? "").charAt(0);
      if (PAIRED_STATUSES.has(letter)) {
        changes.set(changeKey(tokens[index + 2] ?? "", tokens[index + 1] ?? ""), CHANGE_TYPES[letter] ?? "modified");
        index += 2;
      } else {
        changes.set(changeKey(tokens[index + 1] ?? ""), CHANGE_TYPES[letter] ?? "modified");
        index += 1;
      }
      continue;
    }
    const record = readNumstat(tokens, index);
    if (!record) continue;
    index += record.extraTokens;
    const { stat } = record;
    const fallback: ChangeType = stat.oldPath === undefined ? "modified" : "renamed";
    files.push({ ...stat, change: changes.get(changeKey(stat.path, stat.oldPath)) ?? fallback });
  }

  return {
    hash,
    parents: splitParents(parents),
    authorName,
    authorEmail,
    authorDate,
    committerName,
    committerEmail,
    committerDate,
    message: header.slice(COMMIT_FIELDS_BEFORE_MESSAGE).join(FIELD).replace(/\n+$/, ""),
    files,
  };
}

/** The `git config --get-regexp` pattern for the identity keys. */
export const IDENTITY_KEYS_PATTERN = "^user\\.(name|email)$";

/**
 * Parses `git config --get-regexp` output ("key value" per line). Git lists every scope from
 * system to command line, so the last value for a key is the effective one.
 */
export function parseIdentity(stdout: string): Identity {
  const identity: Identity = { name: null, email: null };
  for (const line of stdout.split("\n")) {
    const separator = line.indexOf(" ");
    if (separator < 0) continue;
    const key = line.slice(0, separator);
    const value = line.slice(separator + 1).trim() || null;
    if (key === "user.name") identity.name = value;
    else if (key === "user.email") identity.email = value;
  }
  return identity;
}
