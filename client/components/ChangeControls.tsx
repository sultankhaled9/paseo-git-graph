import type { PluginTheme } from "@getpaseo/plugin";
import { useRpc } from "@getpaseo/plugin/client";
import { Icon, Modal, ScrollView } from "@getpaseo/plugin/client/react-native";
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { actionsFor, describeAction, type FileActionKind, fileAction } from "../../shared/change-actions";
import { type RepoTarget, restoreBackupRpc, type WipArea } from "../../shared/contracts";
import { formatRelative, pluralize } from "../../shared/format";
import { rpcErrorMessage } from "../../shared/rpc-error";
import { type ChangeFlow, useBackups, useRefreshRepository } from "../hooks/useChangeFlow";
import { FONT_SIZE, ICON_SIZE, ON_LANE_TEXT, RADIUS, SPACING } from "../tokens";

const BORDER_WIDTH = 1;
/** The affected-files list scrolls past this height, so Cancel and Confirm stay in view. */
const PREVIEW_LIST_MAX_HEIGHT = 240;
const RECENT_BACKUPS_SHOWN = 5;

const ACTION_ICONS: Readonly<Record<FileActionKind, string>> = {
  discard: "RotateCcw",
  unstage: "CircleMinus",
  delete: "Trash2",
};

/** Destructive actions use the warning color: red already means "your commits" in this plugin. */
export function ActionButton({
  label,
  icon,
  onPress,
  theme,
  destructive = false,
  disabled = false,
  iconOnly = false,
}: {
  label: string;
  icon: string;
  onPress(): void;
  theme: PluginTheme;
  destructive?: boolean;
  disabled?: boolean;
  iconOnly?: boolean;
}) {
  const { colors } = theme;
  const tint = disabled ? colors.foregroundMuted : destructive ? colors.statusWarning : colors.foreground;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: SPACING.xs,
        paddingHorizontal: iconOnly ? SPACING.xs : SPACING.sm,
        paddingVertical: SPACING.xs,
        borderRadius: RADIUS.chip,
        borderWidth: BORDER_WIDTH,
        borderColor: destructive && !disabled ? colors.statusWarning : colors.border,
      }}
    >
      <Icon name={icon} size={ICON_SIZE} color={tint} />
      {iconOnly ? null : <Text style={{ color: tint, fontSize: FONT_SIZE.small, fontWeight: "600" }}>{label}</Text>}
    </Pressable>
  );
}

/** The actions a file allows in its area (none for conflicts), each opening a confirmation first. */
export function FileActions({
  path,
  area,
  flow,
  theme,
  iconOnly = false,
}: {
  path: string;
  area: WipArea;
  flow: ChangeFlow;
  theme: PluginTheme;
  iconOnly?: boolean;
}) {
  return (
    <>
      {actionsFor(area).map((kind) => {
        const action = fileAction(kind, path, area);
        const text = describeAction(action);
        return (
          <ActionButton
            key={kind}
            label={iconOnly ? `${text.button} ${path}` : text.button}
            icon={ACTION_ICONS[kind]}
            onPress={() => flow.request(action)}
            theme={theme}
            destructive={kind !== "unstage"}
            iconOnly={iconOnly}
          />
        );
      })}
    </>
  );
}

/** States exactly what will be lost, lists the files the server will touch, and only then applies. */
export function ChangeConfirmModal({ flow, theme }: { flow: ChangeFlow; theme: PluginTheme }) {
  const { colors } = theme;
  const [acknowledged, setAcknowledged] = useState(false);
  const pending = flow.pending;
  const text = pending ? describeAction(pending.action, pending.fileCount) : null;
  const preview = pending?.preview ?? null;
  const needsAcknowledgement = pending?.action.kind === "discard-all";
  const canApply = !!preview?.allowed && !pending?.busy && (!needsAcknowledgement || acknowledged);
  const close = () => {
    setAcknowledged(false);
    flow.cancel();
  };

  return (
    <Modal title={text?.title ?? ""} open={pending !== null} onOpenChange={(open) => (open ? undefined : close())}>
      <Modal.Content>
        <Text style={{ color: colors.foreground, fontSize: FONT_SIZE.body }}>{text?.detail}</Text>
        {!preview && pending?.busy ? <ActivityIndicator color={colors.foregroundMuted} /> : null}
        {preview && !preview.allowed ? (
          <Text style={{ color: colors.statusWarning, fontSize: FONT_SIZE.body }}>{preview.reason}</Text>
        ) : null}
        {preview?.allowed ? (
          <View style={{ gap: SPACING.xs }}>
            <Text style={{ color: colors.foregroundMuted, fontSize: FONT_SIZE.small }}>
              {preview.paths.length === 1 ? "This file is affected:" : `These ${preview.paths.length} files are affected:`}
            </Text>
            <ScrollView style={{ maxHeight: PREVIEW_LIST_MAX_HEIGHT }} contentContainerStyle={{ gap: SPACING.xs }}>
              {preview.paths.map((path) => (
                <Text key={path} style={{ color: colors.foreground, fontSize: FONT_SIZE.small }}>
                  {path}
                </Text>
              ))}
            </ScrollView>
          </View>
        ) : null}
        {needsAcknowledgement && preview?.allowed ? (
          <Pressable
            accessibilityRole="checkbox"
            accessibilityLabel="I understand every change will be discarded"
            accessibilityState={{ checked: acknowledged }}
            onPress={() => setAcknowledged((value) => !value)}
            style={{ flexDirection: "row", alignItems: "center", gap: SPACING.sm }}
          >
            <Icon name={acknowledged ? "CircleCheck" : "Circle"} size={ICON_SIZE} color={acknowledged ? colors.statusWarning : colors.foregroundMuted} />
            <Text style={{ color: colors.foreground, fontSize: FONT_SIZE.body }}>
              I understand every change listed above will be discarded
            </Text>
          </Pressable>
        ) : null}
        {pending?.error ? <Text style={{ color: colors.statusWarning, fontSize: FONT_SIZE.body }}>{pending.error}</Text> : null}
        <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: SPACING.sm }}>
          <ActionButton label="Cancel" icon="X" onPress={close} theme={theme} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Confirm: ${text?.button ?? ""}`}
            accessibilityState={{ disabled: !canApply }}
            disabled={!canApply}
            onPress={() => {
              setAcknowledged(false);
              void flow.confirm();
            }}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: SPACING.xs,
              paddingHorizontal: SPACING.md,
              paddingVertical: SPACING.xs,
              borderRadius: RADIUS.chip,
              backgroundColor: canApply ? colors.statusWarning : colors.surface2,
            }}
          >
            {pending?.busy && preview ? <ActivityIndicator color={ON_LANE_TEXT} /> : null}
            <Text style={{ color: canApply ? ON_LANE_TEXT : colors.foregroundMuted, fontSize: FONT_SIZE.small, fontWeight: "700" }}>
              {text?.button}
            </Text>
          </Pressable>
        </View>
      </Modal.Content>
    </Modal>
  );
}

/** Shown right after a change: what happened, with Undo. */
export function UndoBanner({ flow, theme }: { flow: ChangeFlow; theme: PluginTheme }) {
  const { colors } = theme;
  const done = flow.done;
  if (!done) return null;
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        flexWrap: "wrap",
        gap: SPACING.sm,
        padding: SPACING.md,
        borderRadius: RADIUS.card,
        borderWidth: BORDER_WIDTH,
        borderColor: colors.statusWarning,
        backgroundColor: colors.surface1,
      }}
    >
      <Icon name="ArchiveRestore" size={ICON_SIZE} color={colors.statusWarning} />
      <Text style={{ flex: 1, color: colors.foreground, fontSize: FONT_SIZE.body }}>
        {done.text}. A backup was kept.
      </Text>
      {done.undoing ? (
        <ActivityIndicator color={colors.foregroundMuted} />
      ) : (
        <ActionButton label="Undo" icon="Undo2" onPress={() => void flow.undo()} theme={theme} />
      )}
      <ActionButton label="Dismiss" icon="X" onPress={flow.dismiss} theme={theme} iconOnly />
      {done.error ? (
        <Text style={{ width: "100%", color: colors.statusWarning, fontSize: FONT_SIZE.small }}>{done.error}</Text>
      ) : null}
    </View>
  );
}

/** Recent backups with Restore, which is refused unless the files are still as the change left them. */
export function BackupsCard({
  target,
  theme,
  now,
  onRestored,
}: {
  target: RepoTarget;
  theme: PluginTheme;
  now: number;
  onRestored(backupId: string): void;
}) {
  const { colors } = theme;
  const backups = useBackups(target);
  const restore = useRpc(restoreBackupRpc);
  const refresh = useRefreshRepository(target);
  const [showAll, setShowAll] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  // A restored backup leaves the list, so the outcome is shown for the whole card, not on its row.
  const [result, setResult] = useState<{ text: string; failed: boolean } | null>(null);
  const list = backups.data?.backups ?? [];
  if (list.length === 0 && result === null) return null;
  const shown = showAll ? list : list.slice(0, RECENT_BACKUPS_SHOWN);

  const restoreOne = async (id: string) => {
    setBusyId(id);
    try {
      const { restoredPaths } = await restore({ target, backupId: id });
      setResult({ text: `Restored ${pluralize(restoredPaths.length, "file")}`, failed: false });
      onRestored(id);
    } catch (error) {
      setResult({ text: rpcErrorMessage(error, "Restore failed"), failed: true });
    } finally {
      setBusyId(null);
      await refresh();
    }
  };

  return (
    <View
      style={{
        marginHorizontal: SPACING.md,
        marginBottom: SPACING.md,
        padding: SPACING.md,
        gap: SPACING.sm,
        borderRadius: RADIUS.card,
        borderWidth: BORDER_WIDTH,
        borderColor: colors.border,
        backgroundColor: colors.surface1,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.sm }}>
        <Icon name="History" size={ICON_SIZE} color={colors.foreground} />
        <Text style={{ color: colors.foreground, fontSize: FONT_SIZE.body, fontWeight: "700" }}>Backups</Text>
      </View>
      <Text style={{ color: colors.foregroundMuted, fontSize: FONT_SIZE.small }}>
        Taken before every discard. Restoring works only if those files have not changed since, so newer work is never overwritten.
      </Text>
      {result ? (
        <Text style={{ color: result.failed ? colors.statusWarning : colors.statusSuccess, fontSize: FONT_SIZE.small }}>{result.text}</Text>
      ) : null}
      {shown.map((backup) => (
        <View key={backup.id} style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: SPACING.sm }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: FONT_SIZE.small, fontWeight: "600" }}>
              {describeAction(backup.action, backup.paths.length).done}
            </Text>
            <Text numberOfLines={1} style={{ color: colors.foregroundMuted, fontSize: FONT_SIZE.small }}>
              {formatRelative(backup.createdAt, now)}, {backup.paths.slice(0, 2).join(", ")}
              {backup.paths.length > 2 ? ` and ${backup.paths.length - 2} more` : ""}
            </Text>
          </View>
          {busyId === backup.id ? (
            <ActivityIndicator color={colors.foregroundMuted} />
          ) : (
            <ActionButton label="Restore" icon="ArchiveRestore" onPress={() => void restoreOne(backup.id)} disabled={busyId !== null} theme={theme} />
          )}
        </View>
      ))}
      {list.length > RECENT_BACKUPS_SHOWN ? (
        <ActionButton
          label={showAll ? "Show fewer" : `Show all ${list.length}`}
          icon={showAll ? "ChevronUp" : "ChevronDown"}
          onPress={() => setShowAll((value) => !value)}
          theme={theme}
        />
      ) : null}
    </View>
  );
}
