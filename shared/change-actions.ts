import type { ChangeAction, WipArea } from "./contracts";
import { fileName } from "./file-groups";

export type FileActionKind = "discard" | "unstage" | "delete";

/**
 * The actions offered for a file in one area. Conflicted files get none: resolving a conflict by
 * discarding one side is a merge decision this view does not make for the user.
 */
export function actionsFor(area: WipArea): FileActionKind[] {
  switch (area) {
    case "unstaged":
      return ["discard"];
    case "staged":
      return ["unstage", "discard"];
    case "untracked":
      return ["delete"];
    case "conflicted":
      return [];
  }
}

/** The action a file button sends, from its kind, path, and area. */
export function fileAction(kind: FileActionKind, path: string, area: WipArea): ChangeAction {
  if (kind === "unstage") return { kind: "unstage", path };
  if (kind === "delete") return { kind: "delete", path };
  return { kind: "discard", path, area: area === "staged" ? "staged" : "unstaged" };
}

export interface ActionText {
  /** Short button label. */
  button: string;
  /** Confirmation title. */
  title: string;
  /** What exactly will happen and what is lost. */
  detail: string;
  /** Past-tense line for the Undo banner and the backup list. */
  done: string;
}

const BACKUP_NOTE = "A backup is kept, so you can undo this.";

export function describeAction(action: ChangeAction, fileCount = 0): ActionText {
  switch (action.kind) {
    case "discard": {
      const name = fileName(action.path);
      return action.area === "unstaged"
        ? {
            button: "Discard",
            title: `Discard your edits to ${name}?`,
            detail: `Your changes in ${action.path} that are not staged will be thrown away. The file goes back to its staged version, or to the last commit if nothing is staged. ${BACKUP_NOTE}`,
            done: `Discarded edits to ${name}`,
          }
        : {
            button: "Discard",
            title: `Discard all changes to ${name}?`,
            detail: `Every change in ${action.path}, staged and not staged, will be thrown away and the file goes back to the last commit. A new file is removed. ${BACKUP_NOTE}`,
            done: `Discarded all changes to ${name}`,
          };
    }
    case "unstage": {
      const name = fileName(action.path);
      return {
        button: "Unstage",
        title: `Unstage ${name}?`,
        detail: `${action.path} will no longer be staged for the next commit. Your edits stay in the file. ${BACKUP_NOTE}`,
        done: `Unstaged ${name}`,
      };
    }
    case "delete": {
      const name = fileName(action.path);
      return {
        button: "Delete",
        title: `Delete the new file ${name}?`,
        detail: `${action.path} is not tracked by git yet, so deleting it removes it from your folder. ${BACKUP_NOTE}`,
        done: `Deleted ${name}`,
      };
    }
    case "discard-all":
      return {
        button: "Discard all",
        title: "Discard every change in this repository?",
        detail: `All ${fileCount} changed ${fileCount === 1 ? "file goes" : "files go"} back to the last commit: staged and not-staged edits are thrown away and new files are deleted. Ignored files are not touched. ${BACKUP_NOTE}`,
        done: `Discarded all changes (${fileCount} ${fileCount === 1 ? "file" : "files"})`,
      };
  }
}
