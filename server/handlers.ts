import type { RpcInput, RpcOutput } from "@getpaseo/plugin";
import type {
  commitRpc,
  diffRpc,
  folderReposRpc,
  identityRpc,
  workspaceReposRpc,
  logRpc,
  RepoTarget,
  revisionRpc,
  statusRpc,
  syncCommitsRpc,
  wipStatsRpc,
  wipDiffRpc,
} from "../shared/contracts";
import {
  listFolderRepos,
  listWorkspaceRepos,
  type ReadSettings,
  type RepoGuardDeps,
  resolveRepo,
} from "./repo-guard";
import {
  getCommit,
  getDiff,
  getIdentity,
  getLog,
  getRevision,
  getStatus,
  getSyncCommits,
  getWipStats,
  getWipDiff,
} from "./repo";

/** The slice of the Paseo SDK the guard needs; PaseoApi satisfies it structurally. */
export interface WorkspaceLookup {
  workspaces: {
    ref(workspaceId: string): {
      refresh(): Promise<{ workspaceDirectory?: string; projectKind: string } | null>;
    };
  };
}

export function createRepoHandlers(readSettings: ReadSettings) {
  const guardDeps = (paseo: WorkspaceLookup): RepoGuardDeps => ({
    readSettings,
    async getWorkspace(workspaceId) {
      const workspace = await paseo.workspaces.ref(workspaceId).refresh();
      if (!workspace) return null;
      return { directory: workspace.workspaceDirectory ?? null, projectKind: workspace.projectKind };
    },
  });
  const resolve = (target: RepoTarget, paseo: WorkspaceLookup): Promise<string> =>
    resolveRepo(target, guardDeps(paseo));

  return {
    folderRepos({ folderId }: RpcInput<typeof folderReposRpc>): Promise<RpcOutput<typeof folderReposRpc>> {
      return listFolderRepos(folderId, readSettings);
    },
    workspaceRepos(
      { workspaceId }: RpcInput<typeof workspaceReposRpc>,
      paseo: WorkspaceLookup,
    ): Promise<RpcOutput<typeof workspaceReposRpc>> {
      return listWorkspaceRepos(workspaceId, guardDeps(paseo));
    },
    async wipStats(
      { target }: RpcInput<typeof wipStatsRpc>,
      paseo: WorkspaceLookup,
    ): Promise<RpcOutput<typeof wipStatsRpc>> {
      return getWipStats(await resolve(target, paseo));
    },
    async syncCommits(
      { target }: RpcInput<typeof syncCommitsRpc>,
      paseo: WorkspaceLookup,
    ): Promise<RpcOutput<typeof syncCommitsRpc>> {
      return getSyncCommits(await resolve(target, paseo));
    },
    async identity(
      { target }: RpcInput<typeof identityRpc>,
      paseo: WorkspaceLookup,
    ): Promise<RpcOutput<typeof identityRpc>> {
      return getIdentity(await resolve(target, paseo));
    },
    async status(
      { target }: RpcInput<typeof statusRpc>,
      paseo: WorkspaceLookup,
    ): Promise<RpcOutput<typeof statusRpc>> {
      return getStatus(await resolve(target, paseo));
    },
    async log(
      { target, limit, scope }: RpcInput<typeof logRpc>,
      paseo: WorkspaceLookup,
    ): Promise<RpcOutput<typeof logRpc>> {
      return getLog(await resolve(target, paseo), limit, scope);
    },
    async commit(
      { target, hash }: RpcInput<typeof commitRpc>,
      paseo: WorkspaceLookup,
    ): Promise<RpcOutput<typeof commitRpc>> {
      return getCommit(await resolve(target, paseo), hash);
    },
    async diff(
      { target, hash, path, oldPath }: RpcInput<typeof diffRpc>,
      paseo: WorkspaceLookup,
    ): Promise<RpcOutput<typeof diffRpc>> {
      return getDiff(await resolve(target, paseo), hash, path, oldPath);
    },
    async wipDiff(
      { target, path, area }: RpcInput<typeof wipDiffRpc>,
      paseo: WorkspaceLookup,
    ): Promise<RpcOutput<typeof wipDiffRpc>> {
      return getWipDiff(await resolve(target, paseo), path, area);
    },
    async revision(
      { target }: RpcInput<typeof revisionRpc>,
      paseo: WorkspaceLookup,
    ): Promise<RpcOutput<typeof revisionRpc>> {
      return getRevision(await resolve(target, paseo));
    },
  };
}
