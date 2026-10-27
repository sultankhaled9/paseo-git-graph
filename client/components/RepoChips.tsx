import type { PluginTheme } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import type { FolderRepo } from "../../shared/contracts";
import { FONT_SIZE, ICON_SIZE, RADIUS, SPACING } from "../tokens";

const BORDER_WIDTH = 1;

interface RepoChipsProps {
  repos: readonly FolderRepo[];
  selected: string | null;
  scanning: boolean;
  note: string | null;
  theme: PluginTheme;
  onSelect(relativePath: string): void;
  onRescan(): void;
}

/** A wrapping row of the repositories found in a workspace folder, plus a rescan button. */
export function RepoChips({ repos, selected, scanning, note, theme, onSelect, onRescan }: RepoChipsProps) {
  const { colors } = theme;
  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        alignItems: "center",
        gap: SPACING.xs,
        paddingHorizontal: SPACING.md,
        paddingVertical: SPACING.sm,
        borderBottomWidth: BORDER_WIDTH,
        borderBottomColor: colors.border,
      }}
    >
      <Icon name="FolderGit2" size={ICON_SIZE} color={colors.foregroundMuted} />
      {repos.map((repo) => {
        const active = repo.relativePath === selected;
        return (
          <Pressable
            key={repo.relativePath}
            accessibilityRole="button"
            accessibilityLabel={`Show ${repo.relativePath}`}
            accessibilityState={{ selected: active }}
            onPress={() => onSelect(repo.relativePath)}
            style={{
              paddingHorizontal: SPACING.sm,
              paddingVertical: SPACING.xs,
              borderRadius: RADIUS.chip,
              borderWidth: BORDER_WIDTH,
              borderColor: active ? colors.accent : colors.border,
              backgroundColor: active ? colors.surface2 : colors.surface0,
            }}
          >
            <Text
              numberOfLines={1}
              style={{
                color: active ? colors.foreground : colors.foregroundMuted,
                fontSize: FONT_SIZE.small,
                fontWeight: active ? "600" : "400",
              }}
            >
              {repo.relativePath}
            </Text>
          </Pressable>
        );
      })}
      {note ? <Text style={{ color: colors.statusWarning, fontSize: FONT_SIZE.small }}>{note}</Text> : null}
      <View style={{ flex: 1 }} />
      {scanning ? (
        <ActivityIndicator accessibilityLabel="Scanning workspace folder" color={colors.foregroundMuted} />
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Rescan workspace folder"
          onPress={onRescan}
          style={{ padding: SPACING.xs, borderRadius: RADIUS.chip }}
        >
          <Icon name="RefreshCw" size={ICON_SIZE} color={colors.foregroundMuted} />
        </Pressable>
      )}
    </View>
  );
}
