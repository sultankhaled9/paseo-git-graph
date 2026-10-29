import type { PluginTheme } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { memo, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import type { FileStat } from "../../shared/contracts";
import { type ChangeBadge, type FileKind, fileKind, fileName } from "../../shared/file-groups";
import { FONT_SIZE, ICON_SIZE, RADIUS, SIZE_BAR_HEIGHT, SIZE_BAR_WIDTH, SPACING } from "../tokens";

type ThemeColor = keyof PluginTheme["colors"];

const KIND_ICONS: Readonly<Record<FileKind, string>> = {
  code: "FileCode",
  data: "FileJson",
  text: "FileText",
  image: "FileImage",
  config: "FileCog",
  script: "FileTerminal",
  other: "File",
};

/** Badge colors avoid statusDanger: red marks the user's own commits elsewhere in the plugin. */
const BADGE_COLORS: Readonly<Record<ChangeBadge, ThemeColor>> = {
  NEW: "statusSuccess",
  EDITED: "foreground",
  DELETED: "statusWarning",
  RENAMED: "accent",
  COPIED: "accent",
  CONFLICT: "statusWarning",
  "TYPE CHANGED": "foregroundMuted",
};
const BADGE_BORDER_WIDTH = 1;
const MIN_BAR_SEGMENT = 2;

interface FileCardProps {
  path: string;
  oldPath?: string;
  badge: ChangeBadge;
  stat: FileStat | undefined;
  /** The largest change in the section, so the size bars compare files to each other. */
  largestChange: number;
  selected: boolean;
  compact: boolean;
  label: string;
  theme: PluginTheme;
  onPress(): void;
  /** Buttons beside the card, outside its pressable area so they never select the file. */
  actions?: ReactNode;
}

function SizeBar({ additions, deletions, largest, theme }: { additions: number; deletions: number; largest: number; theme: PluginTheme }) {
  const total = additions + deletions;
  const filled = largest > 0 ? Math.max(MIN_BAR_SEGMENT, Math.round((total / largest) * SIZE_BAR_WIDTH)) : 0;
  const added = total > 0 ? Math.round((additions / total) * filled) : 0;
  return (
    <View style={{ width: SIZE_BAR_WIDTH, height: SIZE_BAR_HEIGHT, flexDirection: "row", borderRadius: RADIUS.chip, overflow: "hidden", backgroundColor: theme.colors.surface2 }}>
      <View style={{ width: added, backgroundColor: theme.colors.statusSuccess }} />
      <View style={{ width: filled - added, backgroundColor: theme.colors.statusDanger }} />
    </View>
  );
}

/** One changed file: type icon, name, status badge, line counts, and a bar sized against its section. */
export const FileCard = memo(function FileCard({
  path,
  oldPath,
  badge,
  stat,
  largestChange,
  selected,
  compact,
  label,
  theme,
  onPress,
  actions,
}: FileCardProps) {
  const { colors } = theme;
  const badgeColor = colors[BADGE_COLORS[badge]];
  const counted = stat && stat.additions !== null && stat.deletions !== null ? stat : null;
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: SPACING.xs,
        marginHorizontal: SPACING.sm,
        paddingRight: actions ? SPACING.sm : 0,
        borderRadius: RADIUS.card,
        backgroundColor: selected ? colors.surface2 : colors.surface0,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected }}
        onPress={onPress}
        style={{
          flex: 1,
          minWidth: 0,
          flexDirection: "row",
          alignItems: "center",
          gap: SPACING.sm,
          paddingHorizontal: SPACING.sm,
          paddingVertical: SPACING.sm,
        }}
      >
        <Icon name={KIND_ICONS[fileKind(path)]} size={ICON_SIZE} color={colors.foregroundMuted} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: FONT_SIZE.body, fontWeight: "600" }}>
            {fileName(path)}
          </Text>
          {oldPath ? (
            <Text numberOfLines={1} style={{ color: colors.foregroundMuted, fontSize: FONT_SIZE.small }}>
              from {oldPath}
            </Text>
          ) : null}
        </View>
        <View
          style={{
            paddingHorizontal: SPACING.xs,
            borderRadius: RADIUS.chip,
            borderWidth: BADGE_BORDER_WIDTH,
            borderColor: badgeColor,
          }}
        >
          <Text style={{ color: badgeColor, fontSize: FONT_SIZE.small, fontWeight: "700" }}>{badge}</Text>
        </View>
        {counted ? (
          <>
            <Text style={{ color: colors.statusSuccess, fontSize: FONT_SIZE.small }}>+{counted.additions}</Text>
            <Text style={{ color: colors.statusDanger, fontSize: FONT_SIZE.small }}>-{counted.deletions}</Text>
            {compact ? null : (
              <SizeBar additions={counted.additions ?? 0} deletions={counted.deletions ?? 0} largest={largestChange} theme={theme} />
            )}
          </>
        ) : stat ? (
          <Text style={{ color: colors.foregroundMuted, fontSize: FONT_SIZE.small }}>binary</Text>
        ) : null}
      </Pressable>
      {actions}
    </View>
  );
});
