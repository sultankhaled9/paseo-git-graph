import type { PluginTheme } from "@getpaseo/plugin";
import { useWorkspace } from "@getpaseo/plugin/client";
import { type ReactElement, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { FOLDER_SCAN_DEPTH } from "../../shared/constants";
import type { RepoTarget } from "../../shared/contracts";
import { isStillListed } from "../../shared/repo-selection";
import { useWorkspaceRepos } from "../hooks/useWorkspaceRepos";
import { FONT_SIZE, RADIUS, SPACING } from "../tokens";
import { RepoChips } from "./RepoChips";

function Message({ theme, text, action }: { theme: PluginTheme; text: string; action?: { label: string; onPress(): void } }) {
  const { colors } = theme;
  return (
    <View style={{ flex: 1, padding: SPACING.lg, gap: SPACING.md, backgroundColor: colors.surface0 }}>
      <Text style={{ color: colors.foregroundMuted, fontSize: FONT_SIZE.body }}>{text}</Text>
      {action ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={action.label}
          onPress={action.onPress}
          style={{
            alignSelf: "flex-start",
            paddingHorizontal: SPACING.md,
            paddingVertical: SPACING.xs,
            borderRadius: RADIUS.chip,
            backgroundColor: colors.surface2,
          }}
        >
          <Text style={{ color: colors.foreground, fontSize: FONT_SIZE.small }}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * A workspace whose folder is not itself a repository: find the repositories inside it and
 * show one at a time, with chips to switch. Only the first scan blocks the view.
 */
function FolderWorkspace({
  workspaceId,
  theme,
  render,
}: {
  workspaceId: string;
  theme: PluginTheme;
  render(target: RepoTarget): ReactElement;
}) {
  const { colors } = theme;
  const scan = useWorkspaceRepos(workspaceId);
  const [chosen, setChosen] = useState<string | null>(null);
  const repos = scan.data?.repos ?? [];
  const scanState = { scanned: scan.isSuccess, truncated: scan.data?.truncated ?? false, repos };
  const selected = chosen !== null && isStillListed(chosen, scanState) ? chosen : (repos[0]?.relativePath ?? null);
  const target = useMemo<RepoTarget | null>(
    () => (selected === null ? null : { kind: "workspace-repo", workspaceId, relativePath: selected }),
    [workspaceId, selected],
  );
  const rescan = () => void scan.refetch();

  if (!scan.data) {
    if (scan.error) {
      return <Message theme={theme} text={scan.error.message} action={{ label: "Try again", onPress: rescan }} />;
    }
    return (
      <View style={{ flex: 1, padding: SPACING.lg, gap: SPACING.md, backgroundColor: colors.surface0 }}>
        <ActivityIndicator color={colors.foregroundMuted} />
        <Text style={{ color: colors.foregroundMuted, fontSize: FONT_SIZE.body, textAlign: "center" }}>
          Looking for repositories in this workspace folder
        </Text>
      </View>
    );
  }
  if (!target) {
    return (
      <Message
        theme={theme}
        text={`No git repositories in this workspace folder (looked ${FOLDER_SCAN_DEPTH} folders deep).`}
        action={{ label: "Rescan", onPress: rescan }}
      />
    );
  }

  let note: string | null = null;
  if (scan.error) note = `Last rescan failed: ${scan.error.message}`;
  else if (scan.data.truncated) note = `Showing the first ${repos.length} repositories`;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface0 }}>
      <RepoChips
        repos={repos}
        selected={selected}
        scanning={scan.isFetching}
        note={note}
        theme={theme}
        onSelect={setChosen}
        onRescan={rescan}
      />
      {render(target)}
    </View>
  );
}

interface WorkspaceTargetViewProps {
  workspaceId: string;
  theme: PluginTheme;
  /** Renders a view for one repository; keyed by the caller so switching repositories remounts it. */
  render(target: RepoTarget): ReactElement;
}

/**
 * Resolves what a workspace panel shows: the workspace's own repository, or for a plain-folder
 * workspace the repositories found inside it, with chips to switch. Shared by every panel.
 */
export function WorkspaceTargetView({ workspaceId, theme, render }: WorkspaceTargetViewProps) {
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
  if (!isGit) return <FolderWorkspace key={workspaceId} workspaceId={workspaceId} theme={theme} render={render} />;
  return render(target);
}
