import { execFileSync } from "node:child_process";
import { lstat, mkdir, mkdtemp, readFile, readlink, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listBackups } from "../server/backup";
import { applyChange, previewChange, restoreChange } from "../server/change";
import type { ChangeAction } from "../shared/contracts";

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "Ada",
  GIT_AUTHOR_EMAIL: "ada@example.com",
  GIT_COMMITTER_NAME: "Ada",
  GIT_COMMITTER_EMAIL: "ada@example.com",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
};

let repo = "";

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: repo, env: GIT_ENV, encoding: "utf8" }).trim();
}

function status(): string {
  return git("status", "--porcelain");
}

async function apply(action: ChangeAction): Promise<string> {
  const preview = await previewChange(repo, action);
  if (!preview.allowed) throw new Error(preview.reason);
  return applyChange(repo, action, preview.fingerprint);
}

async function exists(path: string): Promise<boolean> {
  return (await lstat(join(repo, path)).catch(() => null)) !== null;
}

beforeEach(async () => {
  repo = await realpath(await mkdtemp(join(tmpdir(), "git-graph-change-")));
  execFileSync("git", ["-c", "init.defaultBranch=main", "init", "-q", repo], { env: GIT_ENV });
  await writeFile(join(repo, "a.txt"), "committed\n");
  await writeFile(join(repo, "keep.txt"), "committed\n");
  await writeFile(join(repo, ".gitignore"), "ignored.log\n");
  git("add", ".");
  git("commit", "-qm", "base");
});

afterEach(async () => {
  if (repo) await rm(repo, { recursive: true, force: true });
});

describe("discard not-staged edits", () => {
  it("goes back to the staged version, and Undo brings the edit back", async () => {
    await writeFile(join(repo, "a.txt"), "staged\n");
    git("add", "a.txt");
    await writeFile(join(repo, "a.txt"), "staged\nand more\n");
    const backup = await apply({ kind: "discard", path: "a.txt", area: "unstaged" });
    expect(await readFile(join(repo, "a.txt"), "utf8")).toBe("staged\n");
    expect(git("diff", "--cached", "--name-only")).toBe("a.txt");
    await restoreChange(repo, backup);
    expect(await readFile(join(repo, "a.txt"), "utf8")).toBe("staged\nand more\n");
  });

  it("refuses when the file changed after the preview, changing nothing", async () => {
    await writeFile(join(repo, "a.txt"), "first edit\n");
    const action: ChangeAction = { kind: "discard", path: "a.txt", area: "unstaged" };
    const preview = await previewChange(repo, action);
    if (!preview.allowed) throw new Error("expected allowed");
    await writeFile(join(repo, "a.txt"), "an agent wrote this meanwhile\n");
    await expect(applyChange(repo, action, preview.fingerprint)).rejects.toThrow("changed since you looked");
    expect(await readFile(join(repo, "a.txt"), "utf8")).toBe("an agent wrote this meanwhile\n");
    expect(await listBackups(repo)).toEqual([]);
  });
});

describe("staged changes", () => {
  it("unstages a file and keeps its edits; Undo stages it again", async () => {
    await writeFile(join(repo, "a.txt"), "staged edit\n");
    git("add", "a.txt");
    const backup = await apply({ kind: "unstage", path: "a.txt" });
    expect(git("diff", "--cached", "--name-only")).toBe("");
    expect(await readFile(join(repo, "a.txt"), "utf8")).toBe("staged edit\n");
    await restoreChange(repo, backup);
    expect(git("diff", "--cached", "--name-only")).toBe("a.txt");
  });

  it("discards a staged rename back to the original name", async () => {
    git("mv", "a.txt", "b.txt");
    await apply({ kind: "discard", path: "b.txt", area: "staged" });
    expect(await exists("a.txt")).toBe(true);
    expect(await exists("b.txt")).toBe(false);
    expect(status()).toBe("");
  });

  it("removes a newly added file when its staged change is discarded", async () => {
    await writeFile(join(repo, "added.txt"), "new\n");
    git("add", "added.txt");
    const backup = await apply({ kind: "discard", path: "added.txt", area: "staged" });
    expect(await exists("added.txt")).toBe(false);
    await restoreChange(repo, backup);
    expect(git("diff", "--cached", "--name-only")).toBe("added.txt");
  });

  it("works in a repository without commits", async () => {
    const fresh = await realpath(await mkdtemp(join(tmpdir(), "git-graph-unborn-")));
    try {
      execFileSync("git", ["-c", "init.defaultBranch=main", "init", "-q", fresh], { env: GIT_ENV });
      await writeFile(join(fresh, "first.txt"), "x\n");
      execFileSync("git", ["add", "first.txt"], { cwd: fresh, env: GIT_ENV });
      const preview = await previewChange(fresh, { kind: "unstage", path: "first.txt" });
      if (!preview.allowed) throw new Error(preview.reason);
      await applyChange(fresh, { kind: "unstage", path: "first.txt" }, preview.fingerprint);
      expect(execFileSync("git", ["status", "--porcelain"], { cwd: fresh, env: GIT_ENV, encoding: "utf8" }).trim()).toBe("?? first.txt");
    } finally {
      await rm(fresh, { recursive: true, force: true });
    }
  });
});

describe("new files", () => {
  it("deletes an untracked nested file and Undo recreates it", async () => {
    await mkdir(join(repo, "dir", "sub"), { recursive: true });
    await writeFile(join(repo, "dir", "sub", "new.txt"), "nested\n");
    const backup = await apply({ kind: "delete", path: "dir/sub/new.txt" });
    expect(await exists("dir/sub/new.txt")).toBe(false);
    await restoreChange(repo, backup);
    expect(await readFile(join(repo, "dir", "sub", "new.txt"), "utf8")).toBe("nested\n");
  });

  it("deletes an untracked symlink without touching its target", async () => {
    await symlink("keep.txt", join(repo, "link"));
    const backup = await apply({ kind: "delete", path: "link" });
    expect(await exists("link")).toBe(false);
    expect(await readFile(join(repo, "keep.txt"), "utf8")).toBe("committed\n");
    await restoreChange(repo, backup);
    expect(await readlink(join(repo, "link"))).toBe("keep.txt");
  });
});

describe("discard all", () => {
  it("restores every tracked file, deletes new files, keeps ignored files, and Undo puts it all back", async () => {
    await writeFile(join(repo, "a.txt"), "edited\n");
    await writeFile(join(repo, "keep.txt"), "staged\n");
    git("add", "keep.txt");
    await writeFile(join(repo, "new.txt"), "brand new\n");
    await writeFile(join(repo, "ignored.log"), "must survive\n");
    const backup = await apply({ kind: "discard-all" });
    expect(status()).toBe("");
    expect(await exists("new.txt")).toBe(false);
    expect(await readFile(join(repo, "ignored.log"), "utf8")).toBe("must survive\n");
    await restoreChange(repo, backup);
    expect(await readFile(join(repo, "a.txt"), "utf8")).toBe("edited\n");
    expect(await readFile(join(repo, "new.txt"), "utf8")).toBe("brand new\n");
    expect(git("diff", "--cached", "--name-only")).toBe("keep.txt");
  });

  it("refuses Undo after a discarded file was edited again", async () => {
    await writeFile(join(repo, "a.txt"), "edited\n");
    const backup = await apply({ kind: "discard-all" });
    await writeFile(join(repo, "a.txt"), "new work after the discard\n");
    await expect(restoreChange(repo, backup)).rejects.toThrow("changed after the change was made");
    expect(await readFile(join(repo, "a.txt"), "utf8")).toBe("new work after the discard\n");
  });

  it("refuses during a merge with conflicts, and for a conflicted file", async () => {
    git("checkout", "-qb", "other");
    await writeFile(join(repo, "a.txt"), "theirs\n");
    git("commit", "-qam", "theirs");
    git("checkout", "-q", "main");
    await writeFile(join(repo, "a.txt"), "ours\n");
    git("commit", "-qam", "ours");
    try {
      git("merge", "-q", "other");
    } catch {
      // The conflict is intended.
    }
    expect(await previewChange(repo, { kind: "discard-all" })).toMatchObject({ allowed: false });
    expect(await previewChange(repo, { kind: "discard", path: "a.txt", area: "unstaged" })).toMatchObject({
      allowed: false,
      reason: "a.txt has a merge conflict. Resolve it first.",
    });
  });

  it("refuses discard all while a rebase is stopped, and allows it once only a stale REBASE_HEAD is left", async () => {
    await writeFile(join(repo, "a.txt"), "second\n");
    git("commit", "-qam", "second");
    execFileSync("git", ["rebase", "-q", "-i", "HEAD~1"], {
      cwd: repo,
      env: { ...GIT_ENV, GIT_SEQUENCE_EDITOR: "sed -i 1s/^pick/edit/" },
    });
    await writeFile(join(repo, "a.txt"), "edited mid-rebase\n");
    expect(await previewChange(repo, { kind: "discard-all" })).toEqual({
      allowed: false,
      reason: "A merge, rebase, or cherry-pick is in progress. Finish or abort it first.",
    });

    git("rebase", "--abort");
    // git can leave REBASE_HEAD behind after a rebase ends; it does not mean a rebase is running.
    await writeFile(join(repo, ".git", "REBASE_HEAD"), `${git("rev-parse", "HEAD")}\n`);
    await writeFile(join(repo, "a.txt"), "edited later\n");
    expect(await previewChange(repo, { kind: "discard-all" })).toMatchObject({ allowed: true, paths: ["a.txt"] });
  });

  it("says when there is nothing to discard", async () => {
    expect(await previewChange(repo, { kind: "discard-all" })).toEqual({ allowed: false, reason: "There is nothing to discard." });
  });
});

describe("backups stay out of history", () => {
  it("are not drawn in the graph and do not change the refs token", async () => {
    const { getLog, getRevision } = await import("../server/repo");
    await writeFile(join(repo, "a.txt"), "edited\n");
    const before = await getRevision(repo);
    const commitsBefore = (await getLog(repo, 50, "all")).commits.length;
    await apply({ kind: "discard", path: "a.txt", area: "unstaged" });
    const after = await getRevision(repo);
    expect(after.refsToken).toBe(before.refsToken);
    expect((await getLog(repo, 50, "all")).commits).toHaveLength(commitsBefore);
    expect(git("for-each-ref", "--format=%(refname)", "refs/git-graph/backups/")).toMatch(/^refs\/git-graph\/backups\/\d{13}-[0-9a-f]{8}$/);
  });
});
