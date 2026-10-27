import { useRpc } from "@getpaseo/plugin/client";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { LOG_MAX_LIMIT, LOG_PAGE_SIZE, REVISION_POLL_MS } from "../../shared/constants";
import {
  commitRpc,
  type CommitSummary,
  diffRpc,
  type FileChange,
  type LogScope,
  logRpc,
  type RepoTarget,
  revisionRpc,
  statusRpc,
  type WipArea,
  wipDiffRpc,
} from "../../shared/contracts";

const NO_COMMITS: readonly CommitSummary[] = [];

export function targetKey(target: RepoTarget): string {
  return target.kind === "project" ? `project:${target.projectId}` : `workspace:${target.workspaceId}`;
}

/**
 * Polls cheap revision tokens and folds them into the log and status query keys, so a new
 * commit, ref move, or worktree edit refetches exactly the data it affects.
 */
export function useRepoGraph(target: RepoTarget, scope: LogScope) {
  const fetchRevision = useRpc(revisionRpc);
  const fetchLog = useRpc(logRpc);
  const fetchStatus = useRpc(statusRpc);
  const key = targetKey(target);
  const [limit, setLimit] = useState(LOG_PAGE_SIZE);

  const revision = useQuery({
    queryKey: ["git-graph", "revision", key],
    queryFn: () => fetchRevision({ target }),
    refetchInterval: REVISION_POLL_MS,
  });
  const tokens = revision.data;

  const log = useQuery({
    queryKey: ["git-graph", "log", key, scope, limit, tokens?.refsToken],
    queryFn: () => fetchLog({ target, limit, scope }),
    enabled: tokens !== undefined,
    placeholderData: keepPreviousData,
  });

  const status = useQuery({
    queryKey: ["git-graph", "status", key, tokens?.refsToken, tokens?.worktreeToken],
    queryFn: () => fetchStatus({ target }),
    enabled: tokens !== undefined,
    placeholderData: keepPreviousData,
  });

  const commits = log.data?.commits ?? NO_COMMITS;
  const canLoadMore = (log.data?.hasMore ?? false) && limit < LOG_MAX_LIMIT;
  const loadMore = useCallback(() => {
    setLimit((current) => Math.min(current + LOG_PAGE_SIZE, LOG_MAX_LIMIT));
  }, []);
  const { refetch: refetchRevision } = revision;
  const { refetch: refetchLog } = log;
  const { refetch: refetchStatus } = status;
  const retry = useCallback(() => {
    void refetchRevision();
    void refetchLog();
    void refetchStatus();
  }, [refetchRevision, refetchLog, refetchStatus]);

  return {
    commits,
    status: status.data,
    worktreeToken: tokens?.worktreeToken,
    error: revision.error ?? log.error ?? status.error,
    loading: revision.isPending || log.isPending,
    loadingMore: log.isFetching && (log.data?.hasMore ?? false) && commits.length < limit,
    /** The list on screen belongs to a previous key (another scope or page size) while new data loads. */
    updating: log.isFetching && log.isPlaceholderData,
    canLoadMore,
    limitReached: (log.data?.hasMore ?? false) && limit >= LOG_MAX_LIMIT,
    loadMore,
    retry,
  };
}

/** Commits are immutable, so detail and diffs never go stale for a given hash. */
export function useCommitDetail(target: RepoTarget, hash: string) {
  const fetchCommit = useRpc(commitRpc);
  return useQuery({
    queryKey: ["git-graph", "commit", targetKey(target), hash],
    queryFn: () => fetchCommit({ target, hash }),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useFileDiff(target: RepoTarget, hash: string, file: FileChange | null) {
  const fetchDiff = useRpc(diffRpc);
  return useQuery({
    queryKey: ["git-graph", "diff", targetKey(target), hash, file?.path, file?.oldPath],
    queryFn: () =>
      fetchDiff({ target, hash, path: file?.path ?? "", oldPath: file?.oldPath }),
    enabled: file !== null,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export interface WipSelection {
  path: string;
  area: WipArea;
}

const WIP_DIFF_PATH_KEY = 3;
const WIP_DIFF_AREA_KEY = 4;

/**
 * Keyed by the worktree token so an edited file's diff refreshes with the next poll. The
 * previous diff stays on screen only while the same file refetches, never for another file.
 */
export function useWipDiff(target: RepoTarget, selection: WipSelection | null, worktreeToken: string | undefined) {
  const fetchWipDiff = useRpc(wipDiffRpc);
  return useQuery({
    queryKey: ["git-graph", "wip-diff", targetKey(target), selection?.path, selection?.area, worktreeToken],
    queryFn: () => fetchWipDiff({ target, path: selection?.path ?? "", area: selection?.area ?? "unstaged" }),
    enabled: selection !== null,
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[WIP_DIFF_PATH_KEY] === selection?.path &&
      previousQuery?.queryKey[WIP_DIFF_AREA_KEY] === selection?.area
        ? previous
        : undefined,
    retry: false,
  });
}
