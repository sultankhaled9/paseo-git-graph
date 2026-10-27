import type { PluginWorkspacePanelProps } from "@getpaseo/plugin/client";
import { GraphView } from "./components/GraphView";
import { WorkspaceTargetView } from "./components/WorkspaceTargetView";
import { targetKey } from "./hooks/useRepoQueries";

/** The graph for the workspace's repository, or for the repositories inside a plain-folder workspace. */
export function GitGraphPanel({ theme, layout, workspaceId }: PluginWorkspacePanelProps) {
  return (
    <WorkspaceTargetView
      workspaceId={workspaceId}
      theme={theme}
      render={(target) => <GraphView key={targetKey(target)} target={target} theme={theme} compact={layout.compact} />}
    />
  );
}
