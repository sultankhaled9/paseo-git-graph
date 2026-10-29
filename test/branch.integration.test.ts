import { execFileSync } from "node:child_process";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listBranches, localNameFor } from "../server/branch";

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "Ada",
  GIT_AUTHOR_EMAIL: "ada@example.com",
  GIT_COMMITTER_NAME: "Ada",
  GIT_COMMITTER_EMAIL: "ada@example.com",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
};

let base = "";
let repo = "";

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: repo, env: GIT_ENV, encoding: "utf8" }).trim();
}

/** A repository with a fake "origin" made of remote-tracking refs, no network needed. */
beforeEach(async () => {
  base = await realpath(await mkdtemp(join(tmpdir(), "git-graph-branch-")));
  repo = join(base, "repo");
  execFileSync("git", ["-c", "init.defaultBranch=main", "init", "-q", repo], { env: GIT_ENV });
  await writeFile(join(repo, "a.txt"), "main\n");
  git("add", ".");
  git("commit", "-qm", "first on main");
  git("switch", "-qc", "feature");
  await writeFile(join(repo, "a.txt"), "feature\n");
  git("commit", "-qam", "feature work");
  git("switch", "-q", "main");
  for (const name of ["main", "feature", "only-remote", "taken"]) git("update-ref", `refs/remotes/origin/${name}`, name === "only-remote" || name === "taken" ? "feature" : name);
  git("symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main");
  git("remote", "add", "origin", "https://example.invalid/repo.git");
  git("config", "branch.main.remote", "origin");
  git("config", "branch.main.merge", "refs/heads/main");
  git("branch", "-q", "taken", "main");
});

afterEach(async () => {
  if (base) await rm(base, { recursive: true, force: true });
});

describe("listBranches", () => {
  it("lists local branches with the current one marked and its upstream", async () => {
    const { local, truncated } = await listBranches(repo);
    expect(truncated).toBe(false);
    expect(local.map((branch) => branch.name).sort()).toEqual(["feature", "main", "taken"]);
    expect(local.find((branch) => branch.name === "main")).toMatchObject({
      ref: "refs/heads/main",
      current: true,
      upstream: "origin/main",
      otherWorktree: null,
      subject: "first on main",
    });
    expect(local.find((branch) => branch.name === "feature")).toMatchObject({ current: false, upstream: null, subject: "feature work" });
  });

  it("lists remote branches no local branch tracks, without origin/HEAD, marking taken local names", async () => {
    const { remote } = await listBranches(repo);
    const names = remote.map((branch) => branch.name).sort();
    expect(names).toEqual(["origin/feature", "origin/only-remote", "origin/taken"]);
    expect(remote.find((branch) => branch.name === "origin/only-remote")).toMatchObject({ localName: "only-remote", nameTaken: false });
    expect(remote.find((branch) => branch.name === "origin/taken")).toMatchObject({ localName: "taken", nameTaken: true });
    expect(remote.find((branch) => branch.name === "origin/feature")).toMatchObject({ nameTaken: true });
  });

  it("marks a branch checked out in another worktree", async () => {
    const other = join(base, "other-worktree");
    git("worktree", "add", "-q", other, "feature");
    const { local } = await listBranches(repo);
    expect(local.find((branch) => branch.name === "feature")?.otherWorktree).toBe(other);
    expect(local.find((branch) => branch.name === "main")?.otherWorktree).toBeNull();
  });

  it("keeps subjects with separators and unicode intact", async () => {
    await writeFile(join(repo, "a.txt"), "x\n");
    git("commit", "-qam", "fix | pipes, tabs\tand ünïcödé");
    const { local } = await listBranches(repo);
    expect(local.find((branch) => branch.current)?.subject).toBe("fix | pipes, tabs\tand ünïcödé");
  });

  it("derives the local name a tracking branch gets", () => {
    expect(localNameFor("origin/feature/x")).toBe("feature/x");
    expect(localNameFor("upstream/main")).toBe("main");
  });
});
