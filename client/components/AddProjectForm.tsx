import type { PluginTheme } from "@getpaseo/plugin";
import { TextInput } from "@getpaseo/plugin/client/react-native";
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import type { AddProjectResult } from "../hooks/useProjects";
import { FONT_SIZE, RADIUS, SPACING } from "../tokens";

const INPUT_BORDER_WIDTH = 1;

interface AddProjectFormProps {
  theme: PluginTheme;
  onAdd(path: string, name: string): Promise<AddProjectResult>;
  onAdded(projectId: string): void;
}

export function AddProjectForm({ theme, onAdd, onAdded }: AddProjectFormProps) {
  const { colors } = theme;
  const [path, setPath] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
  const canSubmit = path.trim().length > 0 && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await onAdd(path, name);
      if (result.ok) {
        setPath("");
        setName("");
        onAdded(result.project.id);
      } else {
        setError(result.reason);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not add the repository");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={{ gap: SPACING.sm }}>
      <Text style={{ color: colors.foregroundMuted, fontSize: FONT_SIZE.small }}>Add repository</Text>
      <TextInput
        accessibilityLabel="Repository path"
        placeholder="/absolute/path/to/repo"
        placeholderTextColor={colors.foregroundMuted}
        autoCapitalize="none"
        autoCorrect={false}
        value={path}
        onChangeText={setPath}
        onSubmitEditing={() => void submit()}
        style={input}
      />
      <TextInput
        accessibilityLabel="Display name (optional)"
        placeholder="Name (optional)"
        placeholderTextColor={colors.foregroundMuted}
        value={name}
        onChangeText={setName}
        onSubmitEditing={() => void submit()}
        style={input}
      />
      {error ? <Text style={{ color: colors.statusDanger, fontSize: FONT_SIZE.small }}>{error}</Text> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Track repository"
        accessibilityState={{ disabled: !canSubmit }}
        disabled={!canSubmit}
        onPress={() => void submit()}
        style={{
          alignItems: "center",
          paddingVertical: SPACING.sm,
          borderRadius: RADIUS.chip,
          backgroundColor: canSubmit ? colors.accent : colors.surface2,
        }}
      >
        {submitting ? (
          <ActivityIndicator color={colors.accentForeground} />
        ) : (
          <Text style={{ color: canSubmit ? colors.accentForeground : colors.foregroundMuted, fontSize: FONT_SIZE.body }}>
            Track repository
          </Text>
        )}
      </Pressable>
    </View>
  );
}
