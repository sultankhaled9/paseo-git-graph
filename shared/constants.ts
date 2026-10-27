export const LOG_PAGE_SIZE = 200;
export const LOG_MAX_LIMIT = 5000;

export const GIT_TIMEOUT_MS = 15_000;
export const GIT_MAX_BUFFER_BYTES = 32 * 1024 * 1024;
export const DIFF_MAX_BYTES = 256 * 1024;
export const STATUS_MAX_FILES = 500;

export const REVISION_POLL_MS = 3_000;

export const MAX_PROJECTS = 100;
export const PROJECT_NAME_MAX_LENGTH = 100;
export const PROJECTS_SETTINGS_ID = "projects";

export const ROW_HEIGHT = 32;
export const LANE_WIDTH = 14;
export const NODE_SIZE = 10;
export const EDGE_THICKNESS = 2;

export const LANE_PALETTE: readonly string[] = [
  "#3b82f6",
  "#f97316",
  "#10b981",
  "#e11d48",
  "#a855f7",
  "#eab308",
  "#06b6d4",
  "#ec4899",
  "#84cc16",
  "#6366f1",
];

export const HASH_PATTERN = /^[0-9a-f]{7,64}$/;
