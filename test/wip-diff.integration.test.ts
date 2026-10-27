import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { wipDiffRpc } from "../shared/contracts";
import { getWipDiff } from "../server/repo";

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
let outside = "";

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: repo, env: GIT_ENV, encoding: "utf8" }).trim();
}

beforeAll(async () => {
  base = await realpath(await mkdtemp(join(tmpdir(), "git-graph-wip-")));
  repo = join(base, "repo");
  outside = join(base, "outside");
  await mkdir(outside);
  await writeFile(join(outside, "secret.txt"), "top secret\n");
  execFileSync("git", ["-c", "init.defaultBranch=main", "init", "-q", repo], { env: GIT_ENV });
  await writeFile(join(repo, "staged.txt"), "one\n");
  await writeFile(join(repo, "edited.txt"), "one\n");
  await writeFile(join(repo, "old name.txt"), "rename me\n");
  await writeFile(join(repo, "clash.txt"), "base\n");
  git("add", ".");
  git("commit", "-qm", "base");

  git("checkout", "-qb", "theirs");
  await writeFile(join(repo, "clash.txt"), "theirs\n");
  git("commit", "-qam", "theirs");
  git("checkout", "-q", "main");
  await writeFile(join(repo, "clash.txt"), "ours\n");
  git("commit", "-qam", "ours");
  try {
    git("merge", "-q", "theirs");
  } catch {
    // The conflict is the point: clash.txt is left unmerged.
  }

  await writeFile(join(repo, "staged.txt"), "one\ntwo\n");
  git("add", "staged.txt");
  await writeFile(join(repo, "edited.txt"), "one\nchanged\n");
  git("mv", "old name.txt", "new name.txt");
  await writeFile(join(repo, "untracked.txt"), "brand new\n");
  await symlink(join(outside, "secret.txt"), join(repo, "leak"));
  await symlink(outside, join(repo, "linkdir"));
});

afterAll(async () => {
  if (base) await rm(base, { recursive: true, force: true });
});

describe("getWipDiff", () => {
  it("diffs staged changes against HEAD", async () => {
    const { text } = await getWipDiff(repo, "staged.txt", "staged");
    expect(text).toContain("+two");
  });

  it("pairs a staged rename using the path from status", async () => {
    const { text } = await getWipDiff(repo, "new name.txt", "staged");
    expect(text).toContain("rename from old name.txt");
    expect(text).toContain("rename to new name.txt");
  });

  it("diffs unstaged changes against the index", async () => {
    const { text } = await getWipDiff(repo, "edited.txt", "unstaged");
    expect(text).toContain("+changed");
  });

  it("shows an untracked file as an addition", async () => {
    const { text, truncated } = await getWipDiff(repo, "untracked.txt", "untracked");
    expect(truncated).toBe(false);
    expect(text).toContain("+brand new");
  });

  it("shows conflict markers for an unmerged file", async () => {
    const { text } = await getWipDiff(repo, "clash.txt", "conflicted");
    expect(text).toContain("<<<<<<<");
  });

  it("shows an untracked symlink's target path, not the file it points to", async () => {
    const { text } = await getWipDiff(repo, "leak", "untracked");
    expect(text).toContain(join(outside, "secret.txt"));
    expect(text).not.toContain("top secret");
  });

  it("rejects a path in the wrong area", async () => {
    await expect(getWipDiff(repo, "staged.txt", "untracked")).rejects.toThrow("no untracked changes");
    await expect(getWipDiff(repo, "edited.txt", "staged")).rejects.toThrow("no staged changes");
  });

  it("rejects files without changes", async () => {
    await expect(getWipDiff(repo, "missing.txt", "untracked")).rejects.toThrow();
  });

  it("rejects paths outside the repository or behind a symlink", async () => {
    await expect(getWipDiff(repo, "../outside/secret.txt", "untracked")).rejects.toThrow();
    await expect(getWipDiff(repo, "linkdir/secret.txt", "untracked")).rejects.toThrow();
  });

  it("rejects absolute and NUL paths and unknown areas at the contract", () => {
    const target = { kind: "project", projectId: "p" } as const;
    expect(wipDiffRpc.input.safeParse({ target, path: "a.txt", area: "staged" }).success).toBe(true);
    expect(wipDiffRpc.input.safeParse({ target, path: "/etc/passwd", area: "untracked" }).success).toBe(false);
    expect(wipDiffRpc.input.safeParse({ target, path: "a\0b", area: "untracked" }).success).toBe(false);
    expect(wipDiffRpc.input.safeParse({ target, path: "a.txt", area: "stash" }).success).toBe(false);
  });
});
