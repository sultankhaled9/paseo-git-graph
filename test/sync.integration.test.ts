import { execFileSync } from "node:child_process";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SYNC_COMMITS_LIMIT } from "../shared/constants";
import { syncCommitsRpc } from "../shared/contracts";
import { getRevision, getSyncCommits } from "../server/repo";

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
let mine = "";
let theirs = "";

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, env: GIT_ENV, encoding: "utf8" }).trim();
}

function commit(cwd: string, message: string): void {
  git(cwd, "commit", "-q", "--allow-empty", "-m", message);
}

function subjects(list: readonly { subject: string }[]): string[] {
  return list.map((entry) => entry.subject);
}

beforeAll(async () => {
  base = await realpath(await mkdtemp(join(tmpdir(), "git-graph-sync-")));
  const remote = join(base, "remote.git");
  execFileSync("git", ["-c", "init.defaultBranch=main", "init", "-q", "--bare", remote], { env: GIT_ENV });
  mine = join(base, "mine");
  theirs = join(base, "theirs");
  execFileSync("git", ["-c", "init.defaultBranch=main", "init", "-q", mine], { env: GIT_ENV });
  commit(mine, "shared base");
  git(mine, "remote", "add", "origin", remote);
  git(mine, "push", "-q", "-u", "origin", "main");
  execFileSync("git", ["clone", "-q", remote, theirs], { env: GIT_ENV });
});

afterAll(async () => {
  if (base) await rm(base, { recursive: true, force: true });
});

describe("getSyncCommits", () => {
  it("reports an in-sync branch with its upstream", async () => {
    expect(await getSyncCommits(mine)).toMatchObject({ mode: "upstream", upstream: "origin/main", toPush: [], toPull: [] });
  });

  it("lists local commits not pushed yet", async () => {
    commit(mine, "mine 1");
    const sync = await getSyncCommits(mine);
    expect(subjects(sync.toPush)).toEqual(["mine 1"]);
    expect(sync.toPull).toEqual([]);
  });

  it("lists fetched commits not pulled yet, alongside unpushed ones", async () => {
    commit(theirs, "theirs 1");
    git(theirs, "push", "-q", "origin", "main");
    git(mine, "fetch", "-q");
    const sync = await getSyncCommits(mine);
    expect(subjects(sync.toPush)).toEqual(["mine 1"]);
    expect(subjects(sync.toPull)).toEqual(["theirs 1"]);
  });

  it("lists commits no remote has when the branch has no upstream", async () => {
    git(mine, "checkout", "-q", "-b", "feature");
    commit(mine, "feature 1");
    const sync = await getSyncCommits(mine);
    expect(sync.mode).toBe("remotes");
    expect(sync.upstream).toBeNull();
    expect(subjects(sync.toPush)).toEqual(["feature 1", "mine 1"]);
    expect(sync.toPull).toEqual([]);
  });

  it("treats a detached HEAD like a branch without upstream", async () => {
    git(mine, "checkout", "-q", "--detach", "HEAD");
    const sync = await getSyncCommits(mine);
    git(mine, "checkout", "-q", "main");
    expect(sync.mode).toBe("remotes");
    expect(subjects(sync.toPush)).toEqual(["feature 1", "mine 1"]);
  });

  it("reports no destination for a repository without remotes", async () => {
    const local = join(base, "local");
    execFileSync("git", ["-c", "init.defaultBranch=main", "init", "-q", local], { env: GIT_ENV });
    commit(local, "only here");
    expect(await getSyncCommits(local)).toMatchObject({ mode: "none", toPush: [], toPull: [] });
  });

  it("does not treat a local branch as the server copy", async () => {
    const local = join(base, "local-upstream");
    execFileSync("git", ["-c", "init.defaultBranch=main", "init", "-q", local], { env: GIT_ENV });
    commit(local, "base");
    git(local, "checkout", "-q", "-b", "topic");
    commit(local, "topic 1");
    git(local, "branch", "-q", "--set-upstream-to=main");
    expect(await getSyncCommits(local)).toMatchObject({ mode: "none", upstream: null, toPush: [], toPull: [] });
  });

  it("returns empty lists for a repository without commits", async () => {
    const empty = join(base, "empty");
    execFileSync("git", ["-c", "init.defaultBranch=main", "init", "-q", empty], { env: GIT_ENV });
    expect(await getSyncCommits(empty)).toMatchObject({ mode: "none", toPush: [], toPull: [] });
    git(empty, "remote", "add", "origin", join(base, "remote.git"));
    expect(await getSyncCommits(empty)).toMatchObject({ mode: "remotes", toPush: [] });
  });

  it("caps each list and reports truncation", async () => {
    const busy = join(base, "busy");
    execFileSync("git", ["clone", "-q", join(base, "remote.git"), busy], { env: GIT_ENV });
    for (let index = 0; index <= SYNC_COMMITS_LIMIT; index += 1) commit(busy, `local ${index}`);
    const sync = await getSyncCommits(busy);
    expect(sync.toPush).toHaveLength(SYNC_COMMITS_LIMIT);
    expect(sync.toPushTruncated).toBe(true);
  });

  it("changes the refs token when only the upstream setting changes", async () => {
    git(mine, "checkout", "-q", "feature");
    const before = await getRevision(mine);
    git(mine, "branch", "-q", "--set-upstream-to=origin/main");
    const after = await getRevision(mine);
    expect(after.refsToken).not.toBe(before.refsToken);
  });

  it("accepts only a target in the contract", () => {
    expect(syncCommitsRpc.input.safeParse({ target: { kind: "project", projectId: "p" } }).success).toBe(true);
    expect(syncCommitsRpc.input.safeParse({}).success).toBe(false);
  });
});
