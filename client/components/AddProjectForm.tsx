import type { PluginTheme } from "@getpaseo/plugin";
import { TextInput } from "@getpaseo/plugin/client/react-native";
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { FOLDER_SCAN_DEPTH } from "../../shared/constants";
import type { InspectPathOutput, RepoTarget } from "../../shared/contracts";
import type { AddFolderResult, AddProjectResult, FolderInspection, RepoInspection } from "../hooks/useProjects";
import { FONT_SIZE, RADIUS, SPACING } from "../tokens";

const INPUT_BORDER_WIDTH = 1;

interface AddProjectFormProps {
  theme: PluginTheme;
  onInspect(input: { path: string }): Promise<InspectPathOutput>;
  onAddRepo(inspection: RepoInspection, name: string): Promise<AddProjectResult>;
  onAddFolder(inspection: FolderInspection, name: string): Promise<AddFolderResult>;
  onAdded(target: RepoTarget | null): void;
}

/**
 * One path field for both cases: a repository is added directly; a folder of repositories is
 * scanned first and added as a group after the user sees how many repositories it holds.
 */
export function AddProjectForm({ theme, onInspect, onAddRepo, onAddFolder, onAdded }: AddProjectFormProps) {
  const { colors } = theme;
  const [path, setPath] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingFolder, setPendingFolder] = useState<FolderInspection | null>(null);

  const input = {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.chip,
    borderWidth: INPUT_BORDER_WIDTH,
    borderColor: colors.border,
    backgroundColor: colors.surface1,
    color: colors.foreground,
    fontSize: FONT_SIZE.body,
  };
  const canSubmit = path.trim().length > 0 && !busy;

  const reset = () => {
    setPath("");
    setName("");
    setPendingFolder(null);
  };

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not add the path");
    } finally {
      setBusy(false);
    }
  };

  const submit = () =>
    run(async () => {
      if (!canSubmit) return;
      const inspection = await onInspect({ path: path.trim() });
      if (inspection.kind === "invalid") {
        setError(inspection.reason);
      } else if (inspection.kind === "repo") {
        const result = await onAddRepo(inspection, name);
        if (!result.ok) setError(result.reason);
        else {
          reset();
          onAdded({ kind: "project", projectId: result.project.id });
        }
      } else {
        setPendingFolder(inspection);
      }
    });

  const confirmFolder = () =>
    run(async () => {
      if (!pendingFolder) return;
      const result = await onAddFolder(pendingFolder, name);
      if (!result.ok) setError(result.reason);
      else {
        reset();
        onAdded(null);
      }
    });

  const button = (label: string, onPress: () => void, primary: boolean, disabled = false) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        flex: 1,
        alignItems: "center",
        paddingVertical: SPACING.sm,
        borderRadius: RADIUS.chip,
        backgroundColor: primary && !disabled ? colors.accent : colors.surface2,
      }}
    >
      <Text
        style={{
          color: primary && !disabled ? colors.accentForeground : colors.foregroundMuted,
          fontSize: FONT_SIZE.body,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );

  return (
    <View style={{ gap: SPACING.sm }}>
      <Text style={{ color: colors.foregroundMuted, fontSize: FONT_SIZE.small }}>
        A repository, or a folder that contains repositories (searched {FOLDER_SCAN_DEPTH} levels deep)
      </Text>
      <TextInput
        accessibilityLabel="Repository path"
        placeholder="/absolute/path/to/repo-or-folder"
        placeholderTextColor={colors.foregroundMuted}
        autoCapitalize="none"
        autoCorrect={false}
        value={path}
        onChangeText={(next) => {
          setPath(next);
          setPendingFolder(null);
        }}
        onSubmitEditing={() => void submit()}
        style={input}
      />
      <TextInput
        accessibilityLabel="Display name (optional)"
        placeholder="Name (optional)"
        placeholderTextColor={colors.foregroundMuted}
        value={name}
        onChangeText={setName}
        style={input}
      />
      {error ? <Text style={{ color: colors.statusDanger, fontSize: FONT_SIZE.small }}>{error}</Text> : null}
      {pendingFolder ? (
        <View style={{ gap: SPACING.sm }}>
          <Text style={{ color: colors.foreground, fontSize: FONT_SIZE.small }}>
            Found {pendingFolder.truncated ? "at least " : ""}
            {pendingFolder.repoCount} {pendingFolder.repoCount === 1 ? "repository" : "repositories"} in "
            {pendingFolder.suggestedName}". New ones will appear automatically.
          </Text>
          <View style={{ flexDirection: "row", gap: SPACING.sm }}>
            {button("Cancel", () => setPendingFolder(null), false, busy)}
            {button("Add folder", () => void confirmFolder(), true, busy)}
          </View>
        </View>
      ) : busy ? (
        <ActivityIndicator color={colors.foregroundMuted} />
      ) : (
        button("Track repository", () => void submit(), true, !canSubmit)
      )}
    </View>
  );
}
