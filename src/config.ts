import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";

export const CONFIG_DIR_NAME = ".mcp-remote-ops";

export function resolveConfigDir(projectPath: string): string {
  const dedicated = path.join(projectPath, CONFIG_DIR_NAME);
  if (fs.existsSync(path.join(dedicated, "project.yaml"))) return dedicated;
  return projectPath;
}

export interface ServerEntry {
  host: string;
  user: string;
  port?: number;
  project_path?: string;
}

export interface DBEntry {
  type?: "postgres" | "postgresql" | "mysql" | "mariadb" | "sqlite";
  host?: string;
  port?: number;
  database?: string;
  user?: string;
}

export interface LoggingSettings {
  retention_days?: number;
  max_size_mb?: number;
  backup_count?: number;
}

export class Config {
  readonly projectPath: string;
  readonly servers: Record<string, ServerEntry>;
  readonly operations: Record<string, "auto" | "confirm">;
  readonly db: Record<string, DBEntry>;
  readonly logging: LoggingSettings;
  private readonly secrets: Record<string, Record<string, string>>;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
    const configDir = resolveConfigDir(projectPath);
    const projectFile = path.join(configDir, "project.yaml");
    if (!fs.existsSync(projectFile)) {
      throw new Error(
        `project.yaml not found. Looked in ${path.join(projectPath, CONFIG_DIR_NAME)} and ${projectPath}`,
      );
    }
    const data = YAML.parse(fs.readFileSync(projectFile, "utf8")) ?? {};
    this.servers = data.servers ?? {};
    this.operations = data.operations ?? {};
    this.db = data.db ?? {};
    this.logging = data.logging ?? {};

    const secretsFile = path.join(configDir, "secrets.yaml");
    this.secrets = fs.existsSync(secretsFile)
      ? YAML.parse(fs.readFileSync(secretsFile, "utf8")) ?? {}
      : {};

    this.ensureGitignore();
  }

  getSecret(server: string, key: string): string {
    const value = this.secrets[server]?.[key];
    if (value === undefined) {
      throw new Error(`Secret '${key}' for server '${server}' not found`);
    }
    return value;
  }

  hasSecret(server: string, key: string): boolean {
    return this.secrets[server]?.[key] !== undefined;
  }

  getOperationMode(operation: string): "auto" | "confirm" {
    return this.operations[operation] ?? "confirm";
  }

  getDBConfig(server: string): DBEntry {
    const cfg = this.db[server];
    if (!cfg) throw new Error(`DB config for server '${server}' not found`);
    return cfg;
  }

  private ensureGitignore() {
    const gitignore = path.join(this.projectPath, ".gitignore");
    const lines = fs.existsSync(gitignore)
      ? fs.readFileSync(gitignore, "utf8").split("\n")
      : [];
    const needed: string[] = [];
    if (!lines.some((l) => l.includes("secrets.yaml"))) needed.push("secrets.yaml");
    if (!lines.some((l) => l.includes(CONFIG_DIR_NAME))) {
      needed.push(`${CONFIG_DIR_NAME}/secrets.yaml`);
    }
    if (needed.length > 0) {
      fs.appendFileSync(gitignore, "\n" + needed.join("\n") + "\n");
    }
  }
}
