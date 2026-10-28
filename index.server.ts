import type { PluginServerContext } from "@getpaseo/plugin/server";
import { createRepoHandlers } from "./server/handlers";
import { inspectPath } from "./server/repo-guard";
import {
  commitRpc,
  diffRpc,
  folderReposRpc,
  identityRpc,
  inspectPathRpc,
  logRpc,
  projectsSettings,
  revisionRpc,
  statusRpc,
  syncCommitsRpc,
  wipStatsRpc,
  wipDiffRpc,
  workspaceReposRpc,
} from "./shared/contracts";

export default function contribute(server: PluginServerContext) {
  const settings = server.registerSettings(projectsSettings);
  const repo = createRepoHandlers(async () => {
    const state = await settings.read();
    if (state.status !== "ready") throw new Error(`Saved projects are invalid: ${state.error}`);
    return state.values;
  });

  server.handle(inspectPathRpc, ({ path }) => inspectPath(path));
  server.handle(folderReposRpc, (input) => repo.folderRepos(input));
  server.handle(workspaceReposRpc, (input, { paseo }) => repo.workspaceRepos(input, paseo));
  server.handle(statusRpc, (input, { paseo }) => repo.status(input, paseo));
  server.handle(identityRpc, (input, { paseo }) => repo.identity(input, paseo));
  server.handle(syncCommitsRpc, (input, { paseo }) => repo.syncCommits(input, paseo));
  server.handle(wipStatsRpc, (input, { paseo }) => repo.wipStats(input, paseo));
  server.handle(logRpc, (input, { paseo }) => repo.log(input, paseo));
  server.handle(commitRpc, (input, { paseo }) => repo.commit(input, paseo));
  server.handle(diffRpc, (input, { paseo }) => repo.diff(input, paseo));
  server.handle(wipDiffRpc, (input, { paseo }) => repo.wipDiff(input, paseo));
  server.handle(revisionRpc, (input, { paseo }) => repo.revision(input, paseo));
  return () => {};
}
