import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ProjectsDocument, RepoTarget } from "../shared/contracts";
import { inspectPath, listFolderRepos, type RepoGuardDeps, resolveRepo } from "../server/repo-guard";

const GIT_ENV = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };

let base = "";
let folder = "";
let outsideRepo = "";
let settings: ProjectsDocument = { projects: [], folders: [] };

function gitInit(path: string): void {
  execFileSync("git", ["-c", "init.defaultBranch=main", "init", "-q", path], { env: GIT_ENV });
}

const deps: RepoGuardDeps = {
  readSettings: async () => settings,
  getWorkspace: async () => null,
};

function target(relativePath: string, folderId = "f"): RepoTarget {
  return { kind: "folder-repo", folderId, relativePath };
}

beforeAll(async () => {
  base = await realpath(await mkdtemp(join(tmpdir(), "git-graph-folders-")));
  folder = join(base, "projects");
  outsideRepo = join(base, "outside");
  gitInit(join(folder, "api"));
  gitInit(join(folder, "client-x", "web"));
  gitInit(join(folder, "client-x", "deep", "too-deep"));
  gitInit(outsideRepo);
  await mkdir(join(folder, "api", "src"));
  await mkdir(join(folder, "plain"));
  await mkdir(join(base, "empty"));
  await symlink(outsideRepo, join(folder, "escape"));
  await symlink(outsideRepo, join(folder, "client-x", "linked"));
  settings = { projects: [], folders: [{ id: "f", name: "projects", path: folder }] };
});

afterAll(async () => {
  if (base) await rm(base, { recursive: true, force: true });
});

describe("folder repositories", () => {
  it("lists repositories two levels deep", async () => {
    expect(await listFolderRepos("f", deps.readSettings)).toEqual({
      repos: [
        { relativePath: "api", name: "api" },
        { relativePath: "client-x/web", name: "web" },
      ],
      truncated: false,
    });
  });

  it("resolves a listed repository to its canonical root", async () => {
    expect(await resolveRepo(target("api"), deps)).toBe(join(folder, "api"));
    expect(await resolveRepo(target("client-x/web"), deps)).toBe(join(folder, "client-x", "web"));
  });

  it("rejects unknown folders and folders that moved", async () => {
    await expect(resolveRepo(target("api", "missing"), deps)).rejects.toThrow("Unknown folder");
    const moved: RepoGuardDeps = {
      ...deps,
      readSettings: async () => ({ projects: [], folders: [{ id: "f", name: "projects", path: join(base, "gone") }] }),
    };
    await expect(resolveRepo(target("api"), moved)).rejects.toThrow("no longer available");
  });

  it("rejects traversal, absolute, and too-deep paths", async () => {
    await expect(resolveRepo(target("../outside"), deps)).rejects.toThrow("Not a repository path");
    await expect(resolveRepo(target("/etc"), deps)).rejects.toThrow("Not a repository path");
    await expect(resolveRepo(target("client-x/deep/too-deep"), deps)).rejects.toThrow("Not a repository path");
  });

  it("rejects symlinks that would leave the folder", async () => {
    await expect(resolveRepo(target("escape"), deps)).rejects.toThrow("no longer a repository");
    await expect(resolveRepo(target("client-x/linked"), deps)).rejects.toThrow("no longer a repository");
  });

  it("rejects folders that are not repository roots and repositories that were removed", async () => {
    await expect(resolveRepo(target("plain"), deps)).rejects.toThrow("not a repository root");
    await expect(resolveRepo(target("api/src"), deps)).rejects.toThrow("not a repository root");
    await expect(resolveRepo(target("deleted"), deps)).rejects.toThrow("no longer a repository");
  });
});

describe("inspectPath", () => {
  it("classifies a repository", async () => {
    expect(await inspectPath(join(folder, "api"))).toEqual({
      kind: "repo",
      path: join(folder, "api"),
      suggestedName: "api",
    });
  });

  it("classifies a folder of repositories with its count", async () => {
    expect(await inspectPath(folder)).toEqual({
      kind: "folder",
      path: folder,
      suggestedName: "projects",
      repoCount: 2,
      truncated: false,
    });
  });

  it("rejects relative paths, missing paths, and folders without repositories", async () => {
    expect((await inspectPath("relative")).kind).toBe("invalid");
    expect((await inspectPath(join(base, "missing"))).kind).toBe("invalid");
    expect(await inspectPath(join(base, "empty"))).toEqual({
      kind: "invalid",
      reason: "No git repositories found here (looked two folders deep)",
    });
  });
});
