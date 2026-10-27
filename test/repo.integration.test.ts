import { execFileSync } from "node:child_process";
import { mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DIFF_MAX_BYTES } from "../shared/constants";
import type { Project } from "../shared/contracts";
import { type RepoGuardDeps, resolveRepo, validateRepoPath } from "../server/repo-guard";
import { getCommit, getDiff, getLog, getRevision, getStatus } from "../server/repo";

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "Ada",
  GIT_AUTHOR_EMAIL: "ada@example.com",
  GIT_COMMITTER_NAME: "Ada",
  GIT_COMMITTER_EMAIL: "ada@example.com",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
};
const BIG_FILE_LINE = "line\n";
const BIG_FILE_LINES = Math.ceil((2 * DIFF_MAX_BYTES) / BIG_FILE_LINE.length);
const SMALL_LIMIT = 2;

let base = "";
let repo = "";
let otherRepo = "";

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, env: GIT_ENV, encoding: "utf8" }).trim();
}

async function initRepo(path: string): Promise<void> {
  execFileSync("git", ["-c", "init.defaultBranch=main", "init", "-q", path], { env: GIT_ENV });
}

beforeAll(async () => {
  base = await realpath(await mkdtemp(join(tmpdir(), "git-graph-test-")));
  repo = join(base, "repo");
  otherRepo = join(base, "other");
  await initRepo(repo);
  await initRepo(otherRepo);

  await writeFile(join(repo, "a.txt"), "a\n");
  git(repo, "add", ".");
  git(repo, "commit", "-qm", "root | with pipe");
  git(repo, "tag", "v1");

  git(repo, "checkout", "-qb", "feature");
  git(repo, "mv", "a.txt", "renamed.txt");
  await writeFile(join(repo, "bin.dat"), Buffer.from([0, 1, 2, 3]));
  git(repo, "add", ".");
  git(repo, "commit", "-qm", "rename and binary");

  git(repo, "checkout", "-q", "main");
  await writeFile(join(repo, "big.txt"), BIG_FILE_LINE.repeat(BIG_FILE_LINES));
  git(repo, "add", ".");
  git(repo, "commit", "-qm", "big file");
  git(repo, "merge", "-q", "--no-ff", "feature", "-m", "merge feature");
});

afterAll(async () => {
  if (base) await rm(base, { recursive: true, force: true });
});

describe("repository operations", () => {
  it("returns topo-ordered history with refs and merge parents", async () => {
    const { commits, hasMore } = await getLog(repo, 10);
    expect(hasMore).toBe(false);
    expect(commits.map((commit) => commit.subject)).toEqual([
      "merge feature",
      "rename and binary",
      "big file",
      "root | with pipe",
    ]);
    const [merge] = commits;
    expect(merge?.parents).toHaveLength(2);
    expect(merge?.refs).toContainEqual({ name: "main", kind: "branch", isCurrent: true });
    expect(commits[1]?.refs).toContainEqual({ name: "feature", kind: "branch", isCurrent: false });
    expect(commits[3]?.refs).toContainEqual({ name: "v1", kind: "tag", isCurrent: false });
  });

  it("reports hasMore when the limit cuts history", async () => {
    const { commits, hasMore } = await getLog(repo, SMALL_LIMIT);
    expect(commits).toHaveLength(SMALL_LIMIT);
    expect(hasMore).toBe(true);
  });

  it("excludes stash commits from history", async () => {
    await writeFile(join(repo, "a-stash.txt"), "x\n");
    git(repo, "stash", "push", "-qu");
    const { commits } = await getLog(repo, 50);
    git(repo, "stash", "pop", "-q");
    await rm(join(repo, "a-stash.txt"));
    expect(commits).toHaveLength(4);
  });

  it("returns an empty history for a repository without commits", async () => {
    expect(await getLog(otherRepo, 10)).toEqual({ commits: [], hasMore: false });
  });

  it("returns commit detail with renames and binary stats", async () => {
    const hash = git(repo, "rev-parse", "feature");
    const detail = await getCommit(repo, hash);
    expect(detail.message).toBe("rename and binary");
    expect(detail.files).toContainEqual({ path: "renamed.txt", oldPath: "a.txt", additions: 0, deletions: 0 });
    expect(detail.files).toContainEqual({ path: "bin.dat", additions: null, deletions: null });
  });

  it("returns a capped diff for a large file", async () => {
    const hash = git(repo, "rev-parse", "main~1");
    const { text, truncated } = await getDiff(repo, hash, "big.txt");
    expect(truncated).toBe(true);
    expect(Buffer.byteLength(text)).toBeLessThanOrEqual(DIFF_MAX_BYTES);
    expect(text.startsWith("diff --git a/big.txt b/big.txt")).toBe(true);
    expect(text.endsWith("\n")).toBe(true);
  });

  it("returns a complete small diff", async () => {
    const hash = git(repo, "rev-list", "--max-parents=0", "HEAD");
    const { text, truncated } = await getDiff(repo, hash, "a.txt");
    expect(truncated).toBe(false);
    expect(text).toContain("+a");
  });

  it("rejects option-shaped revisions", async () => {
    await expect(getCommit(repo, "--output=/tmp/x")).rejects.toThrow();
  });

  it("tracks staged, unstaged, and untracked changes and changes revision tokens", async () => {
    const before = await getRevision(repo);
    const clean = await getStatus(repo);
    expect(clean).toMatchObject({ branch: "main", detached: false, staged: 0, unstaged: 0, untracked: 0 });

    await writeFile(join(repo, "renamed.txt"), "changed\n");
    await writeFile(join(repo, "big.txt"), "rewritten\n");
    git(repo, "add", "big.txt");
    await writeFile(join(repo, "new file.txt"), "n\n");

    const dirty = await getStatus(repo);
    expect(dirty).toMatchObject({ staged: 1, unstaged: 1, untracked: 1 });
    expect(dirty.files.map((file) => file.path)).toContain("new file.txt");

    const edited = await getRevision(repo);
    expect(edited.refsToken).toBe(before.refsToken);
    expect(edited.worktreeToken).not.toBe(before.worktreeToken);

    git(repo, "add", ".");
    git(repo, "commit", "-qm", "wip");
    const committed = await getRevision(repo);
    expect(committed.refsToken).not.toBe(edited.refsToken);
  });
});

describe("repository guard", () => {
  function deps(projects: readonly Project[], workspaces: Record<string, { directory: string | null; projectKind: string }> = {}): RepoGuardDeps {
    return {
      readProjects: async () => projects,
      getWorkspace: async (id) => workspaces[id] ?? null,
    };
  }

  it("resolves a saved project", async () => {
    const guard = deps([{ id: "p", name: "Repo", path: repo }]);
    expect(await resolveRepo({ kind: "project", projectId: "p" }, guard)).toBe(repo);
  });

  it("rejects an unknown project id", async () => {
    await expect(resolveRepo({ kind: "project", projectId: "missing" }, deps([]))).rejects.toThrow("Unknown project");
  });

  it("rejects a saved path that now redirects to another repository", async () => {
    const link = join(base, "link");
    await symlink(otherRepo, link);
    const guard = deps([{ id: "p", name: "Linked", path: link }]);
    await expect(resolveRepo({ kind: "project", projectId: "p" }, guard)).rejects.toThrow("no longer points");
  });

  it("resolves a git workspace to its repository root", async () => {
    const guard = deps([], { w: { directory: repo, projectKind: "git" } });
    expect(await resolveRepo({ kind: "workspace", workspaceId: "w" }, guard)).toBe(repo);
  });

  it("rejects non-git and unknown workspaces", async () => {
    const guard = deps([], { w: { directory: repo, projectKind: "non_git" } });
    await expect(resolveRepo({ kind: "workspace", workspaceId: "w" }, guard)).rejects.toThrow("not a git repository");
    await expect(resolveRepo({ kind: "workspace", workspaceId: "x" }, guard)).rejects.toThrow("not a git repository");
  });

  it("validates repository paths", async () => {
    expect(await validateRepoPath("relative/path")).toEqual({ ok: false, reason: "Path must be absolute" });
    expect(await validateRepoPath(join(base, "missing"))).toEqual({ ok: false, reason: "Path does not exist" });
    const plain = await mkdtemp(join(tmpdir(), "git-graph-plain-"));
    try {
      expect((await validateRepoPath(plain)).ok).toBe(false);
    } finally {
      await rm(plain, { recursive: true, force: true });
    }
    expect(await validateRepoPath(join(repo, "."))).toEqual({ ok: true, path: repo, suggestedName: "repo" });
  });
});
