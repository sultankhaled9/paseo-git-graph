import { describe, expect, it } from "vitest";
import type { RepoStatus, StatusFile } from "../shared/contracts";
import { describeHead, describeWipChange, groupWorkInProgress } from "../shared/status-text";

const OID = "0123456789abcdef0123456789abcdef01234567";

function status(overrides: Partial<RepoStatus>): RepoStatus {
  return {
    root: "/r",
    branch: "main",
    headOid: OID,
    detached: false,
    upstream: "origin/main",
    ahead: 0,
    behind: 0,
    staged: 0,
    unstaged: 0,
    untracked: 0,
    conflicted: 0,
    files: [],
    filesTruncated: false,
    ...overrides,
  };
}

describe("describeHead", () => {
  it("describes ahead and behind in plain words", () => {
    expect(describeHead(status({ ahead: 2, behind: 1 }))).toEqual({
      lead: "On",
      name: "main",
      detail: "2 ahead and 1 behind origin/main",
    });
    expect(describeHead(status({ ahead: 3 })).detail).toBe("3 commits ahead of origin/main");
    expect(describeHead(status({ behind: 1 })).detail).toBe("1 commit behind origin/main");
    expect(describeHead(status({})).detail).toBe("up to date with origin/main");
  });

  it("covers detached, unborn, and untracked branches", () => {
    expect(describeHead(status({ detached: true, branch: null }))).toEqual({
      lead: "Detached at",
      name: "0123456",
      detail: "not on a branch",
    });
    expect(describeHead(status({ headOid: null })).detail).toBe("no commits yet");
    expect(describeHead(status({ upstream: null })).detail).toBe("not tracking a remote branch");
  });
});

function file(path: string, kind: StatusFile["kind"], index: string, worktree: string): StatusFile {
  return { path, kind, index, worktree };
}

describe("groupWorkInProgress", () => {
  it("groups by area in a fixed order and lists partly staged files twice", () => {
    const groups = groupWorkInProgress([
      file("both.txt", "changed", "M", "M"),
      file("new.txt", "untracked", "?", "?"),
      file("clash.txt", "unmerged", "U", "U"),
      file("only-staged.txt", "changed", "A", "."),
    ]);
    expect(groups.map((group) => [group.area, group.files.map((entry) => entry.path)])).toEqual([
      ["conflicted", ["clash.txt"]],
      ["staged", ["both.txt", "only-staged.txt"]],
      ["unstaged", ["both.txt"]],
      ["untracked", ["new.txt"]],
    ]);
  });
});

describe("describeWipChange", () => {
  it("uses the letter for the requested side", () => {
    const entry = file("a.txt", "changed", "A", "D");
    expect(describeWipChange(entry, "staged")).toBe("added");
    expect(describeWipChange(entry, "unstaged")).toBe("deleted");
    expect(describeWipChange(file("n", "untracked", "?", "?"), "untracked")).toBe("new");
  });
});
