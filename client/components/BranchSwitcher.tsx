import type { PluginTheme } from "@getpaseo/plugin";
import { FlatList, Icon, Modal, TextInput } from "@getpaseo/plugin/client/react-native";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { describeSwitch, filterBranches, unavailableReason } from "../../shared/branch-text";
import { LOCAL_BRANCH_PREFIX } from "../../shared/constants";
import type { LocalBranch, RemoteBranch, RepoStatus, RepoTarget } from "../../shared/contracts";
import { formatRelative } from "../../shared/format";
import { type BranchSwitch, useBranchSwitch } from "../hooks/useBranchSwitch";
import { useNow } from "../hooks/useNow";
import { FONT_SIZE, ICON_SIZE, ON_LANE_TEXT, RADIUS, SPACING } from "../tokens";
import { ActionButton } from "./ChangeControls";
import { StatusBar } from "./StatusBar";

const BORDER_WIDTH = 1;
/** The branch list scrolls inside the picker past this height. */
const PICKER_LIST_HEIGHT = 420;
const UNAVAILABLE_OPACITY = 0.55;

type PickerRow =
  | { kind: "heading"; key: string; title: string; note: string }
  | { kind: "local"; key: string; branch: LocalBranch }
  | { kind: "remote"; key: string; branch: RemoteBranch };

function BranchRow({
  row,
  now,
  theme,
  onChoose,
}: {
  row: Exclude<PickerRow, { kind: "heading" }>;
  now: number;
  theme: PluginTheme;
  onChoose(ref: string): void;
}) {
  const { colors } = theme;
  const { branch } = row;
  const reason = unavailableReason(branch);
  const tracking = row.kind === "local" && row.branch.upstream ? `tracks ${row.branch.upstream}` : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={reason ? `${branch.name}, ${reason}` : `Switch to ${branch.name}`}
      accessibilityState={{ disabled: reason !== null }}
      disabled={reason !== null}
      onPress={() => onChoose(branch.ref)}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: SPACING.sm,
        paddingHorizontal: SPACING.sm,
        paddingVertical: SPACING.sm,
        borderRadius: RADIUS.card,
        opacity: reason ? UNAVAILABLE_OPACITY : 1,
      }}
    >
      <Icon name={row.kind === "local" ? "GitBranch" : "Cloud"} size={ICON_SIZE} color={colors.foregroundMuted} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: FONT_SIZE.body, fontWeight: "600" }}>
          {branch.name}
        </Text>
        <Text numberOfLines={1} style={{ color: colors.foregroundMuted, fontSize: FONT_SIZE.small }}>
          {[reason, tracking, branch.subject, branch.date ? formatRelative(branch.date, now) : null].filter(Boolean).join("  ·  ")}
        </Text>
      </View>
    </Pressable>
  );
}

function BranchList({ flow, theme }: { flow: BranchSwitch; theme: PluginTheme }) {
  const { colors } = theme;
  const now = useNow();
  const [query, setQuery] = useState("");
  const data = flow.branches.data;
  const rows = useMemo<PickerRow[]>(() => {
    if (!data) return [];
    const { local, remote } = filterBranches(data, query);
    return [
      ...(local.length > 0 ? [{ kind: "heading", key: "h-local", title: "On this machine", note: "" } as const] : []),
      ...local.map((branch) => ({ kind: "local", key: branch.ref, branch }) as const),
      ...(remote.length > 0
        ? [{ kind: "heading", key: "h-remote", title: "Only on the server", note: "Picking one creates a local branch that tracks it." } as const]
        : []),
      ...remote.map((branch) => ({ kind: "remote", key: branch.ref, branch }) as const),
    ];
  }, [data, query]);
  const renderItem = useCallback(
    ({ item }: { item: PickerRow }) =>
      item.kind === "heading" ? (
        <View style={{ paddingHorizontal: SPACING.sm, paddingTop: SPACING.md, paddingBottom: SPACING.xs }}>
          <Text style={{ color: colors.foreground, fontSize: FONT_SIZE.small, fontWeight: "700" }}>{item.title}</Text>
          {item.note ? <Text style={{ color: colors.foregroundMuted, fontSize: FONT_SIZE.small }}>{item.note}</Text> : null}
        </View>
      ) : (
        <BranchRow row={item} now={now} theme={theme} onChoose={flow.choose} />
      ),
    [colors, now, theme, flow.choose],
  );

  return (
    <View style={{ gap: SPACING.sm }}>
      <TextInput
        accessibilityLabel="Search branches"
        placeholder="Search branches"
        placeholderTextColor={colors.foregroundMuted}
        value={query}
        onChangeText={setQuery}
        autoFocus
        style={{
          color: colors.foreground,
          fontSize: FONT_SIZE.body,
          paddingHorizontal: SPACING.sm,
          paddingVertical: SPACING.xs,
          borderRadius: RADIUS.chip,
          borderWidth: BORDER_WIDTH,
          borderColor: colors.border,
        }}
      />
      {flow.branches.error ? (
        <Text style={{ color: colors.statusWarning, fontSize: FONT_SIZE.body }}>{flow.branches.error.message}</Text>
      ) : !data ? (
        <ActivityIndicator color={colors.foregroundMuted} />
      ) : rows.length === 0 ? (
        <Text style={{ color: colors.foregroundMuted, fontSize: FONT_SIZE.body }}>No branch matches "{query}".</Text>
      ) : (
        <FlatList data={rows} keyExtractor={(row) => row.key} renderItem={renderItem} style={{ height: PICKER_LIST_HEIGHT }} />
      )}
      {data?.truncated ? (
        <Text style={{ color: colors.foregroundMuted, fontSize: FONT_SIZE.small }}>Only the most recently used branches are listed.</Text>
      ) : null}
    </View>
  );
}

function SwitchConfirm({ flow, theme }: { flow: BranchSwitch; theme: PluginTheme }) {
  const { colors } = theme;
  const pending = flow.pending;
  if (!pending) return null;
  const preview = pending.preview;
  const text = preview?.allowed ? describeSwitch(preview) : null;
  const canSwitch = !!preview?.allowed && !pending.busy;
  return (
    <View style={{ gap: SPACING.md }}>
      {!preview && pending.busy ? <ActivityIndicator color={colors.foregroundMuted} /> : null}
      {preview && !preview.allowed ? <Text style={{ color: colors.statusWarning, fontSize: FONT_SIZE.body }}>{preview.reason}</Text> : null}
      {text ? (
        <>
          <Text style={{ color: colors.foreground, fontSize: FONT_SIZE.title, fontWeight: "700" }}>{text.title}</Text>
          <Text style={{ color: colors.foreground, fontSize: FONT_SIZE.body }}>{text.detail}</Text>
        </>
      ) : null}
      {pending.error ? <Text style={{ color: colors.statusWarning, fontSize: FONT_SIZE.body }}>{pending.error}</Text> : null}
      <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: SPACING.sm }}>
        <ActionButton label="Back" icon="ArrowLeft" onPress={flow.backToList} theme={theme} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={text ? `Confirm: ${text.title}` : "Confirm switch"}
          accessibilityState={{ disabled: !canSwitch }}
          disabled={!canSwitch}
          onPress={() => void flow.confirm()}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: SPACING.xs,
            paddingHorizontal: SPACING.md,
            paddingVertical: SPACING.xs,
            borderRadius: RADIUS.chip,
            backgroundColor: canSwitch ? colors.accent : colors.surface2,
          }}
        >
          {pending.busy && preview ? <ActivityIndicator color={ON_LANE_TEXT} /> : null}
          <Text style={{ color: canSwitch ? colors.accentForeground : colors.foregroundMuted, fontSize: FONT_SIZE.small, fontWeight: "700" }}>
            Switch
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function SwitchedBanner({ flow, theme }: { flow: BranchSwitch; theme: PluginTheme }) {
  const { colors } = theme;
  const done = flow.done;
  if (!done) return null;
  const previousName = done.previous?.slice(LOCAL_BRANCH_PREFIX.length) ?? null;
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        flexWrap: "wrap",
        gap: SPACING.sm,
        margin: SPACING.md,
        marginBottom: 0,
        padding: SPACING.md,
        borderRadius: RADIUS.card,
        borderWidth: BORDER_WIDTH,
        borderColor: colors.accent,
        backgroundColor: colors.surface1,
      }}
    >
      <Icon name="GitBranch" size={ICON_SIZE} color={colors.accent} />
      <Text style={{ flex: 1, color: colors.foreground, fontSize: FONT_SIZE.body }}>Now on {done.branch}.</Text>
      {previousName ? (
        <ActionButton label={`Switch back to ${previousName}`} icon="Undo2" onPress={flow.switchBack} theme={theme} />
      ) : null}
      <ActionButton label="Dismiss" icon="X" onPress={flow.dismiss} theme={theme} iconOnly />
    </View>
  );
}

/**
 * The "what is now" line, which opens a branch picker: search, pick, confirm, and afterwards a
 * Switch back offer. One component, so the graph and My Changes share the same behavior.
 */
export function BranchStatusBar({
  target,
  status,
  theme,
  actions,
}: {
  target: RepoTarget;
  status: RepoStatus;
  theme: PluginTheme;
  actions?: ReactNode;
}) {
  const flow = useBranchSwitch(target);
  return (
    <>
      <StatusBar status={status} theme={theme} actions={actions} onPressHead={flow.openPicker} />
      <SwitchedBanner flow={flow} theme={theme} />
      <Modal
        title={flow.pending ? "Confirm switch" : "Switch branch"}
        open={flow.open}
        onOpenChange={(open) => (open ? undefined : flow.close())}
      >
        <Modal.Content scrollable={false}>
          {flow.pending ? <SwitchConfirm flow={flow} theme={theme} /> : <BranchList flow={flow} theme={theme} />}
        </Modal.Content>
      </Modal>
    </>
  );
}
