import { describe, expect, it } from "vitest";
import { isStillListed } from "../shared/repo-selection";

const listed = [{ relativePath: "ai-transcriber-backend" }, { relativePath: "ai-transcriber-frontend" }];

describe("isStillListed", () => {
  it("keeps a repository the latest complete scan lists", () => {
    expect(isStillListed("ai-transcriber-backend", { scanned: true, truncated: false, repos: listed })).toBe(true);
  });

  it("releases a repository a complete scan no longer lists", () => {
    expect(isStillListed("removed", { scanned: true, truncated: false, repos: listed })).toBe(false);
  });

  it("keeps the selection while the scan is pending or failed", () => {
    expect(isStillListed("removed", { scanned: false, truncated: false, repos: [] })).toBe(true);
  });

  it("keeps the selection when the scan was truncated", () => {
    expect(isStillListed("past-the-limit", { scanned: true, truncated: true, repos: listed })).toBe(true);
  });
});
