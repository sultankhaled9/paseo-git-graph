import type { Folder, Project, ProjectsDocument } from "./contracts";

interface CurrentDocument {
  projects: readonly Project[];
  folders: readonly Folder[];
}

/** Settings saves replace the whole document, so a change to one list must carry the other unchanged. */
export function withChanges(current: CurrentDocument, changes: Partial<ProjectsDocument>): ProjectsDocument {
  return {
    projects: [...(changes.projects ?? current.projects)],
    folders: [...(changes.folders ?? current.folders)],
  };
}
