import { useRpc } from "@getpaseo/plugin/client";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { listBranchesRpc, previewSwitchRpc, type RepoTarget, type SwitchPreview, switchBranchRpc } from "../../shared/contracts";
import { rpcErrorMessage } from "../../shared/rpc-error";
import { QUERY_ROOT, useRefreshRepository } from "./useChangeFlow";
import { targetKey } from "./useRepoQueries";

export interface PendingSwitch {
  ref: string;
  preview: SwitchPreview | null;
  busy: boolean;
  error: string | null;
}

export interface DoneSwitch {
  branch: string;
  /** The local branch that was checked out before, offered as Switch back. */
  previous: string | null;
}

/**
 * Picker, preview, confirm, and Switch back for one repository. The branch list is fetched only while
 * the picker is open, and nothing switches until the user confirms a fresh preview.
 */
export function useBranchSwitch(target: RepoTarget) {
  const list = useRpc(listBranchesRpc);
  const preview = useRpc(previewSwitchRpc);
  const switchTo = useRpc(switchBranchRpc);
  const refresh = useRefreshRepository(target);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<PendingSwitch | null>(null);
  const [done, setDone] = useState<DoneSwitch | null>(null);
  const branches = useQuery({
    queryKey: [QUERY_ROOT, "branches", targetKey(target)],
    queryFn: () => list({ target }),
    enabled: open,
    gcTime: 0,
  });

  const choose = useCallback(
    (ref: string) => {
      setOpen(true);
      setPending({ ref, preview: null, busy: true, error: null });
      preview({ target, ref }).then(
        (result) => setPending((current) => (current?.ref === ref ? { ...current, preview: result, busy: false } : current)),
        (error: unknown) =>
          setPending((current) => (current?.ref === ref ? { ...current, busy: false, error: rpcErrorMessage(error, "Could not check the branch") } : current)),
      );
    },
    [preview, target],
  );

  const openPicker = useCallback(() => setOpen(true), []);
  const backToList = useCallback(() => setPending(null), []);
  const close = useCallback(() => {
    setOpen(false);
    setPending(null);
  }, []);

  const confirm = useCallback(async () => {
    if (!pending?.preview?.allowed) return;
    const { ref } = pending;
    setPending({ ...pending, busy: true, error: null });
    try {
      const result = await switchTo({ target, ref, fingerprint: pending.preview.fingerprint });
      setOpen(false);
      setPending(null);
      setDone(result);
    } catch (error) {
      setPending({ ...pending, busy: false, error: rpcErrorMessage(error, "The switch failed") });
    } finally {
      await refresh();
    }
  }, [pending, switchTo, target, refresh]);

  /** Switching back goes through the same preview and confirmation; it is a switch, not an undo. */
  const switchBack = useCallback(() => {
    if (!done?.previous) return;
    const previous = done.previous;
    setDone(null);
    choose(previous);
  }, [done, choose]);

  const dismiss = useCallback(() => setDone(null), []);

  return { open, branches, pending, done, openPicker, choose, backToList, close, confirm, switchBack, dismiss };
}

export type BranchSwitch = ReturnType<typeof useBranchSwitch>;
