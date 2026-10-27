import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { Icon, ScrollView, useToast } from "@getpaseo/plugin/client/react-native";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import type { Folder, Project, RepoTarget } from "../shared/contracts";
import { isStillListed } from "../shared/repo-selection";
import { AddProjectForm } from "./components/AddProjectForm";
import { GraphView } from "./components/GraphView";
import { ProjectSwitcher } from "./components/ProjectSwitcher";
import { targetKey } from "./hooks/useRepoQueries";
import { type FolderScan, useFolderScans } from "./hooks/useFolderRepos";
import { useProjects } from "./hooks/useProjects";
import { FONT_SIZE, ICON_SIZE, RADIUS, SPACING } from "./tokens";

const SIDEBAR_WIDTH = 280;
const DIVIDER_WIDTH = 1;
const COMPACT_PICKER_MAX_HEIGHT = 240;

/**
 * The selection while it still exists. A repository missing from its folder only counts as gone
 * after a complete, successful rescan, so a slow, failed, or truncated scan never drops what the
 * user is looking at.
 */
function stillAvailable(
  selection: RepoTarget | null,
  projects: readonly Project[],
  folderScans: readonly FolderScan[],
): RepoTarget | null {
  if (!selection) return null;
  switch (selection.kind) {
    case "project":
      return projects.some((project) => project.id === selection.projectId) ? selection : null;
    case "folder-repo": {
      const scan = folderScans.find((candidate) => candidate.folder.id === selection.folderId);
      return scan && isStillListed(selection.relativePath, scan) ? selection : null;
    }
    case "workspace":
    case "workspace-repo":
      return null;
  }
}

export function GitGraphScreen({ theme, layout }: PluginScreenProps) {
  const { colors } = theme;
  const toast = useToast();
  const projects = useProjects();
  const folderScans = useFolderScans(projects.folders);
  const [selection, setSelection] = useState<RepoTarget | null>(null);
  const [adding, setAdding] = useState(false);
  const onAdded = useCallback((target: RepoTarget | null) => {
    if (target) setSelection(target);
    setAdding(false);
  }, []);

  const available: RepoTarget[] = [
    ...projects.projects.map((project): RepoTarget => ({ kind: "project", projectId: project.id })),
    ...folderScans.flatMap((scan) =>
      scan.repos.map((repo): RepoTarget => ({
        kind: "folder-repo",
        folderId: scan.folder.id,
        relativePath: repo.relativePath,
      })),
    ),
  ];
  const target = stillAvailable(selection, projects.projects, folderScans) ?? available[0] ?? null;
  const selectedKey = target ? targetKey(target) : null;
  // `available` is rebuilt every render; keying on the target's identity string keeps the
  // object stable for GraphView until the selection really changes.
  const stableTarget = useMemo(() => target, [selectedKey]);

  const { remove, removeFolder } = projects;
  const onRemoveProject = useCallback(
    (project: Project) => {
      void remove(project.id).then((removed) => {
        if (removed) toast.show(`Stopped tracking ${project.name}`);
        else toast.error("Projects changed elsewhere. Try again.");
      });
    },
    [remove, toast],
  );
  const onRemoveFolder = useCallback(
    (folder: Folder) => {
      void removeFolder(folder.id).then((removed) => {
        if (removed) toast.show(`Stopped tracking folder ${folder.name}`);
        else toast.error("Projects changed elsewhere. Try again.");
      });
    },
    [removeFolder, toast],
  );

  if (projects.status === "loading") {
    return (
      <View style={{ flex: 1, backgroundColor: colors.surface0 }}>
        <ActivityIndicator style={{ marginTop: SPACING.xl }} color={colors.foregroundMuted} />
      </View>
    );
  }
  if (projects.error) {
    return (
      <View style={{ flex: 1, padding: SPACING.lg, backgroundColor: colors.surface0 }}>
        <Text style={{ color: colors.statusDanger, fontSize: FONT_SIZE.body }}>{projects.error}</Text>
      </View>
    );
  }

  const picker = (
    <>
      <ProjectSwitcher
        projects={projects.projects}
        folderScans={folderScans}
        selectedKey={selectedKey}
        theme={theme}
        compact={layout.compact}
        onSelect={setSelection}
        onRemoveProject={onRemoveProject}
        onRemoveFolder={onRemoveFolder}
      />
      {projects.projects.length + projects.folders.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={adding ? "Cancel adding a repository" : "Add repository"}
          accessibilityState={{ expanded: adding }}
          onPress={() => setAdding((open) => !open)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            alignSelf: "flex-start",
            gap: SPACING.xs,
            paddingHorizontal: SPACING.sm,
            paddingVertical: SPACING.xs,
            borderRadius: RADIUS.chip,
            backgroundColor: colors.surface2,
          }}
        >
          <Icon name={adding ? "X" : "Plus"} size={ICON_SIZE} color={colors.foreground} />
          <Text style={{ color: colors.foreground, fontSize: FONT_SIZE.small }}>
            {adding ? "Cancel" : "Add repository"}
          </Text>
        </Pressable>
      ) : null}
      {adding || projects.projects.length + projects.folders.length === 0 ? (
        <AddProjectForm
          theme={theme}
          onInspect={projects.inspect}
          onAddRepo={projects.add}
          onAddFolder={projects.addFolder}
          onAdded={onAdded}
        />
      ) : null}
    </>
  );
  const graph = stableTarget ? (
    <GraphView key={selectedKey} target={stableTarget} theme={theme} compact={layout.compact} />
  ) : (
    <Text style={{ padding: SPACING.lg, color: colors.foregroundMuted, fontSize: FONT_SIZE.body }}>
      Add a repository, or a folder of repositories, to see a commit graph.
    </Text>
  );

  if (layout.compact) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.surface0 }}>
        <ScrollView
          style={{ flexGrow: 0, maxHeight: COMPACT_PICKER_MAX_HEIGHT, borderBottomWidth: DIVIDER_WIDTH, borderBottomColor: colors.border }}
          contentContainerStyle={{ padding: SPACING.md, gap: SPACING.md }}
        >
          {picker}
        </ScrollView>
        {graph}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, flexDirection: "row", backgroundColor: colors.surface0 }}>
      <ScrollView
        style={{ width: SIDEBAR_WIDTH, flexGrow: 0, borderRightWidth: DIVIDER_WIDTH, borderRightColor: colors.border }}
        contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.xl }}
      >
        {picker}
      </ScrollView>
      <View style={{ flex: 1 }}>{graph}</View>
    </View>
  );
}
