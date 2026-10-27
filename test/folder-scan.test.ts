import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_SCAN_LIMITS, FolderScanError, scanFolder } from "../server/folder-scan";

let root = "";

async function repoAt(relative: string, markerAsFile = false): Promise<void> {
  const directory = join(root, relative);
  await mkdir(directory, { recursive: true });
  if (markerAsFile) await writeFile(join(directory, ".git"), "gitdir: /elsewhere/.git/worktrees/x\n");
  else await mkdir(join(directory, ".git"));
}

beforeAll(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "git-graph-scan-")));
  await repoAt("api");
  await repoAt("client-x/web");
  await repoAt("client-x/mobile");
  await repoAt("deep/one/too-deep");
  await repoAt("worktree", true);
  await repoAt("api/nested-inside-repo");
  await repoAt(".hidden/repo");
  await repoAt("node_modules/pkg");
  await mkdir(join(root, "plain"));
  await writeFile(join(root, "notes.txt"), "x");
  await symlink(join(root, "api"), join(root, "link-to-api"));
  await mkdir(join(root, "fake-marker"));
  await symlink(join(root, "api", ".git"), join(root, "fake-marker", ".git"));
});

afterAll(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});

describe("scanFolder", () => {
  it("finds repositories one and two levels down, sorted, without descending into repositories", async () => {
    const result = await scanFolder(root);
    expect(result).toEqual({
      repos: [
        { relativePath: "api", name: "api" },
        { relativePath: "client-x/mobile", name: "mobile" },
        { relativePath: "client-x/web", name: "web" },
        { relativePath: "worktree", name: "worktree" },
      ],
      truncated: false,
    });
  });

  it("finds deeper repositories only when the depth allows", async () => {
    const result = await scanFolder(root, { ...DEFAULT_SCAN_LIMITS, depth: 3 });
    expect(result.repos.map((repo) => repo.relativePath)).toContain("deep/one/too-deep");
    const shallow = await scanFolder(root, { ...DEFAULT_SCAN_LIMITS, depth: 1 });
    expect(shallow.repos.map((repo) => repo.relativePath)).toEqual(["api", "worktree"]);
  });

  it("skips hidden folders, node_modules, symlinked folders, and symlinked .git markers", async () => {
    const paths = (await scanFolder(root)).repos.map((repo) => repo.relativePath);
    expect(paths.some((path) => path.startsWith(".hidden"))).toBe(false);
    expect(paths.some((path) => path.startsWith("node_modules"))).toBe(false);
    expect(paths).not.toContain("link-to-api");
    expect(paths).not.toContain("fake-marker");
  });

  it("caps the result and reports truncation", async () => {
    const result = await scanFolder(root, { ...DEFAULT_SCAN_LIMITS, maxRepos: 2 });
    expect(result.repos).toHaveLength(2);
    expect(result.truncated).toBe(true);
  });

  it("stops after the entry budget and reports truncation", async () => {
    const result = await scanFolder(root, { ...DEFAULT_SCAN_LIMITS, maxEntries: 3 });
    expect(result.truncated).toBe(true);
  });

  it("fails clearly when the scan runs out of time", async () => {
    await expect(scanFolder(root, { ...DEFAULT_SCAN_LIMITS, timeoutMs: -1 })).rejects.toBeInstanceOf(FolderScanError);
  });

  it("enforces the deadline while checking candidate folders, not only before reading them", async () => {
    const clockReadsBeforeCandidates = 2;
    let reads = 0;
    const now = () => {
      reads += 1;
      return reads <= clockReadsBeforeCandidates ? 0 : Number.MAX_SAFE_INTEGER;
    };
    await expect(scanFolder(root, { ...DEFAULT_SCAN_LIMITS, depth: 1, timeoutMs: 1, now })).rejects.toBeInstanceOf(
      FolderScanError,
    );
    expect(reads).toBeGreaterThan(clockReadsBeforeCandidates);
  });

  it("rejects a missing root", async () => {
    await expect(scanFolder(join(root, "missing"))).rejects.toThrow();
  });
});
