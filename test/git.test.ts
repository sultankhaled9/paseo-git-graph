import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { runGitRaw } from "../server/git";

/** Larger than any OS pipe buffer, so the write is still pending when git exits. */
const UNREAD_INPUT_BYTES = 4 * 1024 * 1024;

describe("runGitRaw", () => {
  it("resolves from git's exit code when git exits without reading its input", async () => {
    const output = await runGitRaw(tmpdir(), ["--version"], { input: Buffer.alloc(UNREAD_INPUT_BYTES) });
    expect(output.toString("utf8")).toMatch(/^git version /);
  });
});
