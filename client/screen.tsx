import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { ScrollView, useToast } from "@getpaseo/plugin/client/react-native";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import type { Project, RepoTarget } from "../shared/contracts";
import { AddProjectForm } from "./components/AddProjectForm";
import { GraphView } from "./components/GraphView";
import { ProjectSwitcher } from "./components/ProjectSwitcher";
import { targetKey } from "./hooks/useRepoQueries";
import { useProjects } from "./hooks/useProjects";
import { FONT_SIZE, SPACING } from "./tokens";

const SIDEBAR_WIDTH = 280;
const DIVIDER_WIDTH = 1;
const COMPACT_PICKER_MAX_HEIGHT = 240;

export function GitGraphScreen({ theme, layout }: PluginScreenProps) {
  const { colors } = theme;
  const toast = useToast();
  const projects = useProjects();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = projects.projects.find((project) => project.id === selectedId) ?? projects.projects[0];
  const selectedProjectId = selected?.id ?? null;
  const target = useMemo<RepoTarget | null>(
    () => (selectedProjectId ? { kind: "project", projectId: selectedProjectId } : null),
    [selectedProjectId],
  );

  const { remove } = projects;
  const onRemove = useCallback(
    (project: Project) => {
      void remove(project.id).then((removed) => {
        if (removed) toast.show(`Stopped tracking ${project.name}`);
        else toast.error("Projects changed elsewhere. Try again.");
      });
    },
    [remove, toast],
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
        selectedId={selectedProjectId}
        theme={theme}
        compact={layout.compact}
        onSelect={setSelectedId}
        onRemove={onRemove}
      />
      <AddProjectForm theme={theme} onAdd={projects.add} onAdded={setSelectedId} />
    </>
  );
  const graph = target ? (
    <GraphView key={targetKey(target)} target={target} theme={theme} compact={layout.compact} />
  ) : (
    <Text style={{ padding: SPACING.lg, color: colors.foregroundMuted, fontSize: FONT_SIZE.body }}>
      Add a repository to see its commit graph.
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
