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
  previewChangeRpc,
  applyChangeRpc,
  listBackupsRpc,
  restoreBackupRpc,
  listBranchesRpc,
  previewSwitchRpc,
  switchBranchRpc,
  wipDiffRpc,
} from "../shared/contracts";
import { listBackups } from "./backup";
import { listBranches, previewSwitch, switchBranch } from "./branch";
import { applyChange, previewChange, restoreChange } from "./change";
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
    async previewChange(
      { target, action }: RpcInput<typeof previewChangeRpc>,
      paseo: WorkspaceLookup,
    ): Promise<RpcOutput<typeof previewChangeRpc>> {
      return previewChange(await resolve(target, paseo), action);
    },
    async applyChange(
      { target, action, fingerprint }: RpcInput<typeof applyChangeRpc>,
      paseo: WorkspaceLookup,
    ): Promise<RpcOutput<typeof applyChangeRpc>> {
      return { backupId: await applyChange(await resolve(target, paseo), action, fingerprint) };
    },
    async backups(
      { target }: RpcInput<typeof listBackupsRpc>,
      paseo: WorkspaceLookup,
    ): Promise<RpcOutput<typeof listBackupsRpc>> {
      return { backups: await listBackups(await resolve(target, paseo)) };
    },
    async restoreBackup(
      { target, backupId }: RpcInput<typeof restoreBackupRpc>,
      paseo: WorkspaceLookup,
    ): Promise<RpcOutput<typeof restoreBackupRpc>> {
      return { restoredPaths: await restoreChange(await resolve(target, paseo), backupId) };
    },
    async branches(
      { target }: RpcInput<typeof listBranchesRpc>,
      paseo: WorkspaceLookup,
    ): Promise<RpcOutput<typeof listBranchesRpc>> {
      return listBranches(await resolve(target, paseo));
    },
    async previewSwitch(
      { target, ref }: RpcInput<typeof previewSwitchRpc>,
      paseo: WorkspaceLookup,
    ): Promise<RpcOutput<typeof previewSwitchRpc>> {
      return previewSwitch(await resolve(target, paseo), ref);
    },
    async switchBranch(
      { target, ref, fingerprint }: RpcInput<typeof switchBranchRpc>,
      paseo: WorkspaceLookup,
    ): Promise<RpcOutput<typeof switchBranchRpc>> {
      return switchBranch(await resolve(target, paseo), ref, fingerprint);
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
