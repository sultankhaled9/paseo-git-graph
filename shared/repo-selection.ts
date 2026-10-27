export interface RepoScanState {
  scanned: boolean;
  truncated: boolean;
  repos: readonly { relativePath: string }[];
}

/**
 * Whether a selected repository should stay selected. Absence only proves removal after a
 * complete, successful scan; a pending, failed, or truncated scan keeps the selection.
 */
export function isStillListed(relativePath: string, scan: RepoScanState): boolean {
  if (!scan.scanned || scan.truncated) return true;
  return scan.repos.some((repo) => repo.relativePath === relativePath);
}
