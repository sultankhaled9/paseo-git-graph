import { createHash, randomBytes } from "node:crypto";
import { chmod, lstat, mkdir, readFile, readlink, symlink, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import { BACKUP_REF_PREFIX, GIT_MAX_BUFFER_BYTES, MAX_BACKUPS } from "../shared/constants";
import { type BackupSummary, type ChangeAction, changeActionSchema } from "../shared/contracts";
import { runGit, runGitOptional, runGitRaw } from "./git";

const MANIFEST_NAME = "manifest.json";
const MANIFEST_VERSION = 1;
const BACKUP_ID_RANDOM_BYTES = 4;
const EXECUTABLE_BITS = 0o111;
const PERMISSION_BITS = 0o7777;
/** Modes for files a restore creates, before the umask, as git checkout does. */
const NEW_FILE_MODE = 0o666;
const NEW_EXECUTABLE_MODE = 0o777;
const GITLINK_MODE = "160000";
/** Hex length of an object id per repository hash algorithm, for the all-zero id that removes an index entry. */
const OBJECT_ID_LENGTH: Readonly<Record<string, number>> = { sha1: 40, sha256: 64 };
const BACKUP_IDENTITY: Readonly<Record<string, string>> = {
  GIT_AUTHOR_NAME: "Git Graph plugin",
  GIT_AUTHOR_EMAIL: "git-graph@localhost",
  GIT_COMMITTER_NAME: "Git Graph plugin",
  GIT_COMMITTER_EMAIL: "git-graph@localhost",
};

const worktreeStateSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("absent") }),
  z.object({ kind: z.literal("file"), blob: z.string(), executable: z.boolean() }),
  z.object({ kind: z.literal("symlink"), blob: z.string() }),
]);
type WorktreeState = z.infer<typeof worktreeStateSchema>;

const indexEntrySchema = z.object({ mode: z.string(), blob: z.string(), stage: z.number().int() });
type IndexEntry = z.infer<typeof indexEntrySchema>;

const manifestSchema = z.object({
  version: z.literal(MANIFEST_VERSION),
  id: z.string(),
  createdAt: z.string(),
  action: changeActionSchema,
  entries: z.array(z.object({ path: z.string(), worktree: worktreeStateSchema, index: z.array(indexEntrySchema) })),
  /** Fingerprint of each path right after the action; restore only proceeds if they still match. */
  after: z.record(z.string(), z.string()).nullable(),
});
type Manifest = z.infer<typeof manifestSchema>;

type LiveState =
  | { kind: "absent" }
  | { kind: "file"; bytes: Buffer; executable: boolean }
  | { kind: "symlink"; target: Buffer };

/** A path's state with its contents in the object store, so a restore never holds every file in memory. */
type Snapshot = { kind: "absent" } | { kind: "file"; blob: string; permissions: number } | { kind: "symlink"; blob: string };

function reason(error: unknown): string {
  return error instanceof Error ? error.message : "The restore failed";
}

export function backupRef(id: string): string {
  return `${BACKUP_REF_PREFIX}${id}`;
}

/**
 * The absolute location of a repository-relative path. Parents that exist must be real directories,
 * never symbolic links, so a write can never land outside the repository.
 */
export async function repoFilePath(root: string, relativePath: string): Promise<string> {
  const segments = relativePath.split("/");
  if (relativePath.startsWith("/") || segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new Error(`${relativePath} is not a path inside the repository`);
  }
  let current = root;
  for (const segment of segments.slice(0, -1)) {
    current = join(current, segment);
    const info = await lstat(current).catch(() => null);
    if (!info) break;
    if (info.isSymbolicLink() || !info.isDirectory()) throw new Error(`${relativePath} is inside a symbolic link or file`);
  }
  return join(root, relativePath);
}

async function readLive(root: string, relativePath: string): Promise<LiveState> {
  const absolute = await repoFilePath(root, relativePath);
  const info = await lstat(absolute).catch(() => null);
  if (!info) return { kind: "absent" };
  if (info.isSymbolicLink()) return { kind: "symlink", target: await readlink(absolute, { encoding: "buffer" }) };
  if (info.isFile()) return { kind: "file", bytes: await readFile(absolute), executable: (info.mode & EXECUTABLE_BITS) !== 0 };
  throw new Error(`${relativePath} is a folder, not a file`);
}

async function readIndex(root: string, relativePath: string): Promise<IndexEntry[]> {
  const stdout = await runGit(root, ["ls-files", "-s", "-z", "--", relativePath]);
  const entries: IndexEntry[] = [];
  for (const record of stdout.split("\0")) {
    const tab = record.indexOf("\t");
    if (tab < 0 || record.slice(tab + 1) !== relativePath) continue;
    const [mode = "", blob = "", stage = "0"] = record.slice(0, tab).split(" ");
    if (mode === GITLINK_MODE) throw new Error(`${relativePath} is a submodule, which this view cannot change`);
    entries.push({ mode, blob, stage: Number(stage) });
  }
  return entries;
}

/** A strong fingerprint of the exact index entries and on-disk contents of some paths. */
export async function fingerprintPaths(root: string, paths: readonly string[]): Promise<string> {
  const hash = createHash("sha256");
  for (const path of [...paths].sort()) {
    const [live, index] = await Promise.all([readLive(root, path), readIndex(root, path)]);
    hash.update(path).update("\0");
    for (const entry of index) hash.update(`${entry.mode} ${entry.blob} ${entry.stage}\0`);
    hash.update(live.kind).update("\0");
    if (live.kind === "file") hash.update(live.executable ? "x" : "-").update(live.bytes);
    if (live.kind === "symlink") hash.update(live.target);
    hash.update("\0\0");
  }
  return hash.digest("hex");
}

async function hashBlob(root: string, bytes: Buffer | string, write: boolean): Promise<string> {
  const args = ["hash-object", ...(write ? ["-w"] : []), "--no-filters", "--stdin"];
  return (await runGitRaw(root, args, { input: bytes })).toString("utf8").trim();
}

function storeBlob(root: string, bytes: Buffer | string): Promise<string> {
  return hashBlob(root, bytes, true);
}

/** Writes the manifest and keeps every referenced blob reachable from one commit, so gc keeps them. */
async function writeManifestCommit(root: string, manifest: Manifest, parent: string | null): Promise<string> {
  const blobs = new Set<string>();
  for (const entry of manifest.entries) {
    if (entry.worktree.kind !== "absent") blobs.add(entry.worktree.blob);
    for (const indexEntry of entry.index) blobs.add(indexEntry.blob);
  }
  const manifestBlob = await storeBlob(root, JSON.stringify(manifest, null, 2));
  const lines = [`100644 blob ${manifestBlob}\t${MANIFEST_NAME}`, ...[...blobs].sort().map((blob) => `100644 blob ${blob}\tblob-${blob}`)];
  const tree = (await runGitRaw(root, ["mktree", "-z"], { input: `${lines.join("\0")}\0` })).toString("utf8").trim();
  const message = `git-graph backup ${manifest.id}: ${manifest.action.kind}, ${manifest.entries.length} path(s)`;
  const args = ["commit-tree", tree, "-m", message, ...(parent ? ["-p", parent] : [])];
  return (await runGitRaw(root, args, { env: BACKUP_IDENTITY })).toString("utf8").trim();
}

async function readManifest(root: string, id: string): Promise<{ manifest: Manifest; commit: string }> {
  const ref = backupRef(id);
  const commit = (await runGitOptional(root, ["rev-parse", "-q", "--verify", ref])).trim();
  if (!commit) throw new Error("That backup no longer exists");
  const raw = await runGit(root, ["cat-file", "blob", `${commit}:${MANIFEST_NAME}`]);
  return { manifest: manifestSchema.parse(JSON.parse(raw)), commit };
}

/** Saves the current contents of `paths` under a new backup ref before anything is changed. */
export async function createBackup(root: string, action: ChangeAction, paths: readonly string[]): Promise<string> {
  const id = `${Date.now()}-${randomBytes(BACKUP_ID_RANDOM_BYTES).toString("hex")}`;
  const entries: Manifest["entries"] = [];
  for (const path of paths) {
    const [live, index] = await Promise.all([readLive(root, path), readIndex(root, path)]);
    let worktree: WorktreeState = { kind: "absent" };
    // A backup that could not be read back would make Undo impossible, so such files are refused up front.
    if (live.kind === "file" && live.bytes.length > GIT_MAX_BUFFER_BYTES) {
      throw new Error(`${path} is too large to back up, so nothing was changed`);
    }
    if (live.kind === "file") worktree = { kind: "file", blob: await storeBlob(root, live.bytes), executable: live.executable };
    if (live.kind === "symlink") worktree = { kind: "symlink", blob: await storeBlob(root, live.target) };
    entries.push({ path, worktree, index });
  }
  const manifest: Manifest = { version: MANIFEST_VERSION, id, createdAt: new Date().toISOString(), action, entries, after: null };
  const commit = await writeManifestCommit(root, manifest, null);
  // An empty old value makes git refuse if the ref already exists.
  await runGit(root, ["update-ref", backupRef(id), commit, ""]);
  return id;
}

/** Records each path's state right after the action, which restore requires to match. */
export async function recordAfterState(root: string, id: string): Promise<void> {
  const { manifest, commit } = await readManifest(root, id);
  const after: Record<string, string> = {};
  for (const entry of manifest.entries) after[entry.path] = await fingerprintPaths(root, [entry.path]);
  const next = await writeManifestCommit(root, { ...manifest, after }, commit);
  await runGit(root, ["update-ref", backupRef(id), next, commit]);
}

async function backupIds(root: string): Promise<string[]> {
  const stdout = await runGit(root, ["for-each-ref", "--format=%(refname)", BACKUP_REF_PREFIX]);
  return stdout
    .split("\n")
    .filter((line) => line.startsWith(BACKUP_REF_PREFIX))
    .map((line) => line.slice(BACKUP_REF_PREFIX.length))
    .sort();
}

/** Deletes the oldest backups beyond `keep`; ids start with a millisecond timestamp, so they sort by age. */
export async function pruneBackups(root: string, keep: number = MAX_BACKUPS): Promise<void> {
  const ids = await backupIds(root);
  for (const id of ids.slice(0, Math.max(ids.length - keep, 0))) await runGit(root, ["update-ref", "-d", backupRef(id)]);
}

export async function listBackups(root: string): Promise<BackupSummary[]> {
  const ids = (await backupIds(root)).reverse();
  const summaries: BackupSummary[] = [];
  for (const id of ids) {
    const { manifest } = await readManifest(root, id);
    summaries.push({ id, createdAt: manifest.createdAt, action: manifest.action, paths: manifest.entries.map((entry) => entry.path) });
  }
  return summaries;
}

async function readBlob(root: string, blob: string): Promise<Buffer> {
  return runGitRaw(root, ["cat-file", "blob", blob]);
}

/** Fails unless every blob exists and is small enough to read back, without loading any of them. */
async function checkBlobsReadable(root: string, blobs: readonly string[]): Promise<void> {
  if (blobs.length === 0) return;
  const stdout = (await runGitRaw(root, ["cat-file", "--batch-check"], { input: `${blobs.join("\n")}\n` })).toString("utf8");
  for (const line of stdout.trim().split("\n")) {
    const [blob = "", type = "", size = ""] = line.split(" ");
    if (type !== "blob") throw new Error(`The backup is missing its copy of a file (${blob})`);
    if (Number(size) > GIT_MAX_BUFFER_BYTES) throw new Error(`The backup holds a file too large to restore here (${blob})`);
  }
}

/** The path's current state; with `store`, its contents are also written to the object store. */
async function snapshot(root: string, path: string, store: boolean): Promise<Snapshot> {
  const absolute = await repoFilePath(root, path);
  const info = await lstat(absolute).catch(() => null);
  if (!info) return { kind: "absent" };
  if (info.isSymbolicLink()) return { kind: "symlink", blob: await hashBlob(root, await readlink(absolute, { encoding: "buffer" }), store) };
  if (info.isFile()) return { kind: "file", blob: await hashBlob(root, await readFile(absolute), store), permissions: info.mode & PERMISSION_BITS };
  throw new Error(`${path} is a folder, not a file`);
}

function sameSnapshot(a: Snapshot, b: Snapshot): boolean {
  if (a.kind === "file" && b.kind === "file") return a.blob === b.blob && a.permissions === b.permissions;
  if (a.kind === "symlink" && b.kind === "symlink") return a.blob === b.blob;
  return a.kind === "absent" && b.kind === "absent";
}

/** Replaces whatever is at `path` with `state`; `permissions` restores exact mode bits instead of the defaults. */
async function writeLive(root: string, path: string, state: LiveState, permissions?: number): Promise<void> {
  const absolute = await repoFilePath(root, path);
  const existing = await lstat(absolute).catch(() => null);
  if (existing?.isDirectory()) throw new Error(`${path} is now a folder`);
  if (existing) await unlink(absolute);
  if (state.kind === "absent") return;
  await mkdir(dirname(absolute), { recursive: true });
  // The folders just created must still be real directories before anything is written into them.
  await repoFilePath(root, path);
  if (state.kind === "symlink") {
    await symlink(state.target, absolute);
    return;
  }
  await writeFile(absolute, state.bytes, { mode: state.executable ? NEW_EXECUTABLE_MODE : NEW_FILE_MODE });
  if (permissions !== undefined) await chmod(absolute, permissions);
}

async function writeSaved(root: string, path: string, state: WorktreeState): Promise<void> {
  if (state.kind === "absent") return writeLive(root, path, state);
  const bytes = await readBlob(root, state.blob);
  await writeLive(root, path, state.kind === "symlink" ? { kind: "symlink", target: bytes } : { kind: "file", bytes, executable: state.executable });
}

/** Writes a snapshot back unless the path already holds it, so a write that never started is not repeated. */
async function putBack(root: string, path: string, state: Snapshot): Promise<void> {
  const now = await snapshot(root, path, false).catch(() => null);
  if (now && sameSnapshot(now, state)) return;
  if (state.kind === "absent") return writeLive(root, path, state);
  const bytes = await readBlob(root, state.blob);
  if (state.kind === "symlink") return writeLive(root, path, { kind: "symlink", target: bytes });
  await writeLive(root, path, { kind: "file", bytes, executable: (state.permissions & EXECUTABLE_BITS) !== 0 }, state.permissions);
}

/** One `update-index --index-info` input that drops every stage of each path, then adds the saved entries. */
async function indexReplacement(root: string, manifest: Manifest): Promise<string> {
  const format = (await runGit(root, ["rev-parse", "--show-object-format"])).trim();
  const length = OBJECT_ID_LENGTH[format];
  if (length === undefined) throw new Error(`Unsupported object format ${format}`);
  const zero = "0".repeat(length);
  const lines = [
    ...manifest.entries.map((entry) => `0 ${zero}\t${entry.path}`),
    ...manifest.entries.flatMap((entry) => entry.index.map((index) => `${index.mode} ${index.blob} ${index.stage}\t${entry.path}`)),
  ];
  return `${lines.join("\0")}\0`;
}

/**
 * Puts a backup's files and staged entries back, all or nothing: every path must still be exactly
 * as the action left it, so a later edit is never overwritten. The backup is checked and the current
 * files are saved before the first write, and a failure partway puts the written files back with
 * their permissions, so Restore can be retried. The backup ref is removed afterwards.
 */
export async function restoreBackup(root: string, id: string): Promise<string[]> {
  const { manifest } = await readManifest(root, id);
  const after = manifest.after;
  if (!after) {
    throw new Error(`This backup has no record of the state after the change, so it cannot be restored here. Its files are kept in ${backupRef(id)}.`);
  }
  for (const entry of manifest.entries) {
    if ((await fingerprintPaths(root, [entry.path])) !== after[entry.path]) {
      throw new Error(`${entry.path} changed after the change was made, so nothing was restored. The backup is kept.`);
    }
  }
  const paths = manifest.entries.map((entry) => entry.path);
  // Before any write: the backup must be readable, and the current files are saved for a rollback.
  // Contents go through the object store one file at a time, so memory stays bounded by the largest file.
  const steps: { path: string; saved: WorktreeState; current: Snapshot }[] = [];
  let indexInput: string;
  try {
    await checkBlobsReadable(root, manifest.entries.flatMap((entry) => (entry.worktree.kind === "absent" ? [] : [entry.worktree.blob])));
    for (const entry of manifest.entries) steps.push({ path: entry.path, saved: entry.worktree, current: await snapshot(root, entry.path, true) });
    indexInput = await indexReplacement(root, manifest);
  } catch (error) {
    throw new Error(`${reason(error)}. Nothing was restored; the backup is kept.`);
  }

  const started: typeof steps = [];
  try {
    for (const step of steps) {
      started.push(step);
      await writeSaved(root, step.path, step.saved);
    }
    // One index write: git applies it through index.lock, so it either fully lands or not at all.
    await runGitRaw(root, ["update-index", "-z", "--index-info"], { input: indexInput });
  } catch (error) {
    const unrestored: string[] = [];
    for (const step of started.reverse()) await putBack(root, step.path, step.current).catch(() => unrestored.push(step.path));
    if (unrestored.length > 0) {
      throw new Error(`${reason(error)}. The restore stopped partway and ${unrestored.join(", ")} could not be put back; the backup is kept in ${backupRef(id)}.`);
    }
    throw new Error(`${reason(error)}. Nothing was restored; the backup is kept.`);
  }
  await runGit(root, ["update-ref", "-d", backupRef(id)]);
  return paths;
}
