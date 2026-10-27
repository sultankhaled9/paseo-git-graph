import { type PluginWorkspacePanelProps, useWorkspace } from "@getpaseo/plugin/client";
import { useMemo } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import type { RepoTarget } from "../shared/contracts";
import { GraphView } from "./components/GraphView";
import { FONT_SIZE, SPACING } from "./tokens";

/** The graph for the workspace's own repository; the daemon resolves its directory. */
export function GitGraphPanel({ theme, layout, workspaceId }: PluginWorkspacePanelProps) {
  const { colors } = theme;
  const isGit = useWorkspace(workspaceId, (workspace) => workspace.projectKind === "git");
  const target = useMemo<RepoTarget>(() => ({ kind: "workspace", workspaceId }), [workspaceId]);

  if (isGit === null) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.surface0 }}>
        <ActivityIndicator style={{ marginTop: SPACING.xl }} color={colors.foregroundMuted} />
      </View>
    );
  }
  if (!isGit) {
    return (
      <View style={{ flex: 1, padding: SPACING.lg, backgroundColor: colors.surface0 }}>
        <Text style={{ color: colors.foregroundMuted, fontSize: FONT_SIZE.body }}>
          This workspace is not a git repository.
        </Text>
      </View>
    );
  }
  return <GraphView key={workspaceId} target={target} theme={theme} compact={layout.compact} />;
}
