import { useRpc } from "@getpaseo/plugin/client";
import { useQueries } from "@tanstack/react-query";
import { FOLDER_RESCAN_MS } from "../../shared/constants";
import { type Folder, type FolderRepo, folderReposRpc } from "../../shared/contracts";

export interface FolderScan {
  folder: Folder;
  repos: readonly FolderRepo[];
  truncated: boolean;
  /** True once a scan succeeded; a missing repository only counts as removed after that. */
  scanned: boolean;
  scanning: boolean;
  error: string | null;
  rescan(): void;
}

const NO_REPOS: readonly FolderRepo[] = [];

/**
 * The repositories in every tracked folder, rescanned while visible, on window focus, and on
 * demand, so newly cloned repositories appear and deleted ones disappear without reloading.
 */
export function useFolderScans(folders: readonly Folder[]): FolderScan[] {
  const listRepos = useRpc(folderReposRpc);
  const results = useQueries({
    queries: folders.map((folder) => ({
      queryKey: ["git-graph", "folder-repos", folder.id, folder.path],
      queryFn: () => listRepos({ folderId: folder.id }),
      refetchInterval: FOLDER_RESCAN_MS,
      refetchOnWindowFocus: true,
      retry: false,
    })),
  });
  return folders.map((folder, index) => {
    const result = results[index];
    return {
      folder,
      repos: result?.data?.repos ?? NO_REPOS,
      truncated: result?.data?.truncated ?? false,
      scanned: result?.isSuccess ?? false,
      scanning: result?.isFetching ?? false,
      error: result?.error ? result.error.message : null,
      rescan: () => void result?.refetch(),
    };
  });
}
