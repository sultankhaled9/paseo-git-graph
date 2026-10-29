/** The host wraps a handler's error as "Request failed: <message>" followed by request details. */
const HOST_PREFIX = /^Request failed:\s*/;
const HOST_DETAILS = /\s*requestType=\S+(\s+code=\S+)?\s*$/;

/** The handler's own message from an RPC error, without the host's wrapper. */
export function rpcErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  return error.message.replace(HOST_PREFIX, "").replace(HOST_DETAILS, "").trim() || fallback;
}
