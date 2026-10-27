import { execFileSync } from "node:child_process";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRepoHandlers, type WorkspaceLookup } from "../server/handlers";

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

function lookup(workspaces: Record<string, { workspaceDirectory?: string; projectKind: string }>): WorkspaceLookup {
  return {
    workspaces: {
      ref: (workspaceId) => ({ refresh: async () => workspaces[workspaceId] ?? null }),
    },
  };
}

beforeAll(async () => {
  repo = await realpath(await mkdtemp(join(tmpdir(), "git-graph-handlers-")));
  execFileSync("git", ["-c", "init.defaultBranch=main", "init", "-q", repo], { env: GIT_ENV });
  await writeFile(join(repo, "a.txt"), "a\n");
  execFileSync("git", ["add", "."], { cwd: repo, env: GIT_ENV });
  execFileSync("git", ["commit", "-qm", "first"], { cwd: repo, env: GIT_ENV });
});

afterAll(async () => {
  if (repo) await rm(repo, { recursive: true, force: true });
});

describe("repo handlers", () => {
  const handlers = createRepoHandlers(async () => ({ projects: [{ id: "p", name: "Repo", path: repo }], folders: [] }));

  it("serve a saved project", async () => {
    const result = await handlers.log({ target: { kind: "project", projectId: "p" }, limit: 5, scope: "all" }, lookup({}));
    expect(result.commits.map((commit) => commit.subject)).toEqual(["first"]);
  });

  it("serve a git workspace through the Paseo workspace lookup", async () => {
    const paseo = lookup({ w: { workspaceDirectory: repo, projectKind: "git" } });
    const status = await handlers.status({ target: { kind: "workspace", workspaceId: "w" } }, paseo);
    expect(status).toMatchObject({ root: repo, branch: "main" });
  });

  it("serve the configured identity apart from status", async () => {
    execFileSync("git", ["config", "user.email", "ada@example.com"], { cwd: repo, env: GIT_ENV });
    const identity = await handlers.identity({ target: { kind: "project", projectId: "p" } }, lookup({}));
    expect(identity.email).toBe("ada@example.com");
  });

  it("list repositories inside a workspace folder through the Paseo lookup", async () => {
    const paseo = lookup({ w: { workspaceDirectory: dirname(repo), projectKind: "directory" } });
    const { repos } = await handlers.workspaceRepos({ workspaceId: "w" }, paseo);
    expect(repos.map((entry) => entry.relativePath)).toContain(basename(repo));
  });

  it("reject workspaces without a directory", async () => {
    const paseo = lookup({ w: { projectKind: "git" } });
    await expect(
      handlers.revision({ target: { kind: "workspace", workspaceId: "w" } }, paseo),
    ).rejects.toThrow("not a git repository");
  });
});
