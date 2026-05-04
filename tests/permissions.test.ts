import { describe, it, expect } from "vitest";
import { PermissionManager } from "../src/permissions.js";
import { OperationLogger } from "../src/logger.js";
import { makeProject } from "./helpers.js";
import fs from "node:fs";
import path from "node:path";

describe("PermissionManager", () => {
  it("auto operation executes immediately", async () => {
    const { config } = makeProject();
    const pm = new PermissionManager(config);
    const result = await pm.request("docker_logs", "prod", "nginx", () => "ok");
    expect(result).toBe("ok");
  });

  it("confirm operation returns pending response", async () => {
    const { config } = makeProject();
    const pm = new PermissionManager(config);
    const result = (await pm.request("docker_restart", "prod", "nginx", () => "ok")) as {
      action_id: string;
      status: string;
      instruction: string;
    };
    expect(result.status).toBe("pending_confirmation");
    expect(result.action_id).toBeDefined();
    expect(result.instruction).toContain("confirm_action");
  });

  it("confirm executes pending action", async () => {
    const { config } = makeProject();
    const pm = new PermissionManager(config);
    const pending = (await pm.request("docker_restart", "prod", "nginx", () => "restarted")) as {
      action_id: string;
    };
    const final = await pm.confirm(pending.action_id);
    expect(final).toBe("restarted");
  });

  it("confirm twice rejects", async () => {
    const { config } = makeProject();
    const pm = new PermissionManager(config);
    const pending = (await pm.request("docker_restart", "prod", "nginx", () => "ok")) as {
      action_id: string;
    };
    await pm.confirm(pending.action_id);
    await expect(pm.confirm(pending.action_id)).rejects.toThrow(/Unknown action_id/);
  });

  it("logger captures auto + pending + approved", async () => {
    const { config, dir } = makeProject();
    const log = new OperationLogger(dir);
    const pm = new PermissionManager(config, log);
    await pm.request("docker_logs", "prod", "nginx", () => "ok");
    const pending = (await pm.request("docker_restart", "prod", "x", () => "y")) as {
      action_id: string;
    };
    await pm.confirm(pending.action_id);
    await new Promise((r) => setTimeout(r, 50));
    const content = fs.readFileSync(path.join(dir, "server-mcp.log"), "utf8");
    expect(content).toContain("[AUTO]");
    expect(content).toContain("→ pending");
    expect(content).toContain("→ approved");
  });
});
