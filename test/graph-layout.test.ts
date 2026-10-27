import { describe, expect, it } from "vitest";
import { type GraphCommit, type GraphEdge, layoutGraph } from "../shared/graph-layout";

function c(hash: string, ...parents: string[]): GraphCommit {
  return { hash, parents };
}

function columns(commits: readonly GraphCommit[]): number[] {
  return layoutGraph(commits).rows.map((row) => row.column);
}

function edgeKeys(edges: readonly GraphEdge[]): string[] {
  return edges.map((edge) => `${edge.half}:${edge.column}${edge.toNode ? "*" : ""}`).sort();
}

describe("layoutGraph", () => {
  it("keeps a linear history in one lane with one color", () => {
    const layout = layoutGraph([c("c", "b"), c("b", "a"), c("a")]);
    expect(layout.rows.map((row) => row.column)).toEqual([0, 0, 0]);
    expect(new Set(layout.rows.map((row) => row.color)).size).toBe(1);
    expect(layout.laneCount).toBe(1);
    expect(edgeKeys(layout.rows[0]?.edges ?? [])).toEqual(["bottom:0*"]);
    expect(edgeKeys(layout.rows[1]?.edges ?? [])).toEqual(["bottom:0*", "top:0*"]);
    expect(edgeKeys(layout.rows[2]?.edges ?? [])).toEqual(["top:0*"]);
  });

  it("opens a lane for a merge parent and converges at the fork point", () => {
    const layout = layoutGraph([c("m", "a", "b"), c("b", "r"), c("a", "r"), c("r")]);
    expect(layout.rows.map((row) => row.column)).toEqual([0, 1, 0, 0]);
    expect(layout.laneCount).toBe(2);
    expect(edgeKeys(layout.rows[0]?.edges ?? [])).toEqual(["bottom:0*", "bottom:1*"]);
    expect(edgeKeys(layout.rows[1]?.edges ?? [])).toEqual(["bottom:0", "bottom:1*", "top:0", "top:1*"]);
    expect(edgeKeys(layout.rows[3]?.edges ?? [])).toEqual(["top:0*", "top:1*"]);
  });

  it("gives the branch its own color and keeps it along the lane", () => {
    const layout = layoutGraph([c("m", "a", "b"), c("b", "r"), c("a", "r"), c("r")]);
    const [merge, branch, main] = layout.rows;
    expect(branch?.color).not.toBe(merge?.color);
    expect(main?.color).toBe(merge?.color);
  });

  it("lays out an octopus merge across new lanes", () => {
    const layout = layoutGraph([c("m", "a", "b", "d"), c("d", "r"), c("b", "r"), c("a", "r"), c("r")]);
    expect(layout.rows.map((row) => row.column)).toEqual([0, 2, 1, 0, 0]);
    expect(edgeKeys(layout.rows[0]?.edges ?? [])).toEqual(["bottom:0*", "bottom:1*", "bottom:2*"]);
    expect(layout.laneCount).toBe(3);
  });

  it("keeps unrelated root histories in separate lanes", () => {
    expect(columns([c("x", "y"), c("p", "q"), c("y"), c("q")])).toEqual([0, 1, 0, 1]);
  });

  it("joins a merge parent to a lane that is already waiting for it", () => {
    const layout = layoutGraph([c("m1", "a", "b"), c("m2", "b", "a"), c("a", "r"), c("b", "r"), c("r")]);
    expect(layout.rows.map((row) => row.column)).toEqual([0, 2, 0, 1, 0]);
    expect(edgeKeys(layout.rows[1]?.edges ?? [])).toEqual([
      "bottom:0*",
      "bottom:1",
      "bottom:2*",
      "top:0",
      "top:1",
    ]);
  });

  it("reuses the lowest free lane for a later branch tip", () => {
    const layout = layoutGraph([c("m", "a", "b"), c("b", "r"), c("a", "r"), c("r"), c("t", "s"), c("s")]);
    expect(layout.rows.map((row) => row.column)).toEqual([0, 1, 0, 0, 0, 0]);
  });

  it("does not reuse a lane freed in the same row for a merge parent", () => {
    const layout = layoutGraph([c("t1", "x"), c("t2", "x"), c("x", "p", "q"), c("q"), c("p")]);
    const merge = layout.rows[2];
    expect(merge?.column).toBe(0);
    expect(edgeKeys(merge?.edges ?? [])).toEqual(["bottom:0*", "bottom:2*", "top:0*", "top:1*"]);
  });

  it("leaves lanes open when parents are beyond the loaded page", () => {
    const layout = layoutGraph([c("b", "a")]);
    expect(edgeKeys(layout.rows[0]?.edges ?? [])).toEqual(["bottom:0*"]);
  });

  it("returns an empty layout for no commits", () => {
    expect(layoutGraph([])).toEqual({ rows: [], laneCount: 0 });
  });
});
