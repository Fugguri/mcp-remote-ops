import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import YAML from "yaml";
import { Config } from "../src/config.js";

export function makeProject(extra: { db?: Record<string, unknown>; secrets?: Record<string, Record<string, string>> } = {}): {
  dir: string;
  config: Config;
} {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-remote-ops-"));
  const project = {
    servers: { prod: { host: "1.2.3.4", user: "deploy", project_path: "/var/www/app" } },
    operations: {
      docker_logs: "auto",
      docker_status: "auto",
      docker_restart: "confirm",
      ssh_exec: "confirm",
      sync: "confirm",
      db_select: "auto",
      db_update: "confirm",
      db_delete: "confirm",
      db_insert: "confirm",
    },
    db: extra.db ?? {
      prod: { host: "localhost", port: 5432, database: "app_db" },
    },
  };
  const secrets = extra.secrets ?? { prod: { password: "secret123" } };
  fs.writeFileSync(path.join(dir, "project.yaml"), YAML.stringify(project));
  fs.writeFileSync(path.join(dir, "secrets.yaml"), YAML.stringify(secrets));
  return { dir, config: new Config(dir) };
}
