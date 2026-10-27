import { useRpc } from "@getpaseo/plugin/client";
import { useQuery } from "@tanstack/react-query";
import { FOLDER_RESCAN_MS } from "../../shared/constants";
import { folderReposRpc } from "../../shared/contracts";

/**
 * The repositories in one tracked folder, rescanned while visible, on window focus, and on
 * demand, so newly cloned repositories appear and deleted ones disappear without reloading.
 */
export function useFolderRepos(folderId: string) {
  const listRepos = useRpc(folderReposRpc);
  return useQuery({
    queryKey: ["git-graph", "folder-repos", folderId],
    queryFn: () => listRepos({ folderId }),
    refetchInterval: FOLDER_RESCAN_MS,
    refetchOnWindowFocus: true,
    retry: false,
  });
}
