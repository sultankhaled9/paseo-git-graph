import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { GIT_MAX_BUFFER_BYTES, GIT_STDERR_MAX_CHARS, GIT_TIMEOUT_MS } from "../shared/constants";

const execFileAsync = promisify(execFile);

// fsmonitor=false stops a repository-configured hook command from running during status.
const GIT_CONFIG_ARGS: readonly string[] = [
  "-c",
  "core.quotepath=off",
  "-c",
  "core.fsmonitor=false",
  "-c",
  "color.ui=false",
];

const EXIT_CODE_NOT_FOUND = 1;

export class GitError extends Error {
  constructor(
    message: string,
    readonly exitCode: number | null,
    readonly stderr: string,
  ) {
    super(message);
    this.name = "GitError";
  }
}

function gitEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    GIT_TERMINAL_PROMPT: "0",
    GIT_OPTIONAL_LOCKS: "0",
    GIT_LITERAL_PATHSPECS: "1",
  };
}

function firstLine(text: string): string {
  return text.trim().split("\n")[0] ?? "";
}

function toGitError(error: unknown): GitError {
  if (!(error instanceof Error)) return new GitError("git failed", null, "");
  const stderr = "stderr" in error && typeof error.stderr === "string" ? error.stderr : "";
  const exitCode = "code" in error && typeof error.code === "number" ? error.code : null;
  return new GitError(firstLine(stderr) || error.message, exitCode, stderr);
}

export async function runGit(cwd: string, args: readonly string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", [...GIT_CONFIG_ARGS, ...args], {
      cwd,
      env: gitEnv(),
      encoding: "utf8",
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: GIT_MAX_BUFFER_BYTES,
    });
    return stdout;
  } catch (error) {
    throw toGitError(error);
  }
}

/** Returns "" when git exits with 1, the "not found" result of symbolic-ref -q and rev-parse -q --verify. */
export async function runGitOptional(cwd: string, args: readonly string[]): Promise<string> {
  try {
    return await runGit(cwd, args);
  } catch (error) {
    if (error instanceof GitError && error.exitCode === EXIT_CODE_NOT_FOUND) return "";
    throw error;
  }
}

export interface CappedOutput {
  text: string;
  truncated: boolean;
}

const SUCCESS_EXIT_CODES: readonly number[] = [0];

/** `okExitCodes` admits commands such as `diff --no-index` that exit 1 to mean "differences found". */
export function runGitCapped(
  cwd: string,
  args: readonly string[],
  maxBytes: number,
  okExitCodes: readonly number[] = SUCCESS_EXIT_CODES,
): Promise<CappedOutput> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", [...GIT_CONFIG_ARGS, ...args], {
      cwd,
      env: gitEnv(),
      timeout: GIT_TIMEOUT_MS,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const chunks: Buffer[] = [];
    let size = 0;
    let truncated = false;
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      if (truncated) return;
      const remaining = maxBytes - size;
      if (chunk.length > remaining) {
        chunks.push(chunk.subarray(0, remaining));
        size = maxBytes;
        truncated = true;
        child.kill();
        return;
      }
      chunks.push(chunk);
      size += chunk.length;
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      if (stderr.length < GIT_STDERR_MAX_CHARS) stderr += chunk;
    });
    child.on("error", (error) => reject(toGitError(error)));
    child.on("close", (code, signal) => {
      if (!truncated && (code === null || !okExitCodes.includes(code))) {
        const reason = signal ? `git stopped by ${signal}` : `git exited with code ${code}`;
        reject(new GitError(firstLine(stderr) || reason, code, stderr));
        return;
      }
      const text = Buffer.concat(chunks).toString("utf8");
      resolve({ text: truncated ? text.slice(0, text.lastIndexOf("\n") + 1) : text, truncated });
    });
  });
}
