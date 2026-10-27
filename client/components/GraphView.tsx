import type { PluginTheme } from "@getpaseo/plugin";
import { FlatList, Modal } from "@getpaseo/plugin/client/react-native";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  type LayoutChangeEvent,
  type ListRenderItem,
  Pressable,
  Text,
  View,
} from "react-native";
import { LOG_MAX_LIMIT, ROW_HEIGHT } from "../../shared/constants";
import type { CommitSummary, RepoTarget } from "../../shared/contracts";
import {
  type GraphRow as GraphRowLayout,
  layoutGraph,
  withWorkInProgress,
} from "../../shared/graph-layout";
import { isMine } from "../../shared/author";
import { useNow } from "../hooks/useNow";
import { useRepoGraph } from "../hooks/useRepoQueries";
import { FONT_SIZE, NARROW_LAYOUT_WIDTH, RADIUS, SPACING } from "../tokens";
import { ColumnHeader } from "./ColumnHeader";
import { CommitDetail } from "./CommitDetail";
import { GraphRow } from "./GraphRow";
import { StatusBar } from "./StatusBar";
import { hasWorkInProgress, WipRow } from "./WipRow";

const LIST_FLEX = 3;
const DETAIL_FLEX = 2;
const DIVIDER_WIDTH = 1;

interface ListItem {
  commit: CommitSummary;
  row: GraphRowLayout;
  mine: boolean;
}

interface GraphViewProps {
  target: RepoTarget;
  theme: PluginTheme;
  compact: boolean;
}

function keyExtractor(item: ListItem): string {
  return item.commit.hash;
}

export function GraphView({ target, theme, compact }: GraphViewProps) {
  const { colors } = theme;
  const repo = useRepoGraph(target, "all");
  const now = useNow();
  const [selectedHash, setSelectedHash] = useState<string | null>(null);
  // The panel can sit in the narrow Explorer of a wide window, so size from our own width.
  const [width, setWidth] = useState<number | null>(null);
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setWidth(Math.round(event.nativeEvent.layout.width));
  }, []);
  const narrow = compact || (width !== null && width < NARROW_LAYOUT_WIDTH);
  const closeDetail = useCallback(() => setSelectedHash(null), []);
  const onModalOpenChange = useCallback((open: boolean) => {
    if (!open) setSelectedHash(null);
  }, []);

  const status = repo.status;
  const showWip = status !== undefined && hasWorkInProgress(status);
  const wipParent = status?.headOid ?? null;
  const graph = useMemo(
    () => layoutGraph(showWip ? withWorkInProgress(repo.commits, wipParent) : repo.commits),
    [repo.commits, showWip, wipParent],
  );
  const wipRow = showWip ? graph.rows[0] : undefined;
  const identityName = status?.identity.name ?? null;
  const identityEmail = status?.identity.email ?? null;
  const items = useMemo<ListItem[]>(() => {
    const identity = { name: identityName, email: identityEmail };
    const commitRows = showWip ? graph.rows.slice(1) : graph.rows;
    return repo.commits.flatMap((commit, index) => {
      const row = commitRows[index];
      if (!row) return [];
      return [{ commit, row, mine: isMine({ name: commit.authorName, email: commit.authorEmail }, identity) }];
    });
  }, [repo.commits, graph, showWip, identityName, identityEmail]);
  const laneCount = Math.max(graph.laneCount, 1);
  // The detail pane takes width from the list, so rows drop their author and date columns.
  const condensed = narrow || selectedHash !== null;

  const renderItem = useCallback<ListRenderItem<ListItem>>(
    ({ item }) => (
      <GraphRow
        commit={item.commit}
        row={item.row}
        laneCount={laneCount}
        theme={theme}
        compact={condensed}
        selected={item.commit.hash === selectedHash}
        mine={item.mine}
        now={now}
        onSelect={setSelectedHash}
      />
    ),
    [laneCount, theme, condensed, selectedHash, now],
  );

  const headerHeight = showWip ? ROW_HEIGHT : 0;
  const getItemLayout = useCallback(
    (_: ArrayLike<ListItem> | null | undefined, index: number) => ({
      length: ROW_HEIGHT,
      offset: headerHeight + ROW_HEIGHT * index,
      index,
    }),
    [headerHeight],
  );
  const header =
    status && wipRow ? <WipRow status={status} row={wipRow} laneCount={laneCount} theme={theme} /> : null;

  const textStyle = { color: colors.foregroundMuted, fontSize: FONT_SIZE.body };
  const buttonStyle = {
    alignSelf: "center" as const,
    marginVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.card,
    backgroundColor: colors.surface2,
  };

  let footer = null;
  if (repo.loadingMore) {
    footer = <ActivityIndicator style={{ marginVertical: SPACING.md }} color={colors.foregroundMuted} />;
  } else if (repo.canLoadMore) {
    footer = (
      <Pressable accessibilityRole="button" accessibilityLabel="Load more commits" onPress={repo.loadMore} style={buttonStyle}>
        <Text style={{ color: colors.foreground, fontSize: FONT_SIZE.body }}>Load more</Text>
      </Pressable>
    );
  } else if (repo.limitReached) {
    footer = (
      <Text style={[textStyle, { textAlign: "center", marginVertical: SPACING.md }]}>
        Showing the newest {LOG_MAX_LIMIT} commits
      </Text>
    );
  }

  let body;
  if (repo.error) {
    body = (
      <View style={{ padding: SPACING.lg, gap: SPACING.md }}>
        <Text style={{ color: colors.statusDanger, fontSize: FONT_SIZE.body }}>{repo.error.message}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Retry" onPress={repo.retry} style={[buttonStyle, { alignSelf: "flex-start" }]}>
          <Text style={{ color: colors.foreground, fontSize: FONT_SIZE.body }}>Retry</Text>
        </Pressable>
      </View>
    );
  } else if (repo.loading) {
    body = <ActivityIndicator style={{ marginTop: SPACING.xl }} color={colors.foregroundMuted} />;
  } else if (items.length === 0) {
    body = <Text style={[textStyle, { padding: SPACING.lg }]}>No commits yet.</Text>;
  } else {
    body = (
      <View style={{ flex: 1 }}>
        {condensed ? null : <ColumnHeader laneCount={laneCount} theme={theme} />}
        <FlatList
          style={{ flex: 1 }}
          data={items}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          getItemLayout={getItemLayout}
          ListHeaderComponent={header}
          ListFooterComponent={footer}
        />
      </View>
    );
  }

  const detail =
    selectedHash === null ? null : (
      <CommitDetail
        key={selectedHash}
        target={target}
        hash={selectedHash}
        theme={theme}
        onSelectCommit={setSelectedHash}
        onClose={narrow ? undefined : closeDetail}
      />
    );

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface0 }} onLayout={onLayout}>
      {status ? <StatusBar status={status} theme={theme} /> : null}
      {narrow ? (
        <>
          {body}
          <Modal title="Commit" open={detail !== null} onOpenChange={onModalOpenChange}>
            <Modal.Content scrollable={false} contentContainerStyle={{ padding: 0, gap: 0 }}>
              {detail}
            </Modal.Content>
          </Modal>
        </>
      ) : (
        <View style={{ flex: 1, flexDirection: "row" }}>
          <View style={{ flex: LIST_FLEX }}>{body}</View>
          {detail ? (
            <View style={{ flex: DETAIL_FLEX, borderLeftWidth: DIVIDER_WIDTH, borderLeftColor: colors.border }}>
              {detail}
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}
