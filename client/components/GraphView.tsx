import type { PluginTheme } from "@getpaseo/plugin";
import { FlatList, Icon, Modal } from "@getpaseo/plugin/client/react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  type FlatList as NativeFlatList,
  type LayoutChangeEvent,
  type ListRenderItem,
  Pressable,
  Text,
  View,
} from "react-native";
import { LOG_MAX_LIMIT, ROW_HEIGHT } from "../../shared/constants";
import type { CommitSummary, LogScope, RepoTarget } from "../../shared/contracts";
import {
  layoutGraph,
  projectRow,
  WIP_NODE_ID,
  withWorkInProgress,
} from "../../shared/graph-layout";
import { isMine } from "../../shared/author";
import { matchesQuery } from "../../shared/search";
import { useNow } from "../hooks/useNow";
import { useRepoGraph } from "../hooks/useRepoQueries";
import {
  FONT_SIZE,
  ICON_SIZE,
  MAX_GRAPH_LANES,
  MAX_GRAPH_LANES_NARROW,
  MIN_GRAPH_LANES,
  NARROW_LAYOUT_WIDTH,
  RADIUS,
  SPACING,
  wideLayoutMinWidth,
} from "../tokens";
import { ColumnHeader } from "./ColumnHeader";
import { CommitDetail } from "./CommitDetail";
import { Legend } from "./Legend";
import { CommitRow, type CommitRowGraph } from "./CommitRow";
import { StatusBar } from "./StatusBar";
import { WipDetail } from "./WipDetail";
import { SearchBar } from "./SearchBar";
import { hasWorkInProgress, WipRow } from "./WipRow";

const LIST_FLEX = 3;
const DETAIL_FLEX = 2;
const DIVIDER_WIDTH = 1;
/** Where a jumped-to match lands vertically: 0 is the top of the list, 1 the bottom. */
const MATCH_VIEW_POSITION = 0.3;
const NO_MATCH = -1;

interface ListItem {
  commit: CommitSummary;
  graph: CommitRowGraph;
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
  const [scope, setScope] = useState<LogScope>("all");
  const repo = useRepoGraph(target, scope);
  const [query, setQuery] = useState("");
  const [showLegend, setShowLegend] = useState(false);
  const toggleLegend = useCallback(() => setShowLegend((shown) => !shown), []);
  const [matchPosition, setMatchPosition] = useState(0);
  const listRef = useRef<NativeFlatList<ListItem>>(null);
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
  const laneCount = Math.min(
    Math.max(graph.laneCount, MIN_GRAPH_LANES),
    narrow ? MAX_GRAPH_LANES_NARROW : MAX_GRAPH_LANES,
  );
  const firstRow = graph.rows[0];
  const wipRow = showWip && firstRow ? projectRow(firstRow, laneCount) : undefined;
  // The WIP row shares the selection with commits; its id cannot collide with a hex hash.
  const wipSelected = selectedHash === WIP_NODE_ID;
  const activeSelection = wipSelected && !showWip ? null : selectedHash;
  const selectWip = useCallback(() => setSelectedHash(WIP_NODE_ID), []);
  const identityName = repo.identity?.name ?? null;
  const identityEmail = repo.identity?.email ?? null;
  const items = useMemo<ListItem[]>(() => {
    const identity = { name: identityName, email: identityEmail };
    const commitRows = showWip ? graph.rows.slice(1) : graph.rows;
    return repo.commits.flatMap((commit, index) => {
      const row = commitRows[index];
      if (!row) return [];
      const mine = isMine({ name: commit.authorName, email: commit.authorEmail }, identity);
      return [{ commit, graph: { row: projectRow(row, laneCount), laneCount }, mine }];
    });
  }, [repo.commits, graph, showWip, laneCount, identityName, identityEmail]);

  const searching = query.trim().length > 0;
  const matchIndices = useMemo(
    () =>
      searching
        ? items.flatMap((item, index) => (matchesQuery(item.commit, query) ? [index] : []))
        : [],
    [items, query, searching],
  );
  const matchedHashes = useMemo(
    () => new Set(matchIndices.map((index) => items[index]?.commit.hash)),
    [matchIndices, items],
  );
  const position = Math.min(matchPosition, Math.max(matchIndices.length - 1, 0));
  const focusedIndex = matchIndices[position] ?? NO_MATCH;
  const focusedHash = items[focusedIndex]?.commit.hash ?? null;

  const scrollToMatch = useCallback(
    (nextPosition: number) => {
      const index = matchIndices[nextPosition];
      if (index === undefined) return;
      setMatchPosition(nextPosition);
      listRef.current?.scrollToIndex({ index, viewPosition: MATCH_VIEW_POSITION, animated: true });
    },
    [matchIndices],
  );
  const nextMatch = useCallback(() => {
    if (matchIndices.length > 0) scrollToMatch((position + 1) % matchIndices.length);
  }, [matchIndices.length, position, scrollToMatch]);
  const previousMatch = useCallback(() => {
    if (matchIndices.length > 0) scrollToMatch((position - 1 + matchIndices.length) % matchIndices.length);
  }, [matchIndices.length, position, scrollToMatch]);
  // A query or scope change asks for one jump to the first match once matching results are in;
  // background refreshes leave the request unset, so they never move the view.
  const pendingJump = useRef(false);
  const onQueryChange = useCallback((next: string) => {
    pendingJump.current = true;
    setQuery(next);
    setMatchPosition(0);
  }, []);
  const onScopeChange = useCallback((next: LogScope) => {
    pendingJump.current = true;
    setScope(next);
    setMatchPosition(0);
  }, []);
  const waitingForLog = repo.loading || repo.updating;
  useEffect(() => {
    if (!pendingJump.current || waitingForLog) return;
    pendingJump.current = false;
    scrollToMatch(0);
  }, [scrollToMatch, waitingForLog]);
  // Rows drop their author and date columns when the detail pane takes width from the list,
  // or when every column would not fit beside a readable description.
  const tooTightForColumns = width !== null && width < wideLayoutMinWidth(laneCount);
  const condensed = narrow || activeSelection !== null || tooTightForColumns;

  const renderItem = useCallback<ListRenderItem<ListItem>>(
    ({ item }) => (
      <CommitRow
        commit={item.commit}
        graph={item.graph}
        theme={theme}
        compact={condensed}
        selected={item.commit.hash === selectedHash}
        mine={item.mine}
        now={now}
        dimmed={searching && !matchedHashes.has(item.commit.hash)}
        focused={item.commit.hash === focusedHash}
        onSelect={setSelectedHash}
      />
    ),
    [laneCount, theme, condensed, selectedHash, now, searching, matchedHashes, focusedHash],
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
    status && wipRow ? (
      <WipRow
        status={status}
        row={wipRow}
        laneCount={laneCount}
        theme={theme}
        selected={activeSelection === WIP_NODE_ID}
        compact={condensed}
        onPress={selectWip}
      />
    ) : null;

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
          ref={listRef}
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

  let detail = null;
  if (activeSelection === WIP_NODE_ID && status) {
    detail = (
      <WipDetail
        target={target}
        status={status}
        worktreeToken={repo.worktreeToken}
        theme={theme}
        onClose={narrow ? undefined : closeDetail}
      />
    );
  } else if (activeSelection !== null) {
    detail = (
      <CommitDetail
        key={activeSelection}
        target={target}
        hash={activeSelection}
        theme={theme}
        identity={repo.identity}
        onSelectCommit={setSelectedHash}
        onClose={narrow ? undefined : closeDetail}
      />
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface0 }} onLayout={onLayout}>
      {status ? (
        <StatusBar
          status={status}
          theme={theme}
          actions={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={showLegend ? "Hide legend" : "What do the colors and shapes mean?"}
              accessibilityState={{ expanded: showLegend }}
              onPress={toggleLegend}
              style={{ padding: SPACING.xs, borderRadius: RADIUS.chip, backgroundColor: showLegend ? colors.surface2 : "transparent" }}
            >
              <Icon name="Info" size={ICON_SIZE} color={colors.foregroundMuted} />
            </Pressable>
          }
        />
      ) : null}
      {showLegend ? <Legend theme={theme} identity={repo.identity} /> : null}
      <SearchBar
        theme={theme}
        query={query}
        onQueryChange={onQueryChange}
        matchCount={matchIndices.length}
        matchPosition={position}
        loadedCount={items.length}
        onPrevious={previousMatch}
        onNext={nextMatch}
        scope={scope}
        onScopeChange={onScopeChange}
        updating={repo.updating}
      />
      {narrow ? (
        <>
          {body}
          <Modal
            title={activeSelection === WIP_NODE_ID ? "Uncommitted changes" : "Commit"}
            open={detail !== null}
            onOpenChange={onModalOpenChange}
          >
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
