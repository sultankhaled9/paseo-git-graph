export interface GraphCommit {
  hash: string;
  parents: readonly string[];
}

/**
 * A vertical half-row line in `column`. `top` runs from the row top to the node centre,
 * `bottom` from the centre to the row bottom. When `toNode` is set and the column differs
 * from the node's, the renderer also draws a horizontal line at the centre to the node.
 */
export interface GraphEdge {
  half: "top" | "bottom";
  column: number;
  color: number;
  toNode: boolean;
}

export interface GraphRow {
  column: number;
  color: number;
  edges: GraphEdge[];
}

export interface GraphLayout {
  rows: GraphRow[];
  laneCount: number;
}

interface Lane {
  hash: string;
  color: number;
}

type Lanes = (Lane | null)[];

function firstFree(lanes: Lanes, reserved: Lanes, exclude: number): number {
  for (let index = 0; index < lanes.length; index += 1) {
    if (index !== exclude && lanes[index] === null && (reserved[index] ?? null) === null) return index;
  }
  return Math.max(lanes.length, exclude + 1);
}

function place(lanes: Lanes, index: number, lane: Lane): void {
  while (lanes.length < index) lanes.push(null);
  lanes[index] = lane;
}

function trimTrailing(lanes: Lanes): void {
  while (lanes.length > 0 && lanes[lanes.length - 1] === null) lanes.pop();
}

/**
 * Assigns lanes to topologically ordered commits. The first parent continues the commit's
 * lane; other parents join a lane already waiting for them or open a new one. Lanes freed
 * in a row are not reused by that row's merge parents, so converging and diverging lines
 * never overlap. Colors are open-ended ids; callers map them onto a palette.
 */
export function layoutGraph(commits: readonly GraphCommit[]): GraphLayout {
  let lanes: Lanes = [];
  let nextColor = 0;
  let laneCount = 0;
  const rows: GraphRow[] = [];

  for (const commit of commits) {
    const edges: GraphEdge[] = [];
    let column = lanes.findIndex((lane) => lane?.hash === commit.hash);
    let color: number;
    const waiting = column >= 0 ? lanes[column] : null;
    if (waiting) {
      color = waiting.color;
    } else {
      column = firstFree(lanes, [], -1);
      color = nextColor;
      nextColor += 1;
    }

    lanes.forEach((lane, index) => {
      if (lane) {
        edges.push({ half: "top", column: index, color: lane.color, toNode: lane.hash === commit.hash });
      }
    });

    const incoming = lanes;
    const outgoing: Lanes = incoming.map((lane) => (lane?.hash === commit.hash ? null : lane));
    const [firstParent, ...mergeParents] = commit.parents;
    if (firstParent !== undefined) place(outgoing, column, { hash: firstParent, color });

    const mergeColumns = new Set<number>();
    for (const parent of mergeParents) {
      let target = outgoing.findIndex((lane) => lane?.hash === parent);
      if (target < 0) {
        target = firstFree(outgoing, incoming, column);
        place(outgoing, target, { hash: parent, color: nextColor });
        nextColor += 1;
      }
      const lane = outgoing[target];
      if (lane && target !== column && !mergeColumns.has(target)) {
        mergeColumns.add(target);
        edges.push({ half: "bottom", column: target, color: lane.color, toNode: true });
      }
    }

    outgoing.forEach((lane, index) => {
      if (!lane || mergeColumns.has(index)) return;
      edges.push({ half: "bottom", column: index, color: lane.color, toNode: index === column });
    });

    trimTrailing(outgoing);
    laneCount = Math.max(laneCount, incoming.length, outgoing.length, column + 1);
    rows.push({ column, color, edges });
    lanes = outgoing;
  }

  return { rows, laneCount };
}

/** Commit hashes are hex, so this id can never collide with a real commit. */
export const WIP_NODE_ID = "wip";

/**
 * Prepends uncommitted work as a virtual commit whose parent is HEAD, so the layout gives it
 * its own lane and connects it to HEAD even when newer commits on other branches sit between.
 */
export function withWorkInProgress(commits: readonly GraphCommit[], headOid: string | null): GraphCommit[] {
  return [{ hash: WIP_NODE_ID, parents: headOid ? [headOid] : [] }, ...commits];
}
