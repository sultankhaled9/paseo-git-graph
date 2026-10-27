import { defineRpc, defineSettings } from "@getpaseo/plugin";
import { z } from "zod";
import {
  HASH_PATTERN,
  LOG_MAX_LIMIT,
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

export const projectsSettings = defineSettings({
  id: PROJECTS_SETTINGS_ID,
  scope: "host",
  version: 1,
  schema: z.object({
    projects: z.array(projectSchema).max(MAX_PROJECTS).default([]),
  }),
});

export const repoTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("project"), projectId: z.string().min(1) }),
  z.object({ kind: z.literal("workspace"), workspaceId: z.string().min(1) }),
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

export const fileChangeSchema = z.object({
  path: z.string(),
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

const validatePathOutputSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), path: z.string(), suggestedName: z.string() }),
  z.object({ ok: z.literal(false), reason: z.string() }),
]);
export type ValidatePathOutput = z.infer<typeof validatePathOutputSchema>;

export const validatePathRpc = defineRpc({
  name: "repo.validate-path",
  input: z.object({ path: z.string().min(1) }),
  output: validatePathOutputSchema,
});

export const statusRpc = defineRpc({
  name: "repo.status",
  input: z.object({ target: repoTargetSchema }),
  output: repoStatusSchema,
});

export const logRpc = defineRpc({
  name: "repo.log",
  input: z.object({ target: repoTargetSchema, limit: z.number().int().min(1).max(LOG_MAX_LIMIT) }),
  output: z.object({ commits: z.array(commitSummarySchema), hasMore: z.boolean() }),
});

export const commitRpc = defineRpc({
  name: "repo.commit",
  input: z.object({ target: repoTargetSchema, hash: hashSchema }),
  output: commitDetailSchema,
});

export const diffRpc = defineRpc({
  name: "repo.diff",
  input: z.object({
    target: repoTargetSchema,
    hash: hashSchema,
    path: z
      .string()
      .min(1)
      .refine((value) => !value.startsWith("/") && !value.includes("\0"), {
        message: "Path must be repository-relative",
      }),
  }),
  output: z.object({ text: z.string(), truncated: z.boolean() }),
});

export const revisionRpc = defineRpc({
  name: "repo.revision",
  input: z.object({ target: repoTargetSchema }),
  output: z.object({ refsToken: z.string(), worktreeToken: z.string() }),
});
