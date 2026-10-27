import type { RpcInput, RpcOutput } from "@getpaseo/plugin";
import type {
  commitRpc,
  diffRpc,
  logRpc,
  Project,
  RepoTarget,
  revisionRpc,
  statusRpc,
  wipDiffRpc,
} from "../shared/contracts";
import { type RepoGuardDeps, resolveRepo } from "./repo-guard";
import { getCommit, getDiff, getLog, getRevision, getStatus, getWipDiff } from "./repo";

/** The slice of the Paseo SDK the guard needs; PaseoApi satisfies it structurally. */
export interface WorkspaceLookup {
  workspaces: {
    ref(workspaceId: string): {
      refresh(): Promise<{ workspaceDirectory?: string; projectKind: string } | null>;
    };
  };
}

export type ReadProjects = () => Promise<readonly Project[]>;

export function createRepoHandlers(readProjects: ReadProjects) {
  const resolve = (target: RepoTarget, paseo: WorkspaceLookup): Promise<string> => {
    const deps: RepoGuardDeps = {
      readProjects,
      async getWorkspace(workspaceId) {
        const workspace = await paseo.workspaces.ref(workspaceId).refresh();
        if (!workspace) return null;
        return { directory: workspace.workspaceDirectory ?? null, projectKind: workspace.projectKind };
      },
    };
    return resolveRepo(target, deps);
  };

  return {
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
