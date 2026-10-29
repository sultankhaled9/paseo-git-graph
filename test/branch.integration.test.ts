import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { describeSwitchRefusal, listBranches, localNameFor, previewSwitch, switchBranch } from "../server/branch";

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

/** Switches through the same preview and fingerprint as the UI. */
async function switchTo(ref: string) {
  const preview = await previewSwitch(repo, ref);
  if (!preview.allowed) throw new Error(preview.reason);
  return switchBranch(repo, ref, preview.fingerprint);
}

/** Everything a refused switch must leave untouched. */
function snapshot(): string {
  return [git("symbolic-ref", "-q", "HEAD"), git("rev-parse", "HEAD"), git("ls-files", "-s"), git("status", "--porcelain", "--ignored"), git("for-each-ref"), git("config", "--list", "--local")].join("\n");
}

describe("switching branches", () => {
  it("switches to a local branch and reports the previous one", async () => {
    expect(await switchTo("refs/heads/feature")).toEqual({ branch: "feature", previous: "refs/heads/main" });
    expect(git("branch", "--show-current")).toBe("feature");
    expect(await readFile(join(repo, "a.txt"), "utf8")).toBe("feature\n");
  });

  it("carries staged, unstaged, and new files that do not clash", async () => {
    await writeFile(join(repo, "b.txt"), "base\n");
    git("add", "b.txt");
    git("commit", "-qm", "add b on main");
    git("switch", "-q", "feature");
    git("merge", "-q", "--no-edit", "main");
    git("switch", "-q", "main");
    await writeFile(join(repo, "b.txt"), "unstaged edit\n");
    await writeFile(join(repo, "staged.txt"), "staged\n");
    git("add", "staged.txt");
    await writeFile(join(repo, "new.txt"), "untracked\n");
    const preview = await previewSwitch(repo, "refs/heads/feature");
    expect(preview).toMatchObject({ allowed: true, branch: "feature", tracks: null, carriedFiles: 3 });
    await switchTo("refs/heads/feature");
    expect(git("branch", "--show-current")).toBe("feature");
    expect(await readFile(join(repo, "b.txt"), "utf8")).toBe("unstaged edit\n");
    // The helper trims output, so the first line's leading space (" M") is dropped.
    expect(git("status", "--porcelain")).toBe("M b.txt\nA  staged.txt\n?? new.txt");
  });

  it("refuses, changing nothing, when an uncommitted change would be overwritten", async () => {
    await writeFile(join(repo, "a.txt"), "my edit\n");
    const before = snapshot();
    await expect(switchTo("refs/heads/feature")).rejects.toThrow(
      "Switching would overwrite your uncommitted changes in a.txt, so nothing changed.",
    );
    expect(snapshot()).toBe(before);
    expect(await readFile(join(repo, "a.txt"), "utf8")).toBe("my edit\n");
  });

  it("never overwrites an ignored file the other branch tracks", async () => {
    git("switch", "-q", "feature");
    await writeFile(join(repo, ".env"), "TRACKED=1\n");
    git("add", ".env");
    git("commit", "-qm", "track .env");
    git("switch", "-q", "main");
    await writeFile(join(repo, ".gitignore"), ".env\n");
    git("add", ".gitignore");
    git("commit", "-qm", "ignore .env");
    await writeFile(join(repo, ".env"), "SECRET=keep\n");
    const before = snapshot();
    await expect(switchTo("refs/heads/feature")).rejects.toThrow("files git does not track (.env)");
    expect(await readFile(join(repo, ".env"), "utf8")).toBe("SECRET=keep\n");
    expect(snapshot()).toBe(before);
  });

  it("creates a local branch tracking a remote branch", async () => {
    expect(await previewSwitch(repo, "refs/remotes/origin/only-remote")).toMatchObject({
      allowed: true,
      branch: "only-remote",
      tracks: "origin/only-remote",
    });
    expect(await switchTo("refs/remotes/origin/only-remote")).toEqual({ branch: "only-remote", previous: "refs/heads/main" });
    expect(git("branch", "--show-current")).toBe("only-remote");
    expect(git("rev-parse", "--abbrev-ref", "only-remote@{upstream}")).toBe("origin/only-remote");
  });

  it("leaves no branch or tracking config behind when a remote switch is refused", async () => {
    await writeFile(join(repo, "a.txt"), "my edit\n");
    const before = snapshot();
    await expect(switchTo("refs/remotes/origin/only-remote")).rejects.toThrow("your uncommitted changes in a.txt");
    expect(snapshot()).toBe(before);
    expect(git("branch", "--list", "only-remote")).toBe("");
  });

  it("refuses the current branch, a taken local name, a missing branch, and another worktree's branch", async () => {
    expect(await previewSwitch(repo, "refs/heads/main")).toEqual({ allowed: false, reason: "You are already on main." });
    expect(await previewSwitch(repo, "refs/remotes/origin/taken")).toMatchObject({ allowed: false, reason: expect.stringContaining("Switch to taken instead") });
    expect(await previewSwitch(repo, "refs/heads/nope")).toMatchObject({ allowed: false, reason: expect.stringContaining("no longer exists") });
    const other = join(base, "other-worktree");
    git("worktree", "add", "-q", other, "feature");
    expect(await previewSwitch(repo, "refs/heads/feature")).toMatchObject({ allowed: false, reason: expect.stringContaining("another worktree") });
  });

  it("refuses while a merge is in progress", async () => {
    await writeFile(join(repo, "a.txt"), "main again\n");
    git("commit", "-qam", "diverge");
    try {
      git("merge", "-q", "feature");
    } catch {
      // The conflict is intended.
    }
    expect(await previewSwitch(repo, "refs/heads/taken")).toMatchObject({ allowed: false, reason: expect.stringContaining("in progress") });
  });

  it("refuses when the files or the branch changed after the preview", async () => {
    const preview = await previewSwitch(repo, "refs/heads/feature");
    if (!preview.allowed) throw new Error(preview.reason);
    await writeFile(join(repo, "new.txt"), "appeared later\n");
    await expect(switchBranch(repo, "refs/heads/feature", preview.fingerprint)).rejects.toThrow("changed since you looked");
    expect(git("branch", "--show-current")).toBe("main");
  });

  it("switches from a detached HEAD with no branch to go back to", async () => {
    git("switch", "-q", "--detach", "HEAD");
    expect(await switchTo("refs/heads/feature")).toEqual({ branch: "feature", previous: null });
  });

  it("explains git refusals it does not recognize with git's own first line", () => {
    expect(describeSwitchRefusal("fatal: something odd\nmore")).toBe("something odd. Nothing changed.");
    expect(describeSwitchRefusal("")).toBe("git refused to switch. Nothing changed.");
  });
});
