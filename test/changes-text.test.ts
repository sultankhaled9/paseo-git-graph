import { describe, expect, it } from "vitest";
import {
  describeNoRemote,
  describeToPull,
  describeToPush,
  explainArea,
  summarizeChanges,
} from "../shared/changes-text";
import type { CommitSummary, RepoStatus, StatusFile, SyncCommits } from "../shared/contracts";
import { pluralize } from "../shared/format";

function status(files: StatusFile[], filesTruncated = false): RepoStatus {
  return {
    root: "/r",
    branch: "main",
    headOid: "0".repeat(40),
    detached: false,
    upstream: "origin/main",
    ahead: 0,
    behind: 0,
    staged: 0,
    unstaged: 0,
    untracked: 0,
    conflicted: 0,
    files,
    filesTruncated,
  };
}

function commit(subject: string): CommitSummary {
  return { hash: "a".repeat(40), parents: [], authorName: "A", authorEmail: "a@x", authorDate: "", subject, refs: [] };
}

function sync(overrides: Partial<SyncCommits>): SyncCommits {
  return {
    mode: "upstream",
    upstream: "origin/main",
    toPush: [],
    toPull: [],
    toPushTruncated: false,
    toPullTruncated: false,
    ...overrides,
  };
}

const partlyStaged: StatusFile = { path: "a.ts", index: "M", worktree: "M", kind: "changed" };
const untracked: StatusFile = { path: "new.ts", index: "?", worktree: "?", kind: "untracked" };

describe("summarizeChanges", () => {
  it("combines files, commits to push, and commits to pull", () => {
    expect(
      summarizeChanges(
        status([partlyStaged, untracked]),
        sync({ toPush: [commit("a"), commit("b")], toPull: [commit("c")] }),
      ),
    ).toBe("2 files changed, 2 commits not pushed to origin/main, 1 commit to pull from origin/main");
  });

  it("counts a partly staged file once", () => {
    expect(summarizeChanges(status([partlyStaged]), sync({}))).toBe("1 file changed");
  });

  it("says when lists were cut off", () => {
    expect(summarizeChanges(status([untracked], true), sync({ toPush: [commit("a")], toPushTruncated: true }))).toBe(
      "more than 1 file changed, more than 1 commit not pushed to origin/main",
    );
  });

  it("describes commits no remote has when there is no upstream", () => {
    expect(summarizeChanges(status([]), sync({ mode: "remotes", upstream: null, toPush: [commit("a")] }))).toBe(
      "1 commit not on any remote yet",
    );
  });

  it("describes each clean state", () => {
    expect(summarizeChanges(status([]), sync({}))).toBe("Everything is committed and in sync with origin/main.");
    expect(summarizeChanges(status([]), sync({ mode: "remotes", upstream: null }))).toBe(
      "Everything is committed and already on a remote.",
    );
    expect(summarizeChanges(status([]), sync({ mode: "none", upstream: null }))).toBe(
      "Everything is committed. This repository has no remote, so nothing is shared yet.",
    );
  });
});

describe("section text", () => {
  it("names the push destination only when there is one", () => {
    expect(describeToPush(sync({})).title).toBe("Not pushed yet");
    expect(describeToPush(sync({})).explanation).toContain("not on origin/main yet");
    expect(describeToPush(sync({ mode: "remotes", upstream: null })).title).toBe("Only on this machine");
  });

  it("says pulls reflect the last fetch", () => {
    expect(describeToPull(sync({})).explanation).toContain("as of your last fetch");
  });

  it("notes when there is no remote at all", () => {
    expect(describeNoRemote(sync({ mode: "none", upstream: null }))).toContain("no remote");
    expect(describeNoRemote(sync({}))).toBeNull();
  });

  it("explains every uncommitted area", () => {
    expect(explainArea("staged")).toContain("next commit");
    expect(explainArea("conflicted")).toContain("merge conflicts");
  });
});

describe("pluralize", () => {
  it("handles one and many", () => {
    expect(pluralize(1, "file")).toBe("1 file");
    expect(pluralize(3, "file")).toBe("3 files");
    expect(pluralize(2, "repository", "repositories")).toBe("2 repositories");
  });
});
