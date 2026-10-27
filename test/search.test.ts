import { describe, expect, it } from "vitest";
import type { CommitSummary } from "../shared/contracts";
import { matchesQuery } from "../shared/search";

const commit: CommitSummary = {
  hash: "3976413abcdef0123456789abcdef0123456789a",
  parents: [],
  authorName: "Sultan Almansour",
  authorEmail: "Salmansour@humain.com",
  authorDate: "2026-10-27T10:00:00Z",
  subject: "Fix null check in Parser",
  refs: [],
};

describe("matchesQuery", () => {
  it("matches subject and author case-insensitively", () => {
    expect(matchesQuery(commit, "parser")).toBe(true);
    expect(matchesQuery(commit, "SULTAN")).toBe(true);
    expect(matchesQuery(commit, "humain.com")).toBe(true);
  });

  it("matches a hash prefix only", () => {
    expect(matchesQuery(commit, "397641")).toBe(true);
    expect(matchesQuery(commit, "abcdef")).toBe(false);
  });

  it("treats a blank query as matching everything and trims input", () => {
    expect(matchesQuery(commit, "   ")).toBe(true);
    expect(matchesQuery(commit, "  null check ")).toBe(true);
    expect(matchesQuery(commit, "nothing like this")).toBe(false);
  });
});
