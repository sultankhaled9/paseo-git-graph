const SHORT_HASH_LENGTH = 7;
const PAD_WIDTH = 2;

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
