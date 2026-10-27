import { memo } from "react";
import { View } from "react-native";
import { EDGE_THICKNESS, LANE_WIDTH, NODE_SIZE, ROW_HEIGHT } from "../../shared/constants";
import type { GraphEdge } from "../../shared/graph-layout";
import { laneColor } from "../tokens";

const HALF_ROW = ROW_HEIGHT / 2;
const RING_WIDTH = 2;

function centerX(column: number): number {
  return column * LANE_WIDTH + LANE_WIDTH / 2;
}

interface LaneCellProps {
  column: number;
  color: number;
  edges: readonly GraphEdge[];
  laneCount: number;
  /** Draws the node as a ring filled with this color, used for merges and the WIP row. */
  hollowFill?: string;
}

/** Draws one row of the graph: half-row verticals, centre horizontals, and the node. */
export const LaneCell = memo(function LaneCell({
  column,
  color,
  edges,
  laneCount,
  hollowFill,
}: LaneCellProps) {
  const nodeColor = laneColor(color);
  const nodeX = centerX(column);
  return (
    <View style={{ width: laneCount * LANE_WIDTH, height: ROW_HEIGHT }}>
      {edges.map((edge) => {
        const x = centerX(edge.column);
        const stroke = laneColor(edge.color);
        const vertical = (
          <View
            key={`${edge.half}-${edge.column}-v`}
            style={{
              position: "absolute",
              left: x - EDGE_THICKNESS / 2,
              top: edge.half === "top" ? 0 : HALF_ROW,
              width: EDGE_THICKNESS,
              height: HALF_ROW,
              backgroundColor: stroke,
            }}
          />
        );
        if (!edge.toNode || edge.column === column) return vertical;
        return [
          vertical,
          <View
            key={`${edge.half}-${edge.column}-h`}
            style={{
              position: "absolute",
              left: Math.min(x, nodeX) - EDGE_THICKNESS / 2,
              top: HALF_ROW - EDGE_THICKNESS / 2,
              width: Math.abs(x - nodeX) + EDGE_THICKNESS,
              height: EDGE_THICKNESS,
              backgroundColor: stroke,
            }}
          />,
        ];
      })}
      <View
        style={{
          position: "absolute",
          left: nodeX - NODE_SIZE / 2,
          top: HALF_ROW - NODE_SIZE / 2,
          width: NODE_SIZE,
          height: NODE_SIZE,
          borderRadius: NODE_SIZE / 2,
          backgroundColor: hollowFill ?? nodeColor,
          borderWidth: hollowFill ? RING_WIDTH : 0,
          borderColor: nodeColor,
        }}
      />
    </View>
  );
});
