import type { CommitSummary } from "./contracts";

/** Case-insensitive match on subject, author name or email, or a hash prefix. */
export function matchesQuery(commit: CommitSummary, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return true;
  return (
    commit.subject.toLowerCase().includes(needle) ||
    commit.authorName.toLowerCase().includes(needle) ||
    commit.authorEmail.toLowerCase().includes(needle) ||
    commit.hash.startsWith(needle)
  );
}
