import type { PluginWorkspacePanelProps } from "@getpaseo/plugin/client";
import { ChangesView } from "./components/ChangesView";
import { WorkspaceTargetView } from "./components/WorkspaceTargetView";
import { targetKey } from "./hooks/useRepoQueries";

/** My Changes for the workspace's repository, or for the repositories inside a plain-folder workspace. */
export function MyChangesPanel({ theme, layout, workspaceId }: PluginWorkspacePanelProps) {
  return (
    <WorkspaceTargetView
      workspaceId={workspaceId}
      theme={theme}
      render={(target) => <ChangesView key={targetKey(target)} target={target} theme={theme} compact={layout.compact} />}
    />
  );
}
