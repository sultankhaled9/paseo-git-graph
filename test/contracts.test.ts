import { describe, expect, it } from "vitest";
import { LOG_MAX_LIMIT } from "../shared/constants";
import {
  commitRpc,
  folderRelativePathSchema,
  folderReposRpc,
  inspectPathRpc,
  diffRpc,
  logRpc,
  projectsSettings,
  revisionRpc,
  statusRpc,
  validatePathRpc,
} from "../shared/contracts";

const target = { kind: "project", projectId: "p1" } as const;
const hash = "0123456789abcdef0123456789abcdef01234567";

describe("contracts", () => {
  it("parses an unsaved settings document to empty lists", () => {
    expect(projectsSettings.schema.parse({})).toEqual({ projects: [], folders: [] });
  });

  it("keeps projects saved before folders existed", () => {
    const stored = { projects: [{ id: "a", name: "transcriber-api", path: "/mnt/c/repo" }] };
    expect(projectsSettings.schema.parse(stored)).toEqual({ ...stored, folders: [] });
  });

  it("validates folder-relative repository paths", () => {
    const valid = ["api", "client-x/api", "my repo"];
    const invalid = ["", "/abs", "..", "a/../b", "./a", "a//b", "a/b/c", "a\\b", "a\0b"];
    for (const path of valid) expect(folderRelativePathSchema.safeParse(path).success).toBe(true);
    for (const path of invalid) expect(folderRelativePathSchema.safeParse(path).success).toBe(false);
  });

  it("requires a folder id to list repositories", () => {
    expect(folderReposRpc.input.safeParse({ folderId: "f1" }).success).toBe(true);
    expect(folderReposRpc.input.safeParse({ folderId: "" }).success).toBe(false);
    expect(inspectPathRpc.input.safeParse({ path: "" }).success).toBe(false);
  });

  it("rejects relative project paths", () => {
    const result = projectsSettings.schema.safeParse({
      projects: [{ id: "a", name: "A", path: "relative/repo" }],
    });
    expect(result.success).toBe(false);
  });

  it("accepts both target kinds and rejects unknown kinds", () => {
    expect(statusRpc.input.safeParse({ target }).success).toBe(true);
    expect(
      revisionRpc.input.safeParse({ target: { kind: "workspace", workspaceId: "w1" } }).success,
    ).toBe(true);
    expect(statusRpc.input.safeParse({ target: { kind: "path", path: "/tmp" } }).success).toBe(
      false,
    );
  });

  it("bounds the log limit", () => {
    expect(logRpc.input.safeParse({ target, limit: 1, scope: "all" }).success).toBe(true);
    expect(logRpc.input.safeParse({ target, limit: 0, scope: "all" }).success).toBe(false);
    expect(logRpc.input.safeParse({ target, limit: LOG_MAX_LIMIT + 1, scope: "all" }).success).toBe(false);
  });

  it("requires a known log scope", () => {
    expect(logRpc.input.safeParse({ target, limit: 1, scope: "head" }).success).toBe(true);
    expect(logRpc.input.safeParse({ target, limit: 1, scope: "remote" }).success).toBe(false);
    expect(logRpc.input.safeParse({ target, limit: 1 }).success).toBe(false);
  });

  it("validates commit hashes", () => {
    expect(commitRpc.input.safeParse({ target, hash }).success).toBe(true);
    expect(commitRpc.input.safeParse({ target, hash: "abc" }).success).toBe(false);
    expect(commitRpc.input.safeParse({ target, hash: "--output=/tmp/x" }).success).toBe(false);
    expect(commitRpc.input.safeParse({ target, hash: hash.toUpperCase() }).success).toBe(false);
  });

  it("requires repository-relative diff paths", () => {
    expect(diffRpc.input.safeParse({ target, hash, path: "src/a.ts" }).success).toBe(true);
    expect(diffRpc.input.safeParse({ target, hash, path: "/etc/passwd" }).success).toBe(false);
    expect(diffRpc.input.safeParse({ target, hash, path: "a\0b" }).success).toBe(false);
    expect(diffRpc.input.safeParse({ target, hash, path: "b", oldPath: "/a" }).success).toBe(false);
  });

  it("requires a non-empty path to validate", () => {
    expect(validatePathRpc.input.safeParse({ path: "" }).success).toBe(false);
  });
});
