import { describe, expect, it } from "vitest";
import { STATUS_MAX_FILES } from "../shared/constants";
import { parseCommitDetail, parseIdentity, parseLog, parseNumstat, parseRefs, parseStatus } from "../server/parse";

const F = "\x1f";
const R = "\x1e";
const OID = "a335eb982dc36af7dcb65678a023d9bcbafa7b2c";
const OID2 = "b68fde2a051d9af2fe3ff4c96c0898e5a3212e4d";
const MODES = "100644 100644 100644";

function logRecord(fields: readonly string[]): string {
  return `${fields.join(F)}${R}\n`;
}

describe("parseRefs", () => {
  it("marks the branch HEAD points at as current", () => {
    expect(parseRefs("HEAD -> refs/heads/main, refs/heads/feature")).toEqual([
      { name: "main", kind: "branch", isCurrent: true },
      { name: "feature", kind: "branch", isCurrent: false },
    ]);
  });

  it("classifies remotes, tags, detached HEAD and other refs, skipping remote HEAD", () => {
    expect(
      parseRefs("HEAD, refs/remotes/origin/main, refs/remotes/origin/HEAD, tag: refs/tags/v1.0, refs/notes/x"),
    ).toEqual([
      { name: "HEAD", kind: "head", isCurrent: true },
      { name: "origin/main", kind: "remote", isCurrent: false },
      { name: "v1.0", kind: "tag", isCurrent: false },
      { name: "notes/x", kind: "other", isCurrent: false },
    ]);
  });

  it("returns nothing for an undecorated commit", () => {
    expect(parseRefs("")).toEqual([]);
  });
});

describe("parseLog", () => {
  it("keeps separators and unicode inside subjects", () => {
    const stdout =
      logRecord([OID, OID2, "Zoë", "z@x", "2026-10-27T10:00:00+03:00", "HEAD -> refs/heads/main", "fix | pipe ✓"]) +
      logRecord([OID2, "", "A", "a@x", "2026-10-26T10:00:00+03:00", "", "root"]);
    expect(parseLog(stdout)).toEqual([
      {
        hash: OID,
        parents: [OID2],
        authorName: "Zoë",
        authorEmail: "z@x",
        authorDate: "2026-10-27T10:00:00+03:00",
        refs: [{ name: "main", kind: "branch", isCurrent: true }],
        subject: "fix | pipe ✓",
      },
      {
        hash: OID2,
        parents: [],
        authorName: "A",
        authorEmail: "a@x",
        authorDate: "2026-10-26T10:00:00+03:00",
        refs: [],
        subject: "root",
      },
    ]);
  });

  it("splits merge parents", () => {
    const [commit] = parseLog(logRecord([OID, `${OID2} ${OID2}`, "A", "a@x", "d", "", "merge"]));
    expect(commit?.parents).toEqual([OID2, OID2]);
  });

  it("returns an empty list for an empty repository", () => {
    expect(parseLog("")).toEqual([]);
  });
});

function status(...tokens: readonly string[]): string {
  return `${tokens.join("\0")}\0`;
}

describe("parseStatus", () => {
  it("handles a repository with no commits", () => {
    const result = parseStatus(status("# branch.oid (initial)", "# branch.head main", "? new.txt"), "/r");
    expect(result).toMatchObject({
      root: "/r",
      headOid: null,
      branch: "main",
      detached: false,
      upstream: null,
      untracked: 1,
      files: [{ path: "new.txt", index: "?", worktree: "?", kind: "untracked" }],
    });
  });

  it("reports detached HEAD", () => {
    const result = parseStatus(status(`# branch.oid ${OID}`, "# branch.head (detached)"), "/r");
    expect(result).toMatchObject({ headOid: OID, branch: null, detached: true });
  });

  it("reads upstream and ahead/behind", () => {
    const result = parseStatus(
      status(`# branch.oid ${OID}`, "# branch.head main", "# branch.upstream origin/main", "# branch.ab +3 -2"),
      "/r",
    );
    expect(result).toMatchObject({ upstream: "origin/main", ahead: 3, behind: 2 });
  });

  it("counts staged and unstaged sides and keeps paths with spaces", () => {
    const result = parseStatus(
      status(
        `# branch.oid ${OID}`,
        "# branch.head main",
        `1 MM N... ${MODES} ${OID} ${OID2} dir/with space.txt`,
        `1 .M N... ${MODES} ${OID} ${OID} only-worktree.txt`,
      ),
      "/r",
    );
    expect(result).toMatchObject({ staged: 1, unstaged: 2 });
    expect(result.files.map((file) => file.path)).toEqual(["dir/with space.txt", "only-worktree.txt"]);
  });

  it("reads rename entries and their original path", () => {
    const result = parseStatus(
      status(`# branch.oid ${OID}`, "# branch.head main", `2 R. N... ${MODES} ${OID} ${OID} R100 k 2.txt`, "k.txt"),
      "/r",
    );
    expect(result.files).toEqual([
      { path: "k 2.txt", origPath: "k.txt", index: "R", worktree: ".", kind: "renamed" },
    ]);
    expect(result.staged).toBe(1);
  });

  it("counts unmerged entries as conflicts", () => {
    const result = parseStatus(
      status(`# branch.oid ${OID}`, "# branch.head main", `u UU N... ${MODES} 100644 ${OID} ${OID} ${OID} both.txt`),
      "/r",
    );
    expect(result).toMatchObject({ conflicted: 1, staged: 0, unstaged: 0 });
    expect(result.files[0]).toEqual({ path: "both.txt", index: "U", worktree: "U", kind: "unmerged" });
  });

  it("caps the file list but keeps exact counts", () => {
    const extra = 5;
    const entries = Array.from({ length: STATUS_MAX_FILES + extra }, (_, index) => `? f${index}`);
    const result = parseStatus(status("# branch.oid (initial)", "# branch.head main", ...entries), "/r");
    expect(result.untracked).toBe(STATUS_MAX_FILES + extra);
    expect(result.files).toHaveLength(STATUS_MAX_FILES);
    expect(result.filesTruncated).toBe(true);
  });
});

function show(header: readonly string[], records: string): string {
  return `${header.join(F)}${R}\0\n${records}`;
}

const ZERO = "0".repeat(40);

/** A `--raw -z` record as git 2.53 emits it, e.g. ":100644 100644 <sha> <sha> M\0path\0". */
function raw(status: string, ...paths: string[]): string {
  return `:100644 100644 ${ZERO} ${ZERO} ${status}\0${paths.join("\0")}\0`;
}

const HEADER = [OID, OID2, "A", "a@x", "2026-10-27T10:00:00Z", "C", "c@x", "2026-10-27T11:00:00Z"];

describe("parseCommitDetail", () => {
  it("parses metadata, message, and plain stats", () => {
    const detail = parseCommitDetail(
      show([...HEADER, "subject\n\nbody line\n"], `${raw("M", "src/a.ts")}3\t1\tsrc/a.ts\0`),
    );
    expect(detail).toMatchObject({
      hash: OID,
      parents: [OID2],
      committerName: "C",
      committerDate: "2026-10-27T11:00:00Z",
      message: "subject\n\nbody line",
      files: [{ path: "src/a.ts", change: "modified", additions: 3, deletions: 1 }],
    });
  });

  it("reads every change type and joins it to the stats by path", () => {
    const records =
      raw("D", "del.txt") +
      raw("M", "mod.txt") +
      raw("R100", "keep.txt", "moved.txt") +
      raw("A", "new file.txt") +
      raw("T", "tc.txt") +
      raw("C75", "src.txt", "copy.txt") +
      "0\t1\tdel.txt\0" +
      "1\t0\tmod.txt\0" +
      "0\t0\t\0keep.txt\0moved.txt\0" +
      "1\t0\tnew file.txt\0" +
      "1\t1\ttc.txt\0" +
      "2\t0\t\0src.txt\0copy.txt\0";
    expect(parseCommitDetail(show([...HEADER, "msg\n"], records)).files).toEqual([
      { path: "del.txt", change: "deleted", additions: 0, deletions: 1 },
      { path: "mod.txt", change: "modified", additions: 1, deletions: 0 },
      { path: "moved.txt", oldPath: "keep.txt", change: "renamed", additions: 0, deletions: 0 },
      { path: "new file.txt", change: "added", additions: 1, deletions: 0 },
      { path: "tc.txt", change: "type-changed", additions: 1, deletions: 1 },
      { path: "copy.txt", oldPath: "src.txt", change: "copied", additions: 2, deletions: 0 },
    ]);
  });

  it("parses binary files", () => {
    const detail = parseCommitDetail(show([...HEADER, "msg\n"], `${raw("A", "bin.dat")}-\t-\tbin.dat\0`));
    expect(detail.files).toEqual([{ path: "bin.dat", change: "added", additions: null, deletions: null }]);
  });

  it("falls back when a stats entry has no raw record", () => {
    const detail = parseCommitDetail(show([...HEADER, "msg\n"], "1\t1\ta.txt\0" + "0\t0\t\0b\0c\0"));
    expect(detail.files.map((file) => file.change)).toEqual(["modified", "renamed"]);
  });

  it("parses a root commit without parents", () => {
    const header = [OID, "", ...HEADER.slice(2), "root\n"];
    const detail = parseCommitDetail(show(header, `${raw("A", "a.txt")}1\t0\ta.txt\0`));
    expect(detail.parents).toEqual([]);
    expect(detail.files).toEqual([{ path: "a.txt", change: "added", additions: 1, deletions: 0 }]);
  });

  it("parses a commit with no file changes", () => {
    expect(parseCommitDetail(`${[...HEADER, "empty\n"].join(F)}${R}`).files).toEqual([]);
  });

  it("rejects output without a header", () => {
    expect(() => parseCommitDetail("garbage")).toThrow();
  });
});

describe("parseIdentity", () => {
  it("keeps the last value per key, as git resolves scopes", () => {
    const stdout = "user.email global@x.com\nuser.name Sultan Almansour\nuser.email local@x.com\n";
    expect(parseIdentity(stdout)).toEqual({ name: "Sultan Almansour", email: "local@x.com" });
  });

  it("reports missing keys as null", () => {
    expect(parseIdentity("")).toEqual({ name: null, email: null });
    expect(parseIdentity("user.name Ada\n")).toEqual({ name: "Ada", email: null });
  });
});

describe("parseNumstat", () => {
  it("reads plain, renamed, and binary records", () => {
    expect(parseNumstat("3\t1\tsrc/a.ts\x000\t0\t\x00old name.txt\x00new name.txt\x00-\t-\tlogo.png\x00")).toEqual([
      { path: "src/a.ts", additions: 3, deletions: 1 },
      { path: "new name.txt", oldPath: "old name.txt", additions: 0, deletions: 0 },
      { path: "logo.png", additions: null, deletions: null },
    ]);
  });

  it("returns nothing for a clean tree", () => {
    expect(parseNumstat("")).toEqual([]);
  });
});
