import { describe, expect, it } from "vitest";
import { actionsFor, describeAction, fileAction } from "../shared/change-actions";
import { applyChangeRpc, changeActionSchema, restoreBackupRpc } from "../shared/contracts";

describe("actionsFor", () => {
  it("offers area-appropriate actions and none for conflicts", () => {
    expect(actionsFor("unstaged")).toEqual(["discard"]);
    expect(actionsFor("staged")).toEqual(["unstage", "discard"]);
    expect(actionsFor("untracked")).toEqual(["delete"]);
    expect(actionsFor("conflicted")).toEqual([]);
  });
});

describe("fileAction", () => {
  it("builds the action a button sends", () => {
    expect(fileAction("discard", "a.ts", "staged")).toEqual({ kind: "discard", path: "a.ts", area: "staged" });
    expect(fileAction("discard", "a.ts", "unstaged")).toEqual({ kind: "discard", path: "a.ts", area: "unstaged" });
    expect(fileAction("unstage", "a.ts", "staged")).toEqual({ kind: "unstage", path: "a.ts" });
    expect(fileAction("delete", "n.ts", "untracked")).toEqual({ kind: "delete", path: "n.ts" });
  });
});

describe("describeAction", () => {
  it("says what is lost and that a backup is kept", () => {
    const discard = describeAction({ kind: "discard", path: "src/a.ts", area: "unstaged" });
    expect(discard.title).toBe("Discard your edits to a.ts?");
    expect(discard.detail).toContain("backup is kept");
    expect(describeAction({ kind: "unstage", path: "src/a.ts" }).detail).toContain("edits stay in the file");
    expect(describeAction({ kind: "delete", path: "n.ts" }).done).toBe("Deleted n.ts");
  });

  it("states the file count and that ignored files survive discard-all", () => {
    const all = describeAction({ kind: "discard-all" }, 3);
    expect(all.detail).toContain("All 3 changed files go back");
    expect(all.detail).toContain("Ignored files are not touched");
    expect(describeAction({ kind: "discard-all" }, 1).done).toBe("Discarded all changes (1 file)");
  });
});

describe("contracts", () => {
  it("validates actions, fingerprints, and backup ids", () => {
    const target = { kind: "project", projectId: "p" } as const;
    expect(changeActionSchema.safeParse({ kind: "discard", path: "/etc/passwd", area: "unstaged" }).success).toBe(false);
    expect(changeActionSchema.safeParse({ kind: "discard", path: "a", area: "untracked" }).success).toBe(false);
    expect(applyChangeRpc.input.safeParse({ target, action: { kind: "discard-all" }, fingerprint: "" }).success).toBe(false);
    expect(restoreBackupRpc.input.safeParse({ target, backupId: "1761700000000-0a1b2c3d" }).success).toBe(true);
    expect(restoreBackupRpc.input.safeParse({ target, backupId: "../../HEAD" }).success).toBe(false);
  });
});
