import { realpath, stat } from "node:fs/promises";
import { basename, isAbsolute } from "node:path";
import type { Project, RepoTarget, ValidatePathOutput } from "../shared/contracts";
import { GitError, runGit } from "./git";

export interface WorkspaceInfo {
  directory: string | null;
  projectKind: string;
}

export interface RepoGuardDeps {
  readProjects(): Promise<readonly Project[]>;
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

/** Resolves a target to a canonical repository root that the user registered or is working in. */
export async function resolveRepo(target: RepoTarget, deps: RepoGuardDeps): Promise<string> {
  if (target.kind === "project") {
    const projects = await deps.readProjects();
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
