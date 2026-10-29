import { execFileSync } from "node:child_process";
import { chmod, lstat, mkdir, mkdtemp, readFile, readlink, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  backupRef,
  createBackup,
  fingerprintPaths,
  listBackups,
  pruneBackups,
  recordAfterState,
  repoFilePath,
  restoreBackup,
} from "../server/backup";
import { GIT_MAX_BUFFER_BYTES } from "../shared/constants";

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "Ada",
  GIT_AUTHOR_EMAIL: "ada@example.com",
  GIT_COMMITTER_NAME: "Ada",
  GIT_COMMITTER_EMAIL: "ada@example.com",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
};
const BINARY = Buffer.from([0, 255, 13, 10, 7, 0, 42]);
const CRLF = Buffer.from("line one\r\nline two\r\n");
const EXECUTABLE_BITS = 0o111;

let base = "";
let repo = "";

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: repo, env: GIT_ENV, encoding: "utf8" }).trim();
}

beforeAll(async () => {
  base = await realpath(await mkdtemp(join(tmpdir(), "git-graph-backup-")));
  repo = join(base, "repo");
  execFileSync("git", ["-c", "init.defaultBranch=main", "init", "-q", repo], { env: GIT_ENV });
  git("config", "core.autocrlf", "true");
  await writeFile(join(repo, "a.txt"), "committed\n");
  await writeFile(join(repo, "staged.txt"), "committed\n");
  await writeFile(join(repo, "run.sh"), "#!/bin/sh\necho hi\n");
  await chmod(join(repo, "run.sh"), 0o755);
  git("add", ".");
  git("commit", "-qm", "base");
  await writeFile(join(repo, "a.txt"), "edited, not staged\n");
  await writeFile(join(repo, "staged.txt"), "staged version\n");
  git("add", "staged.txt");
  await writeFile(join(repo, "staged.txt"), "staged version\nplus a worktree edit\n");
  await writeFile(join(repo, "bin.dat"), BINARY);
  await writeFile(join(repo, "crlf.txt"), CRLF);
  await mkdir(join(repo, "dir", "sub"), { recursive: true });
  await writeFile(join(repo, "dir", "sub", "new.txt"), "nested new file\n");
  await symlink("a.txt", join(repo, "link"));
  await mkdir(join(base, "outside"));
  await symlink(join(base, "outside"), join(repo, "escape"));
});

afterAll(async () => {
  if (base) await rm(base, { recursive: true, force: true });
});

const PATHS = ["a.txt", "staged.txt", "run.sh", "bin.dat", "crlf.txt", "dir/sub/new.txt", "link"];

describe("backups", () => {
  let id = "";

  it("saves every path under a private ref that plain git can read", async () => {
    id = await createBackup(repo, { kind: "discard-all" }, PATHS);
    expect(git("rev-parse", "--verify", backupRef(id))).toMatch(/^[0-9a-f]{40}$/);
    const manifest = JSON.parse(git("show", `${backupRef(id)}:manifest.json`)) as { entries: { path: string }[] };
    expect(manifest.entries.map((entry) => entry.path)).toEqual(PATHS);
    expect((await listBackups(repo))[0]).toMatchObject({ id, paths: PATHS, action: { kind: "discard-all" } });
  });

  it("restores exact bytes, executable bit, symlink, nested file, and staged entries, then removes the backup", async () => {
    const stagedBlob = git("rev-parse", ":staged.txt");
    git("reset", "-q", "--hard", "HEAD");
    for (const path of ["bin.dat", "crlf.txt", "dir/sub/new.txt", "link"]) await rm(join(repo, path), { recursive: true, force: true });
    await rm(join(repo, "dir"), { recursive: true, force: true });
    await chmod(join(repo, "run.sh"), 0o644);
    await recordAfterState(repo, id);

    expect(await restoreBackup(repo, id)).toEqual(PATHS);
    expect(await readFile(join(repo, "a.txt"), "utf8")).toBe("edited, not staged\n");
    expect(await readFile(join(repo, "staged.txt"), "utf8")).toBe("staged version\nplus a worktree edit\n");
    expect(git("rev-parse", ":staged.txt")).toBe(stagedBlob);
    expect(Buffer.compare(await readFile(join(repo, "bin.dat")), BINARY)).toBe(0);
    expect(Buffer.compare(await readFile(join(repo, "crlf.txt")), CRLF)).toBe(0);
    expect(await readFile(join(repo, "dir", "sub", "new.txt"), "utf8")).toBe("nested new file\n");
    expect(await readlink(join(repo, "link"))).toBe("a.txt");
    expect(((await lstat(join(repo, "run.sh"))).mode & EXECUTABLE_BITS) !== 0).toBe(true);
    expect((await listBackups(repo)).some((backup) => backup.id === id)).toBe(false);
  });

  it("restores nothing when any path changed after the action", async () => {
    const backup = await createBackup(repo, { kind: "discard", path: "a.txt", area: "unstaged" }, ["a.txt", "bin.dat"]);
    await writeFile(join(repo, "a.txt"), "committed\n");
    await rm(join(repo, "bin.dat"));
    await recordAfterState(repo, backup);
    await writeFile(join(repo, "a.txt"), "edited again later\n");
    await expect(restoreBackup(repo, backup)).rejects.toThrow("a.txt changed after the change was made");
    await expect(lstat(join(repo, "bin.dat"))).rejects.toThrow();
    expect((await listBackups(repo)).some((summary) => summary.id === backup)).toBe(true);
  });

  it("changes nothing when the backup cannot be read", async () => {
    await writeFile(join(repo, "a.txt"), "only in the backup\n");
    const backup = await createBackup(repo, { kind: "discard", path: "a.txt", area: "unstaged" }, ["a.txt"]);
    const blob = git("hash-object", "--no-filters", "a.txt");
    await writeFile(join(repo, "a.txt"), "after the action\n");
    await recordAfterState(repo, backup);
    await rm(join(repo, ".git", "objects", blob.slice(0, 2), blob.slice(2)));
    await expect(restoreBackup(repo, backup)).rejects.toThrow("Nothing was restored");
    expect(await readFile(join(repo, "a.txt"), "utf8")).toBe("after the action\n");
    expect((await listBackups(repo)).some((summary) => summary.id === backup)).toBe(true);
  });

  it("rolls back a restore that fails partway, so it can be retried", async () => {
    await mkdir(join(repo, "locked"));
    await writeFile(join(repo, "a.txt"), "first before\n");
    await writeFile(join(repo, "locked", "b.txt"), "second before\n");
    const backup = await createBackup(repo, { kind: "discard-all" }, ["a.txt", "locked/b.txt"]);
    await writeFile(join(repo, "a.txt"), "first after\n");
    await writeFile(join(repo, "locked", "b.txt"), "second after\n");
    await recordAfterState(repo, backup);
    await chmod(join(repo, "locked"), 0o555);
    try {
      await expect(restoreBackup(repo, backup)).rejects.toThrow("Nothing was restored");
      expect(await readFile(join(repo, "a.txt"), "utf8")).toBe("first after\n");
      expect(await readFile(join(repo, "locked", "b.txt"), "utf8")).toBe("second after\n");
    } finally {
      await chmod(join(repo, "locked"), 0o755);
    }
    expect(await restoreBackup(repo, backup)).toEqual(["a.txt", "locked/b.txt"]);
    expect(await readFile(join(repo, "a.txt"), "utf8")).toBe("first before\n");
    expect(await readFile(join(repo, "locked", "b.txt"), "utf8")).toBe("second before\n");
  });

  it("refuses to back up a file it could not read back, creating no backup", async () => {
    const before = (await listBackups(repo)).length;
    await writeFile(join(repo, "huge.bin"), Buffer.alloc(GIT_MAX_BUFFER_BYTES + 1));
    try {
      await expect(createBackup(repo, { kind: "delete", path: "huge.bin" }, ["huge.bin"])).rejects.toThrow("too large to back up");
      expect(await listBackups(repo)).toHaveLength(before);
    } finally {
      await rm(join(repo, "huge.bin"));
    }
  });

  it("refuses to restore a backup without an after-state record", async () => {
    const backup = await createBackup(repo, { kind: "delete", path: "a.txt" }, ["a.txt"]);
    await expect(restoreBackup(repo, backup)).rejects.toThrow("no record of the state after the change");
  });

  it("changes the fingerprint when contents or the executable bit change", async () => {
    const before = await fingerprintPaths(repo, ["run.sh"]);
    await chmod(join(repo, "run.sh"), 0o644);
    expect(await fingerprintPaths(repo, ["run.sh"])).not.toBe(before);
  });

  it("keeps only the newest backups when pruning", async () => {
    for (let index = 0; index < 3; index += 1) await createBackup(repo, { kind: "delete", path: "a.txt" }, ["a.txt"]);
    const newest = (await listBackups(repo)).slice(0, 2).map((backup) => backup.id);
    await pruneBackups(repo, 2);
    expect((await listBackups(repo)).map((backup) => backup.id)).toEqual(newest);
  });

  it("never resolves paths through a symlinked folder", async () => {
    await expect(repoFilePath(repo, "escape/file.txt")).rejects.toThrow("symbolic link");
    await expect(repoFilePath(repo, "../outside")).rejects.toThrow("not a path inside the repository");
  });
});
