import { useRpc } from "@getpaseo/plugin/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { describeAction } from "../../shared/change-actions";
import {
  applyChangeRpc,
  type ChangeAction,
  type ChangePreview,
  listBackupsRpc,
  previewChangeRpc,
  type RepoTarget,
  restoreBackupRpc,
} from "../../shared/contracts";
import { targetKey } from "./useRepoQueries";

const QUERY_ROOT = "git-graph";
const TARGET_KEY_INDEX = 2;

export interface PendingChange {
  action: ChangeAction;
  fileCount: number;
  preview: ChangePreview | null;
  busy: boolean;
  error: string | null;
}

export interface DoneChange {
  text: string;
  backupId: string;
  undoing: boolean;
  error: string | null;
}

function message(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/** Refetches everything shown for one repository after it was changed. */
export function useRefreshRepository(target: RepoTarget): () => Promise<void> {
  const queryClient = useQueryClient();
  const key = targetKey(target);
  return useCallback(
    () =>
      queryClient.invalidateQueries({
        predicate: (query) => query.queryKey[0] === QUERY_ROOT && query.queryKey[TARGET_KEY_INDEX] === key,
      }),
    [queryClient, key],
  );
}

/**
 * Preview, confirm, apply, and undo for one repository. Nothing changes until the user confirms
 * a fresh preview; the server refuses if the files changed in between.
 */
export function useChangeFlow(target: RepoTarget) {
  const preview = useRpc(previewChangeRpc);
  const apply = useRpc(applyChangeRpc);
  const restore = useRpc(restoreBackupRpc);
  const refresh = useRefreshRepository(target);
  const [pending, setPending] = useState<PendingChange | null>(null);
  const [done, setDone] = useState<DoneChange | null>(null);

  const request = useCallback(
    (action: ChangeAction, fileCount = 1) => {
      setPending({ action, fileCount, preview: null, busy: true, error: null });
      preview({ target, action }).then(
        (result) => setPending((current) => (current?.action === action ? { ...current, preview: result, busy: false } : current)),
        (error: unknown) =>
          setPending((current) => (current?.action === action ? { ...current, busy: false, error: message(error, "Could not check the files") } : current)),
      );
    },
    [preview, target],
  );

  const cancel = useCallback(() => setPending(null), []);

  const confirm = useCallback(async () => {
    if (!pending?.preview?.allowed) return;
    const { action, fileCount } = pending;
    setPending({ ...pending, busy: true, error: null });
    try {
      const { backupId } = await apply({ target, action, fingerprint: pending.preview.fingerprint });
      setPending(null);
      setDone({ text: describeAction(action, fileCount).done, backupId, undoing: false, error: null });
    } catch (error) {
      setPending({ ...pending, busy: false, error: message(error, "The change failed") });
    } finally {
      await refresh();
    }
  }, [pending, apply, target, refresh]);

  const undo = useCallback(async () => {
    if (!done) return;
    setDone({ ...done, undoing: true, error: null });
    try {
      await restore({ target, backupId: done.backupId });
      setDone(null);
    } catch (error) {
      setDone({ ...done, undoing: false, error: message(error, "Undo failed") });
    } finally {
      await refresh();
    }
  }, [done, restore, target, refresh]);

  const dismiss = useCallback(() => setDone(null), []);

  return { pending, done, request, cancel, confirm, undo, dismiss };
}

export type ChangeFlow = ReturnType<typeof useChangeFlow>;

/** Recent backups for one repository, newest first. */
export function useBackups(target: RepoTarget) {
  const list = useRpc(listBackupsRpc);
  return useQuery({
    queryKey: [QUERY_ROOT, "backups", targetKey(target)],
    queryFn: () => list({ target }),
  });
}
