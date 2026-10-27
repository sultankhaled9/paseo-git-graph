import type { PluginTheme } from "@getpaseo/plugin";
import { Icon, TextInput } from "@getpaseo/plugin/client/react-native";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import type { LogScope } from "../../shared/contracts";
import { FONT_SIZE, ICON_SIZE, RADIUS, SPACING } from "../tokens";

const BORDER_WIDTH = 1;
const SEARCH_MIN_WIDTH = 160;

const SCOPES: readonly { value: LogScope; label: string }[] = [
  { value: "all", label: "All branches" },
  { value: "head", label: "Current branch" },
];

interface SearchBarProps {
  theme: PluginTheme;
  query: string;
  onQueryChange(query: string): void;
  matchCount: number;
  matchPosition: number;
  loadedCount: number;
  onPrevious(): void;
  onNext(): void;
  scope: LogScope;
  onScopeChange(scope: LogScope): void;
  updating: boolean;
}

function IconButton({
  icon,
  label,
  disabled,
  onPress,
  theme,
}: {
  icon: string;
  label: string;
  disabled: boolean;
  onPress(): void;
  theme: PluginTheme;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{ padding: SPACING.xs, borderRadius: RADIUS.chip, backgroundColor: theme.colors.surface2 }}
    >
      <Icon name={icon} size={ICON_SIZE} color={disabled ? theme.colors.foregroundMuted : theme.colors.foreground} />
    </Pressable>
  );
}

/** Finds commits among those loaded, and switches between all branches and the current one. */
export function SearchBar({
  theme,
  query,
  onQueryChange,
  matchCount,
  matchPosition,
  loadedCount,
  onPrevious,
  onNext,
  scope,
  onScopeChange,
  updating,
}: SearchBarProps) {
  const { colors } = theme;
  const searching = query.trim().length > 0;
  const noMatches = searching && matchCount === 0;
  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        alignItems: "center",
        gap: SPACING.sm,
        paddingHorizontal: SPACING.md,
        paddingVertical: SPACING.sm,
        borderBottomWidth: BORDER_WIDTH,
        borderBottomColor: colors.border,
      }}
    >
      <View
        style={{
          flex: 1,
          minWidth: SEARCH_MIN_WIDTH,
          flexDirection: "row",
          alignItems: "center",
          gap: SPACING.xs,
          paddingHorizontal: SPACING.sm,
          borderRadius: RADIUS.chip,
          borderWidth: BORDER_WIDTH,
          borderColor: colors.border,
          backgroundColor: colors.surface1,
        }}
      >
        <Icon name="Search" size={ICON_SIZE} color={colors.foregroundMuted} />
        <TextInput
          accessibilityLabel="Search commits"
          placeholder="Search message, author, or hash"
          placeholderTextColor={colors.foregroundMuted}
          autoCapitalize="none"
          autoCorrect={false}
          value={query}
          onChangeText={onQueryChange}
          onSubmitEditing={onNext}
          style={{ flex: 1, paddingVertical: SPACING.xs, color: colors.foreground, fontSize: FONT_SIZE.body }}
        />
        {searching ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => onQueryChange("")}>
            <Icon name="X" size={ICON_SIZE} color={colors.foregroundMuted} />
          </Pressable>
        ) : null}
      </View>
      {searching ? (
        <>
          <Text style={{ color: noMatches ? colors.statusWarning : colors.foregroundMuted, fontSize: FONT_SIZE.small }}>
            {noMatches
              ? `No matches in ${loadedCount} loaded commits`
              : `${matchPosition + 1} of ${matchCount} in ${loadedCount} loaded`}
          </Text>
          <IconButton icon="ChevronUp" label="Previous match" disabled={matchCount === 0} onPress={onPrevious} theme={theme} />
          <IconButton icon="ChevronDown" label="Next match" disabled={matchCount === 0} onPress={onNext} theme={theme} />
        </>
      ) : null}
      {updating ? <ActivityIndicator accessibilityLabel="Updating history" color={colors.foregroundMuted} /> : null}
      <View style={{ flexDirection: "row", borderRadius: RADIUS.chip, borderWidth: BORDER_WIDTH, borderColor: colors.border }}>
        {SCOPES.map((option) => {
          const active = option.value === scope;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityLabel={`Show ${option.label.toLowerCase()}`}
              accessibilityState={{ selected: active }}
              onPress={() => onScopeChange(option.value)}
              style={{
                paddingHorizontal: SPACING.sm,
                paddingVertical: SPACING.xs,
                backgroundColor: active ? colors.surface2 : "transparent",
              }}
            >
              <Text
                style={{
                  color: active ? colors.foreground : colors.foregroundMuted,
                  fontSize: FONT_SIZE.small,
                  fontWeight: active ? "600" : "400",
                }}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
