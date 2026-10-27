import { STATUS_MAX_FILES } from "../shared/constants";
import type {
  CommitDetail,
  CommitSummary,
  FileChange,
  Ref,
  WorktreeStatus,
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
const UNCHANGED = ".";

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

export function parseStatus(stdout: string, root: string): WorktreeStatus {
  const status: WorktreeStatus = {
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
    if (status.files.length < STATUS_MAX_FILES) status.files.push(file);
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

function toCount(value: string): number | null {
  return value === BINARY_STAT ? null : Number(value);
}

/** Parses `git show -z --numstat --format=COMMIT_FORMAT`. Renames emit an empty path then old and new as separate fields. */
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
  const tokens = stdout
    .slice(headerEnd + RECORD.length)
    .replace(/^\0?\n?/, "")
    .split("\0");
  for (let index = 0; index < tokens.length; index += 1) {
    const match = NUMSTAT_PATTERN.exec(tokens[index] ?? "");
    if (!match) continue;
    const [, additions = BINARY_STAT, deletions = BINARY_STAT, path = ""] = match;
    if (path.length === 0) {
      const oldPath = tokens[index + 1] ?? "";
      const newPath = tokens[index + 2] ?? "";
      index += 2;
      files.push({ path: newPath, oldPath, additions: toCount(additions), deletions: toCount(deletions) });
    } else {
      files.push({ path, additions: toCount(additions), deletions: toCount(deletions) });
    }
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
