import type { PluginTheme } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { Pressable, Text, View } from "react-native";
import type { Project } from "../../shared/contracts";
import { FONT_SIZE, ICON_SIZE, RADIUS, SPACING } from "../tokens";

interface ProjectSwitcherProps {
  projects: readonly Project[];
  selectedId: string | null;
  theme: PluginTheme;
  compact: boolean;
  onSelect(id: string): void;
  onRemove(project: Project): void;
}

/** Tracked repositories: a vertical list in wide layouts, a wrapping chip row when compact. */
export function ProjectSwitcher({ projects, selectedId, theme, compact, onSelect, onRemove }: ProjectSwitcherProps) {
  const { colors } = theme;
  if (projects.length === 0) {
    return (
      <Text style={{ color: colors.foregroundMuted, fontSize: FONT_SIZE.small }}>No repositories tracked yet.</Text>
    );
  }
  return (
    <View style={{ gap: SPACING.xs, flexDirection: compact ? "row" : "column", flexWrap: compact ? "wrap" : "nowrap" }}>
      {projects.map((project) => {
        const selected = project.id === selectedId;
        return (
          <View
            key={project.id}
            style={{
              flexDirection: "row",
              alignItems: "center",
              borderRadius: RADIUS.chip,
              backgroundColor: selected ? colors.surface2 : "transparent",
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Show ${project.name}`}
              accessibilityState={{ selected }}
              onPress={() => onSelect(project.id)}
              style={[
                { paddingHorizontal: SPACING.sm, paddingVertical: SPACING.sm, gap: SPACING.xs },
                compact ? null : { flex: 1 },
              ]}
            >
              <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: FONT_SIZE.body }}>
                {project.name}
              </Text>
              {compact ? null : (
                <Text numberOfLines={1} style={{ color: colors.foregroundMuted, fontSize: FONT_SIZE.small }}>
                  {project.path}
                </Text>
              )}
            </Pressable>
            {selected ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Stop tracking ${project.name}`}
                onPress={() => onRemove(project)}
                style={{ padding: SPACING.sm }}
              >
                <Icon name="Trash2" size={ICON_SIZE} color={colors.foregroundMuted} />
              </Pressable>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}
