const SHORT_HASH_LENGTH = 7;
const PAD_WIDTH = 2;
const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const JUST_NOW_SECONDS = 45;
const RELATIVE_DAYS_LIMIT = 7;
const HASH_MULTIPLIER = 31;
const UINT32_MASK = 0xffffffff;
const MAX_INITIALS = 2;

function pad(value: number): string {
  return String(value).padStart(PAD_WIDTH, "0");
}

export function shortHash(hash: string): string {
  return hash.slice(0, SHORT_HASH_LENGTH);
}

/** Formats an ISO timestamp as local "YYYY-MM-DD HH:mm". */
export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** "just now", "5m ago", "3h ago", "2d ago", then the local calendar date for anything older than a week. */
export function formatRelative(iso: string, now: number): string {
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return iso;
  const seconds = Math.max(0, Math.round((now - time) / MS_PER_SECOND));
  if (seconds < JUST_NOW_SECONDS) return "just now";
  const minutes = Math.round(seconds / SECONDS_PER_MINUTE);
  if (minutes < MINUTES_PER_HOUR) return `${Math.max(1, minutes)}m ago`;
  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  if (hours < HOURS_PER_DAY) return `${hours}h ago`;
  const days = Math.floor(hours / HOURS_PER_DAY);
  if (days < RELATIVE_DAYS_LIMIT) return `${days}d ago`;
  const date = formatDate(iso);
  return date.slice(0, date.indexOf(" "));
}

/** Up to two initials from a display name, e.g. "Sultan Almansour" -> "SA". */
export function initials(name: string): string {
  const letters = name
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase());
  if (letters.length === 0) return "?";
  if (letters.length === 1) return name.trim().slice(0, MAX_INITIALS).toUpperCase();
  return `${letters[0] ?? ""}${letters[letters.length - 1] ?? ""}`;
}

/** A stable, non-negative number for a string, used to give each author a consistent color. */
export function stableHash(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * HASH_MULTIPLIER + value.charCodeAt(index)) & UINT32_MASK;
  }
  return hash >>> 0;
}

/** "1 commit", "3 commits"; pass the plural when it is not the singular plus "s". */
export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
