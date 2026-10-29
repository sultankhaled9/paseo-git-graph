import { describe, expect, it } from "vitest";
import { describeSwitch, filterBranches, unavailableReason } from "../shared/branch-text";
import type { BranchList, LocalBranch, RemoteBranch } from "../shared/contracts";

function local(name: string, extra: Partial<LocalBranch> = {}): LocalBranch {
  return { ref: `refs/heads/${name}`, name, upstream: null, current: false, otherWorktree: null, subject: "", date: "", ...extra };
}

function remote(name: string, extra: Partial<RemoteBranch> = {}): RemoteBranch {
  const localName = name.slice(name.indexOf("/") + 1);
  return { ref: `refs/remotes/${name}`, name, localName, nameTaken: false, subject: "", date: "", ...extra };
}

const list: BranchList = {
  local: [local("feature/login"), local("main", { current: true }), local("dev")],
  remote: [remote("origin/feature/signup"), remote("origin/release")],
  truncated: false,
};

describe("filterBranches", () => {
  it("keeps the current branch first and everything when the query is empty", () => {
    const result = filterBranches(list, "");
    expect(result.local.map((branch) => branch.name)).toEqual(["main", "feature/login", "dev"]);
    expect(result.remote).toHaveLength(2);
  });

  it("matches every word, ignoring case", () => {
    expect(filterBranches(list, "FEAT").local.map((branch) => branch.name)).toEqual(["feature/login"]);
    expect(filterBranches(list, "feature sign").remote.map((branch) => branch.name)).toEqual(["origin/feature/signup"]);
    expect(filterBranches(list, "nothing").local).toEqual([]);
  });
});

describe("unavailableReason", () => {
  it("explains the current branch, another worktree, and a taken local name", () => {
    expect(unavailableReason(local("main", { current: true }))).toBe("You are on this branch");
    expect(unavailableReason(local("x", { otherWorktree: "/w" }))).toBe("Open in another worktree (/w)");
    expect(unavailableReason(local("x"))).toBeNull();
    expect(unavailableReason(remote("origin/x", { nameTaken: true }))).toBe("A local x already exists; pick that one");
    expect(unavailableReason(remote("origin/x"))).toBeNull();
  });
});

describe("describeSwitch", () => {
  it("says where you end up and what happens to your changes", () => {
    expect(describeSwitch({ allowed: true, branch: "dev", tracks: null, carriedFiles: 0, fingerprint: "f" })).toEqual({
      title: "Switch to dev?",
      detail: "Your files change to match dev. You have no uncommitted changes.",
    });
    expect(describeSwitch({ allowed: true, branch: "x", tracks: "origin/x", carriedFiles: 2, fingerprint: "f" }).detail).toBe(
      "A new local branch x is created to track origin/x, and you switch to it. Your 2 uncommitted files come along. If git would have to overwrite any of them, nothing changes and you are told which.",
    );
    expect(describeSwitch({ allowed: true, branch: "dev", tracks: null, carriedFiles: 1, fingerprint: "f" }).detail).toContain(
      "Your 1 uncommitted file comes along.",
    );
  });
});
