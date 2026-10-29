import { describe, expect, it } from "vitest";
import { rpcErrorMessage } from "../shared/rpc-error";

describe("rpcErrorMessage", () => {
  it("strips the host's request wrapper", () => {
    const error = new Error("Request failed: Switching would overwrite a.txt. requestType=plugin.rpc.invoke.request code=handler_error");
    expect(rpcErrorMessage(error, "x")).toBe("Switching would overwrite a.txt.");
    expect(rpcErrorMessage(new Error("Request failed: Nope.\nrequestType=plugin.rpc.invoke.request code=handler_error"), "x")).toBe("Nope.");
  });

  it("keeps plain messages and falls back for non-errors or empty text", () => {
    expect(rpcErrorMessage(new Error("Plain."), "x")).toBe("Plain.");
    expect(rpcErrorMessage("oops", "fallback")).toBe("fallback");
    expect(rpcErrorMessage(new Error("Request failed: requestType=a code=b"), "fallback")).toBe("fallback");
  });
});
