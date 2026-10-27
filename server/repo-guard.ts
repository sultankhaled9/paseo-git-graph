import { lstat, realpath, stat } from "node:fs/promises";
import { basename, isAbsolute, join } from "node:path";
import {
  type Folder,
  folderRelativePathSchema,
  type InspectPathOutput,
  type ProjectsDocument,
  type RepoTarget,
  type ValidatePathOutput,
} from "../shared/contracts";
import { FolderScanError, type FolderScanResult, scanFolder } from "./folder-scan";
import { GitError, runGit } from "./git";

export interface WorkspaceInfo {
  directory: string | null;
  projectKind: string;
}

export type ReadSettings = () => Promise<ProjectsDocument>;

export interface RepoGuardDeps {
  readSettings: ReadSettings;
  getWorkspace(workspaceId: string): Promise<WorkspaceInfo | null>;
}

async function canonical(path: string): Promise<string | null> {
  try {
    return await realpath(path);
  } catch {
    return null;
  }
}

async function toplevelOf(directory: string): Promise<string> {
  const toplevel = (await runGit(directory, ["rev-parse", "--show-toplevel"])).trim();
  return realpath(toplevel);
}

/** A saved folder at its saved canonical path; a moved or replaced folder is refused. */
export async function resolveFolder(folderId: string, readSettings: ReadSettings): Promise<Folder> {
  const { folders } = await readSettings();
  const folder = folders.find((candidate) => candidate.id === folderId);
  if (!folder) throw new Error("Unknown folder");
  if ((await canonical(folder.path)) !== folder.path) {
    throw new Error(`Folder "${folder.name}" is no longer available`);
  }
  return folder;
}

/**
 * A repository at `relativePath` under a canonical base directory. Every path component must be
 * a real directory (no symlinks), so the result cannot leave the base, and it must be exactly
 * git's toplevel, which also rejects ordinary subfolders of an enclosing repository.
 */
async function resolveRepoInside(base: string, relativePath: string, where: string): Promise<string> {
  if (!folderRelativePathSchema.safeParse(relativePath).success) {
    throw new Error("Not a repository path inside the folder");
  }
  let current = base;
  for (const segment of relativePath.split("/")) {
    current = join(current, segment);
    const info = await lstat(current).catch(() => null);
    if (!info || info.isSymbolicLink() || !info.isDirectory()) {
      throw new Error(`${relativePath} is no longer a repository in ${where}`);
    }
  }
  const root = await toplevelOf(current).catch(() => null);
  if (root !== current) throw new Error(`${relativePath} is not a repository root`);
  return root;
}

/** The canonical folder of any workspace with a directory, git or not. */
async function resolveWorkspaceFolder(workspaceId: string, deps: RepoGuardDeps): Promise<string> {
  const workspace = await deps.getWorkspace(workspaceId);
  if (!workspace?.directory) throw new Error("This workspace has no folder");
  const directory = await canonical(workspace.directory);
  if (!directory) throw new Error("Workspace folder is not available");
  return directory;
}

/** Resolves a target to a canonical repository root that the user registered or is working in. */
export async function resolveRepo(target: RepoTarget, deps: RepoGuardDeps): Promise<string> {
  if (target.kind === "folder-repo") {
    const folder = await resolveFolder(target.folderId, deps.readSettings);
    return resolveRepoInside(folder.path, target.relativePath, `"${folder.name}"`);
  }
  if (target.kind === "workspace-repo") {
    return resolveRepoInside(await resolveWorkspaceFolder(target.workspaceId, deps), target.relativePath, "this workspace");
  }
  if (target.kind === "project") {
    const { projects } = await deps.readSettings();
    const project = projects.find((candidate) => candidate.id === target.projectId);
    if (!project) throw new Error("Unknown project");
    const directory = await canonical(project.path);
    if (!directory) throw new Error(`Project "${project.name}" is no longer available`);
    const root = await toplevelOf(directory);
    if (root !== project.path) {
      throw new Error(`Project "${project.name}" no longer points at its repository root`);
    }
    return root;
  }

  const workspace = await deps.getWorkspace(target.workspaceId);
  if (!workspace || workspace.projectKind !== "git" || !workspace.directory) {
    throw new Error("This workspace is not a git repository");
  }
  const directory = await canonical(workspace.directory);
  if (!directory) throw new Error("Workspace directory is not available");
  return toplevelOf(directory);
}

export async function validateRepoPath(path: string): Promise<ValidatePathOutput> {
  if (!isAbsolute(path)) return { ok: false, reason: "Path must be absolute" };
  const directory = await canonical(path);
  if (!directory) return { ok: false, reason: "Path does not exist" };
  if (!(await stat(directory)).isDirectory()) return { ok: false, reason: "Path is not a directory" };
  try {
    const root = await toplevelOf(directory);
    return { ok: true, path: root, suggestedName: basename(root) };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof GitError ? error.message : "Not a git repository",
    };
  }
}

export async function listWorkspaceRepos(workspaceId: string, deps: RepoGuardDeps): Promise<FolderScanResult> {
  return scanFolder(await resolveWorkspaceFolder(workspaceId, deps));
}

export async function listFolderRepos(folderId: string, readSettings: ReadSettings): Promise<FolderScanResult> {
  const folder = await resolveFolder(folderId, readSettings);
  return scanFolder(folder.path);
}

/** Classifies a path for the add form: a repository first, then a folder that contains repositories. */
export async function inspectPath(path: string): Promise<InspectPathOutput> {
  const repo = await validateRepoPath(path);
  if (repo.ok) return { kind: "repo", path: repo.path, suggestedName: repo.suggestedName };
  const directory = isAbsolute(path) ? await canonical(path) : null;
  if (!directory || !(await stat(directory)).isDirectory()) return { kind: "invalid", reason: repo.reason };
  try {
    const { repos, truncated } = await scanFolder(directory);
    if (repos.length === 0) {
      return { kind: "invalid", reason: "No git repositories found here (looked two folders deep)" };
    }
    return { kind: "folder", path: directory, suggestedName: basename(directory), repoCount: repos.length, truncated };
  } catch (error) {
    return { kind: "invalid", reason: error instanceof FolderScanError ? error.message : "This folder cannot be read" };
  }
}
