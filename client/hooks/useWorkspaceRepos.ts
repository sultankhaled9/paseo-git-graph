import { useRpc } from "@getpaseo/plugin/client";
import { useQuery } from "@tanstack/react-query";
import { FOLDER_RESCAN_MS } from "../../shared/constants";
import { workspaceReposRpc } from "../../shared/contracts";

/** Repositories inside a plain-folder workspace, rescanned like tracked folders. */
export function useWorkspaceRepos(workspaceId: string) {
  const listRepos = useRpc(workspaceReposRpc);
  return useQuery({
    queryKey: ["git-graph", "workspace-repos", workspaceId],
    queryFn: () => listRepos({ workspaceId }),
    refetchInterval: FOLDER_RESCAN_MS,
    refetchOnWindowFocus: true,
    retry: false,
  });
}
