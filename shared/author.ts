import type { Identity } from "./contracts";

export interface Author {
  name: string;
  email: string;
}

/**
 * True when the configured git identity wrote the commit. Email decides when configured,
 * case-insensitively; the name is only a fallback for repositories without an email.
 */
export function isMine(author: Author, identity: Identity | undefined): boolean {
  if (!identity) return false;
  if (identity.email) return author.email.toLowerCase() === identity.email.toLowerCase();
  if (identity.name) return author.name === identity.name;
  return false;
}
