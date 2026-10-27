import { useRpc } from "@getpaseo/plugin/client";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { LOG_MAX_LIMIT, LOG_PAGE_SIZE, REVISION_POLL_MS } from "../../shared/constants";
import {
  commitRpc,
  type CommitSummary,
  diffRpc,
  type FileChange,
  logRpc,
  type RepoTarget,
  revisionRpc,
  statusRpc,
} from "../../shared/contracts";
import { layoutGraph } from "../../shared/graph-layout";

const NO_COMMITS: readonly CommitSummary[] = [];

export function targetKey(target: RepoTarget): string {
  return target.kind === "project" ? `project:${target.projectId}` : `workspace:${target.workspaceId}`;
}

/**
 * Polls cheap revision tokens and folds them into the log and status query keys, so a new
 * commit, ref move, or worktree edit refetches exactly the data it affects.
 */
export function useRepoGraph(target: RepoTarget) {
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
    queryKey: ["git-graph", "log", key, limit, tokens?.refsToken],
    queryFn: () => fetchLog({ target, limit }),
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
  const graph = useMemo(() => layoutGraph(commits), [commits]);
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
    graph,
    status: status.data,
    error: revision.error ?? log.error ?? status.error,
    loading: revision.isPending || log.isPending,
    loadingMore: log.isFetching && (log.data?.hasMore ?? false) && commits.length < limit,
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
