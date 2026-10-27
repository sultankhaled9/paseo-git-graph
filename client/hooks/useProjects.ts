import { useRpc, useSettings } from "@getpaseo/plugin/client";
import { useCallback } from "react";
import { MAX_PROJECTS, PROJECT_NAME_MAX_LENGTH } from "../../shared/constants";
import {
  type Folder,
  type Project,
  type ProjectsDocument,
  projectsSettings,
  validatePathRpc,
} from "../../shared/contracts";

const ID_RADIX = 36;
const RANDOM_PREFIX_LENGTH = 2;
const NO_PROJECTS: readonly Project[] = [];
const NO_FOLDERS: readonly Folder[] = [];

export type AddProjectResult = { ok: true; project: Project } | { ok: false; reason: string };

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
  const ready = settings.status === "ready";
  const projects = ready ? settings.values.projects : NO_PROJECTS;
  const folders = ready ? settings.values.folders : NO_FOLDERS;
  const revision = ready ? settings.revision : null;
  const { save, reload } = settings;

  // Every save writes the whole document, so changing one list must carry the other unchanged.
  const persist = useCallback(
    async (changes: Partial<ProjectsDocument>): Promise<boolean> => {
      if (revision === null) return false;
      const saved = await save({ projects: [...projects], folders: [...folders], ...changes }, revision);
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
  };
}
