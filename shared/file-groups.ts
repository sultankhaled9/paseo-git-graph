export type FileKind = "code" | "data" | "text" | "image" | "config" | "script" | "other";
export type ChangeBadge = "NEW" | "EDITED" | "DELETED" | "RENAMED" | "COPIED" | "CONFLICT" | "TYPE CHANGED";

const KINDS_BY_EXTENSION: Readonly<Record<string, FileKind>> = {
  ts: "code", tsx: "code", js: "code", jsx: "code", mjs: "code", cjs: "code", py: "code", go: "code",
  rs: "code", java: "code", kt: "code", swift: "code", c: "code", cpp: "code", h: "code", cs: "code",
  rb: "code", php: "code", html: "code", css: "code", scss: "code", vue: "code", svelte: "code", sql: "code",
  json: "data", yaml: "data", yml: "data", toml: "data", xml: "data", csv: "data",
  md: "text", txt: "text", rst: "text",
  png: "image", jpg: "image", jpeg: "image", gif: "image", svg: "image", webp: "image", ico: "image",
  sh: "script", bash: "script", zsh: "script", ps1: "script",
};
const CONFIG_NAMES = new Set([".env", ".gitignore", ".editorconfig", "dockerfile", "makefile", ".npmrc", ".prettierrc"]);
const EXTENSION_SEPARATOR = ".";
const PATH_SEPARATOR = "/";
const ROOT_FOLDER = "";

export function fileName(path: string): string {
  return path.slice(path.lastIndexOf(PATH_SEPARATOR) + 1);
}

export function folderOf(path: string): string {
  const index = path.lastIndexOf(PATH_SEPARATOR);
  return index < 0 ? ROOT_FOLDER : path.slice(0, index);
}

/** A broad file type from the name, used to pick the file's icon. */
export function fileKind(path: string): FileKind {
  const name = fileName(path).toLowerCase();
  if (CONFIG_NAMES.has(name) || name.startsWith(".env")) return "config";
  const dot = name.lastIndexOf(EXTENSION_SEPARATOR);
  if (dot <= 0) return "other";
  return KINDS_BY_EXTENSION[name.slice(dot + 1)] ?? "other";
}

const BADGES_BY_WORD: Readonly<Record<string, ChangeBadge>> = {
  new: "NEW",
  added: "NEW",
  modified: "EDITED",
  deleted: "DELETED",
  renamed: "RENAMED",
  copied: "COPIED",
  conflict: "CONFLICT",
  "type changed": "TYPE CHANGED",
};

/** The card badge for a plain change word ("modified" -> "EDITED"); unknown words read as edited. */
export function changeBadge(word: string): ChangeBadge {
  return BADGES_BY_WORD[word] ?? "EDITED";
}

export interface FolderGroup<Item> {
  folder: string;
  items: Item[];
}

/** Groups items by folder (root first, then alphabetical), keeping each folder's original order. */
export function groupByFolder<Item>(items: readonly Item[], pathOf: (item: Item) => string): FolderGroup<Item>[] {
  const groups = new Map<string, Item[]>();
  for (const item of items) {
    const folder = folderOf(pathOf(item));
    const list = groups.get(folder);
    if (list) list.push(item);
    else groups.set(folder, [item]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === ROOT_FOLDER ? -1 : b === ROOT_FOLDER ? 1 : a.localeCompare(b)))
    .map(([folder, list]) => ({ folder, items: list }));
}
