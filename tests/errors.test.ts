import { describe, it, expect } from "vitest";
import { classifyError } from "../src/errors.js";

describe("classifyError", () => {
  it("classifies missing secret with env var hint", () => {
    const e = new Error("Secret 'password' for server 'prod' not found");
    const r = classifyError(e, { server: "prod" });
    expect(r.kind).toBe("missing_credentials");
    expect(r.message).toContain("MCP_REMOTE_OPS_PROD_PASSWORD");
    expect(r.hint).toContain("secrets.yaml");
  });

  it("classifies unknown server alias", () => {
    const e = new Error("Server 'staging' not found in project.yaml");
    const r = classifyError(e, { server: "staging" });
    expect(r.kind).toBe("server_not_configured");
    expect(r.hint).toContain("list_servers");
  });

  it("classifies SSH auth failure", () => {
    const e = new Error("All configured authentication methods failed");
    const r = classifyError(e, { server: "prod" });
    expect(r.kind).toBe("auth_failed");
    expect(r.hint).toContain("password/key");
  });

  it("classifies connection refused", () => {
    const e = new Error("connect ECONNREFUSED 1.2.3.4:22");
    const r = classifyError(e, { server: "prod" });
    expect(r.kind).toBe("connection_failed");
  });

  it("classifies host unreachable on DNS fail", () => {
    const e = new Error("getaddrinfo ENOTFOUND bad.host.example");
    const r = classifyError(e, { server: "prod" });
    expect(r.kind).toBe("host_unreachable");
  });

  it("classifies DDL block", () => {
    const e = new Error("DDL operations are not allowed: DROP TABLE x");
    const r = classifyError(e);
    expect(r.kind).toBe("ddl_blocked");
    expect(r.hint).toContain("migration");
  });

  it("classifies expired action_id", () => {
    const e = new Error("Unknown action_id: abc");
    const r = classifyError(e);
    expect(r.kind).toBe("unknown_action");
    expect(r.hint).toContain("fresh action_id");
  });

  it("falls back to internal for unrecognized error", () => {
    const r = classifyError(new Error("something weird happened"));
    expect(r.kind).toBe("internal");
    expect(r.message).toBe("something weird happened");
  });
});
