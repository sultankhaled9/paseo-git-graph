import { useRpc, useSettings } from "@getpaseo/plugin/client";
import { useCallback } from "react";
import { MAX_FOLDERS, MAX_PROJECTS, PROJECT_NAME_MAX_LENGTH } from "../../shared/constants";
import {
  type Folder,
  inspectPathRpc,
  type InspectPathOutput,
  type Project,
  type ProjectsDocument,
  projectsSettings,
  validatePathRpc,
} from "../../shared/contracts";
import { withChanges } from "../../shared/projects-document";

const ID_RADIX = 36;
const RANDOM_PREFIX_LENGTH = 2;
const NO_PROJECTS: readonly Project[] = [];
const NO_FOLDERS: readonly Folder[] = [];

export type AddProjectResult = { ok: true; project: Project } | { ok: false; reason: string };
export type AddFolderResult = { ok: true; folder: Folder } | { ok: false; reason: string };
export type FolderInspection = Extract<InspectPathOutput, { kind: "folder" }>;

function newProjectId(): string {
  return `${Date.now().toString(ID_RADIX)}${Math.random().toString(ID_RADIX).slice(RANDOM_PREFIX_LENGTH)}`;
}

/**
 * The manual project list. The daemon validates and canonicalizes each path; the client
 * saves the list because plugin settings are only writable from the app.
 */
export function useProjects() {
  const settings = useSettings(projectsSettings);
  const validatePath = useRpc(validatePathRpc);
  const inspect = useRpc(inspectPathRpc);
  const ready = settings.status === "ready";
  const projects = ready ? settings.values.projects : NO_PROJECTS;
  const folders = ready ? settings.values.folders : NO_FOLDERS;
  const revision = ready ? settings.revision : null;
  const { save, reload } = settings;

  const persist = useCallback(
    async (changes: Partial<ProjectsDocument>): Promise<boolean> => {
      if (revision === null) return false;
      const saved = await save(withChanges({ projects, folders }, changes), revision);
      if (!saved) await reload();
      return saved;
    },
    [revision, projects, folders, save, reload],
  );

  const add = useCallback(
    async (path: string, name: string): Promise<AddProjectResult> => {
      if (revision === null) return { ok: false, reason: "Projects are still loading" };
      if (projects.length >= MAX_PROJECTS) {
        return { ok: false, reason: `You can track up to ${MAX_PROJECTS} repositories` };
      }
      const result = await validatePath({ path: path.trim() });
      if (!result.ok) return result;
      if (projects.some((project) => project.path === result.path)) {
        return { ok: false, reason: "This repository is already tracked" };
      }
      const project: Project = {
        id: newProjectId(),
        name: (name.trim() || result.suggestedName).slice(0, PROJECT_NAME_MAX_LENGTH),
        path: result.path,
      };
      return (await persist({ projects: [...projects, project] }))
        ? { ok: true, project }
        : { ok: false, reason: "Projects changed elsewhere. Try again." };
    },
    [revision, projects, validatePath, persist],
  );

  const addFolder = useCallback(
    async (inspection: FolderInspection, name: string): Promise<AddFolderResult> => {
      if (revision === null) return { ok: false, reason: "Projects are still loading" };
      if (folders.length >= MAX_FOLDERS) return { ok: false, reason: `You can track up to ${MAX_FOLDERS} folders` };
      if (folders.some((folder) => folder.path === inspection.path)) {
        return { ok: false, reason: "This folder is already tracked" };
      }
      const folder: Folder = {
        id: newProjectId(),
        name: (name.trim() || inspection.suggestedName).slice(0, PROJECT_NAME_MAX_LENGTH),
        path: inspection.path,
      };
      return (await persist({ folders: [...folders, folder] }))
        ? { ok: true, folder }
        : { ok: false, reason: "Projects changed elsewhere. Try again." };
    },
    [revision, folders, persist],
  );

  const removeFolder = useCallback(
    (id: string): Promise<boolean> => persist({ folders: folders.filter((folder) => folder.id !== id) }),
    [folders, persist],
  );

  const remove = useCallback(
    (id: string): Promise<boolean> => persist({ projects: projects.filter((project) => project.id !== id) }),
    [projects, persist],
  );

  return {
    projects,
    folders,
    status: settings.status,
    error: settings.status === "error" || settings.status === "invalid" ? settings.error : null,
    saving: settings.saving,
    add,
    remove,
    inspect,
    addFolder,
    removeFolder,
  };
}
