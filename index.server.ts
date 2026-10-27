import type { PluginServerContext } from "@getpaseo/plugin/server";
import { createRepoHandlers } from "./server/handlers";
import { validateRepoPath } from "./server/repo-guard";
import {
  commitRpc,
  diffRpc,
  logRpc,
  projectsSettings,
  revisionRpc,
  statusRpc,
  validatePathRpc,
} from "./shared/contracts";

export default function contribute(server: PluginServerContext) {
  const settings = server.registerSettings(projectsSettings);
  const repo = createRepoHandlers(async () => {
    const state = await settings.read();
    if (state.status !== "ready") throw new Error(`Saved projects are invalid: ${state.error}`);
    return state.values.projects;
  });

  server.handle(validatePathRpc, ({ path }) => validateRepoPath(path));
  server.handle(statusRpc, (input, { paseo }) => repo.status(input, paseo));
  server.handle(logRpc, (input, { paseo }) => repo.log(input, paseo));
  server.handle(commitRpc, (input, { paseo }) => repo.commit(input, paseo));
  server.handle(diffRpc, (input, { paseo }) => repo.diff(input, paseo));
  server.handle(revisionRpc, (input, { paseo }) => repo.revision(input, paseo));
  return () => {};
}
