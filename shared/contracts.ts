import { defineRpc, defineSettings } from "@getpaseo/plugin";
import { z } from "zod";
import {
  HASH_PATTERN,
  LOG_MAX_LIMIT,
  FOLDER_SCAN_DEPTH,
  MAX_FOLDERS,
  MAX_PROJECTS,
  PROJECT_NAME_MAX_LENGTH,
  PROJECTS_SETTINGS_ID,
} from "./constants";

export const projectSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(PROJECT_NAME_MAX_LENGTH),
  path: z.string().startsWith("/"),
});
export type Project = z.infer<typeof projectSchema>;

/** A parent folder whose repositories are discovered by scanning and kept in sync. */
export const folderSchema = projectSchema;
export type Folder = z.infer<typeof folderSchema>;

// Still version 1: the host parses stored values through this schema, so documents saved before
// `folders` existed gain an empty list. A version bump would require a migrate function.
export const projectsSettings = defineSettings({
  id: PROJECTS_SETTINGS_ID,
  scope: "host",
  version: 1,
  schema: z.object({
    projects: z.array(projectSchema).max(MAX_PROJECTS).default([]),
    folders: z.array(folderSchema).max(MAX_FOLDERS).default([]),
  }),
});
export type ProjectsDocument = z.infer<typeof projectsSettings.schema>;

/** A repository path relative to its folder: plain segments, no ".." or ".", at most the scan depth. */
export const folderRelativePathSchema = z
  .string()
  .min(1)
  .refine(
    (value) => {
      if (value.startsWith("/") || value.includes("\0") || value.includes("\\")) return false;
      const segments = value.split("/");
      return (
        segments.length <= FOLDER_SCAN_DEPTH &&
        segments.every((segment) => segment.length > 0 && segment !== "." && segment !== "..")
      );
    },
    { message: "Not a repository path inside the folder" },
  );

export const repoTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("project"), projectId: z.string().min(1) }),
  z.object({ kind: z.literal("workspace"), workspaceId: z.string().min(1) }),
  z.object({
    kind: z.literal("folder-repo"),
    folderId: z.string().min(1),
    relativePath: folderRelativePathSchema,
  }),
]);
export type RepoTarget = z.infer<typeof repoTargetSchema>;

const hashSchema = z.string().regex(HASH_PATTERN);

export const refSchema = z.object({
  name: z.string(),
  kind: z.enum(["branch", "remote", "tag", "head", "other"]),
  isCurrent: z.boolean(),
});
export type Ref = z.infer<typeof refSchema>;

export const commitSummarySchema = z.object({
  hash: z.string(),
  parents: z.array(z.string()),
  authorName: z.string(),
  authorEmail: z.string(),
  authorDate: z.string(),
  subject: z.string(),
  refs: z.array(refSchema),
});
export type CommitSummary = z.infer<typeof commitSummarySchema>;

export const statusFileSchema = z.object({
  path: z.string(),
  origPath: z.string().optional(),
  index: z.string().length(1),
  worktree: z.string().length(1),
  kind: z.enum(["changed", "renamed", "unmerged", "untracked"]),
});
export type StatusFile = z.infer<typeof statusFileSchema>;

export const identitySchema = z.object({
  name: z.string().nullable(),
  email: z.string().nullable(),
});
export type Identity = z.infer<typeof identitySchema>;

export const repoStatusSchema = z.object({
  root: z.string(),
  branch: z.string().nullable(),
  headOid: z.string().nullable(),
  detached: z.boolean(),
  upstream: z.string().nullable(),
  ahead: z.number().int().nonnegative(),
  behind: z.number().int().nonnegative(),
  staged: z.number().int().nonnegative(),
  unstaged: z.number().int().nonnegative(),
  untracked: z.number().int().nonnegative(),
  conflicted: z.number().int().nonnegative(),
  files: z.array(statusFileSchema),
  filesTruncated: z.boolean(),
});
export type RepoStatus = z.infer<typeof repoStatusSchema>;

export const changeTypeSchema = z.enum([
  "added",
  "modified",
  "deleted",
  "renamed",
  "copied",
  "type-changed",
]);
export type ChangeType = z.infer<typeof changeTypeSchema>;

export const fileChangeSchema = z.object({
  path: z.string(),
  change: changeTypeSchema,
  oldPath: z.string().optional(),
  additions: z.number().int().nonnegative().nullable(),
  deletions: z.number().int().nonnegative().nullable(),
});
export type FileChange = z.infer<typeof fileChangeSchema>;

export const commitDetailSchema = z.object({
  hash: z.string(),
  parents: z.array(z.string()),
  authorName: z.string(),
  authorEmail: z.string(),
  authorDate: z.string(),
  committerName: z.string(),
  committerEmail: z.string(),
  committerDate: z.string(),
  message: z.string(),
  files: z.array(fileChangeSchema),
});
export type CommitDetail = z.infer<typeof commitDetailSchema>;

export const folderRepoSchema = z.object({ relativePath: folderRelativePathSchema, name: z.string() });
export type FolderRepo = z.infer<typeof folderRepoSchema>;

const repoListSchema = z.object({ repos: z.array(folderRepoSchema), truncated: z.boolean() });

export const folderReposRpc = defineRpc({
  name: "folder.list-repos",
  input: z.object({ folderId: z.string().min(1) }),
  output: repoListSchema,
});

/** Repositories inside a workspace whose directory is a plain folder rather than a repository. */
export const workspaceReposRpc = defineRpc({
  name: "workspace.list-repos",
  input: z.object({ workspaceId: z.string().min(1) }),
  output: repoListSchema,
});

const inspectPathOutputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("repo"), path: z.string(), suggestedName: z.string() }),
  z.object({
    kind: z.literal("folder"),
    path: z.string(),
    suggestedName: z.string(),
    repoCount: z.number().int().nonnegative(),
    truncated: z.boolean(),
  }),
  z.object({ kind: z.literal("invalid"), reason: z.string() }),
]);
export type InspectPathOutput = z.infer<typeof inspectPathOutputSchema>;

/** Classifies a path for the add form: a repository, a folder of repositories, or neither. */
export const inspectPathRpc = defineRpc({
  name: "repo.inspect-path",
  input: z.object({ path: z.string().min(1) }),
  output: inspectPathOutputSchema,
});

const validatePathOutputSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), path: z.string(), suggestedName: z.string() }),
  z.object({ ok: z.literal(false), reason: z.string() }),
]);
export type ValidatePathOutput = z.infer<typeof validatePathOutputSchema>;

export const statusRpc = defineRpc({
  name: "repo.status",
  input: z.object({ target: repoTargetSchema }),
  output: repoStatusSchema,
});

export const logScopeSchema = z.enum(["all", "head"]);
export type LogScope = z.infer<typeof logScopeSchema>;

export const logRpc = defineRpc({
  name: "repo.log",
  input: z.object({
    target: repoTargetSchema,
    limit: z.number().int().min(1).max(LOG_MAX_LIMIT),
    scope: logScopeSchema,
  }),
  output: z.object({ commits: z.array(commitSummarySchema), hasMore: z.boolean() }),
});

export const commitRpc = defineRpc({
  name: "repo.commit",
  input: z.object({ target: repoTargetSchema, hash: hashSchema }),
  output: commitDetailSchema,
});

const repoPathSchema = z
  .string()
  .min(1)
  .refine((value) => !value.startsWith("/") && !value.includes("\0"), {
    message: "Path must be repository-relative",
  });

export const diffRpc = defineRpc({
  name: "repo.diff",
  input: z.object({
    target: repoTargetSchema,
    hash: hashSchema,
    path: repoPathSchema,
    oldPath: repoPathSchema.optional(),
  }),
  output: z.object({ text: z.string(), truncated: z.boolean() }),
});

export const wipAreaSchema = z.enum(["staged", "unstaged", "untracked", "conflicted"]);
export type WipArea = z.infer<typeof wipAreaSchema>;

export const wipDiffRpc = defineRpc({
  name: "repo.wip-diff",
  input: z.object({ target: repoTargetSchema, path: repoPathSchema, area: wipAreaSchema }),
  output: z.object({ text: z.string(), truncated: z.boolean() }),
});

/** The repository's configured git identity, kept apart from status because status is slow on large trees. */
export const identityRpc = defineRpc({
  name: "repo.identity",
  input: z.object({ target: repoTargetSchema }),
  output: identitySchema,
});

export const revisionRpc = defineRpc({
  name: "repo.revision",
  input: z.object({ target: repoTargetSchema }),
  output: z.object({ refsToken: z.string(), worktreeToken: z.string() }),
});
