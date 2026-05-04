import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import YAML from "yaml";
import { Config } from "../src/config.js";
import { makeProject } from "./helpers.js";

describe("Config", () => {
  it("loads project.yaml + secrets.yaml", () => {
    const { config } = makeProject();
    expect(config.servers.prod.host).toBe("1.2.3.4");
    expect(config.getSecret("prod", "password")).toBe("secret123");
  });

  it("missing project.yaml throws", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-empty-"));
    expect(() => new Config(tmp)).toThrow(/project.yaml not found/);
  });

  it("missing secret throws with key + server in message", () => {
    const { config } = makeProject();
    expect(() => config.getSecret("prod", "missing")).toThrow(/missing.*prod/);
  });

  it("auto-adds secrets.yaml to .gitignore", () => {
    const { dir } = makeProject();
    const gi = fs.readFileSync(path.join(dir, ".gitignore"), "utf8");
    expect(gi).toContain("secrets.yaml");
  });

  it("getOperationMode returns 'confirm' by default", () => {
    const { config } = makeProject();
    expect(config.getOperationMode("unknown_op")).toBe("confirm");
  });

  it("getDBConfig throws for unknown server", () => {
    const { config } = makeProject();
    expect(() => config.getDBConfig("missing")).toThrow();
  });

  it("logging settings parsed", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-log-"));
    fs.writeFileSync(
      path.join(dir, "project.yaml"),
      YAML.stringify({ servers: {}, operations: {}, db: {}, logging: { retention_days: 7 } }),
    );
    const config = new Config(dir);
    expect(config.logging.retention_days).toBe(7);
  });
});
