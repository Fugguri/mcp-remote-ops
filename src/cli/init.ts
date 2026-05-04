#!/usr/bin/env node
/**
 * mcp-remote-ops init <project_path>
 *
 * Парсит .env / .env.make в проекте, создаёт project.yaml + secrets.yaml,
 * регистрирует MCP в .claude/settings.local.json.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import YAML from "yaml";
import { ask, confirm } from "./prompt.js";

interface Env {
  [key: string]: string;
}

interface ProjectYaml {
  servers: Record<string, { host: string; user: string; port?: number; project_path: string }>;
  operations: Record<string, "auto" | "confirm">;
  logging: { retention_days: number };
  db?: Record<string, Record<string, unknown>>;
}

interface SecretsYaml {
  [server: string]: { password?: string; ssh_key_path?: string; db_password?: string };
}

const DEFAULT_OPERATIONS: Record<string, "auto" | "confirm"> = {
  docker_logs: "auto",
  docker_status: "auto",
  docker_restart: "confirm",
  ssh_exec: "confirm",
  sync: "confirm",
  db_select: "auto",
  db_update: "confirm",
  db_delete: "confirm",
  db_insert: "confirm",
};

export function parseEnv(filePath: string): Env {
  const env: Env = {};
  for (const raw of fs.readFileSync(filePath, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let value = m[2].trim();
    if (value.length >= 2 && (value[0] === '"' || value[0] === "'") && value.at(-1) === value[0]) {
      value = value.slice(1, -1);
    }
    env[m[1]] = value;
  }
  return env;
}

export function findEnvFile(project: string): string | null {
  for (const name of [".env.make", ".env", ".env.local"]) {
    const p = path.join(project, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export function detectDBType(env: Env): string {
  const explicit = (env.DB_TYPE ?? "").toLowerCase();
  if (explicit) return explicit;
  if (env.DB_PATH && !env.DB_HOST) return "sqlite";
  const port = env.DB_PORT ?? "";
  if (port === "5432") return "postgres";
  if (port === "3306") return "mariadb";
  const name = (env.DB_NAME ?? "").toLowerCase();
  if (name.includes("maria") || name.includes("mysql")) return "mariadb";
  if (name.includes("postgres") || name.includes("pg")) return "postgres";
  if (port && port !== "5432") return "mariadb";
  return "postgres";
}

export function defaultPort(dbType: string): number {
  return ({ postgres: 5432, mysql: 3306, mariadb: 3306 } as Record<string, number>)[dbType] ?? 5432;
}

export function buildConfigs(env: Env): { project: ProjectYaml; secrets: SecretsYaml } {
  const alias = "prod";
  const project: ProjectYaml = {
    servers: {
      [alias]: {
        host: env.SERVER_HOST ?? "",
        user: env.SERVER_USER ?? "root",
        project_path: env.SERVER_PATH ?? "~",
      },
    },
    operations: { ...DEFAULT_OPERATIONS },
    logging: { retention_days: 30 },
  };
  if (env.SSH_PORT && env.SSH_PORT !== "22") {
    project.servers[alias].port = Number(env.SSH_PORT);
  }

  if (env.DB_HOST || env.DB_PATH) {
    const dbType = detectDBType(env);
    if (dbType === "sqlite") {
      project.db = { [alias]: { type: "sqlite", database: env.DB_PATH } };
    } else {
      const dbCfg: Record<string, unknown> = {
        type: dbType,
        host: env.DB_HOST,
        port: Number(env.DB_PORT ?? defaultPort(dbType)),
        database: env.DB_NAME ?? "",
      };
      if (env.DB_USER) dbCfg.user = env.DB_USER;
      project.db = { [alias]: dbCfg };
    }
  }

  const secrets: SecretsYaml = { [alias]: {} };
  if (env.SSH_KEY_PATH) secrets[alias].ssh_key_path = env.SSH_KEY_PATH;
  if (env.SSH_PASSWORD) secrets[alias].password = env.SSH_PASSWORD;
  if (env.DB_PASSWORD && env.DB_PASSWORD !== env.SSH_PASSWORD) {
    secrets[alias].db_password = env.DB_PASSWORD;
  }

  return { project, secrets };
}

function writeYaml(filePath: string, data: unknown) {
  fs.writeFileSync(filePath, YAML.stringify(data, { lineWidth: 0 }));
}

function registerMCP(projectPath: string, packageRoot: string) {
  const claudeDir = path.join(projectPath, ".claude");
  fs.mkdirSync(claudeDir, { recursive: true });
  const settingsFile = path.join(claudeDir, "settings.local.json");
  const settings = fs.existsSync(settingsFile)
    ? JSON.parse(fs.readFileSync(settingsFile, "utf8"))
    : {};
  settings.mcpServers ??= {};
  const serverScript = path.join(packageRoot, "dist", "server.js");
  settings.mcpServers["remote-ops"] = {
    command: "node",
    args: [serverScript],
    env: { PROJECT_PATH: projectPath },
  };
  fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
  return settingsFile;
}

function findPackageRoot(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  while (dir !== "/" && dir !== ".") {
    if (fs.existsSync(path.join(dir, "package.json"))) return dir;
    dir = path.dirname(dir);
  }
  throw new Error("package root not found");
}

function parseArgs(argv: string[]): { target: string; nonInteractive: boolean } {
  const args = argv.slice(2);
  const nonInteractive = args.includes("--yes") || args.includes("-y") || !!process.env.MCP_REMOTE_OPS_YES;
  const positional = args.find((a) => !a.startsWith("-"));
  return {
    target: positional ? path.resolve(positional) : process.cwd(),
    nonInteractive,
  };
}

async function fillSecretsInteractively(
  project: ProjectYaml,
  secrets: SecretsYaml,
): Promise<void> {
  const alias = "prod";
  const srv = project.servers[alias];

  console.log("\n=== Server (SSH) ===");
  srv.host = await ask("SSH host", { default: srv.host, required: true });
  srv.user = await ask("SSH user", { default: srv.user, required: true });
  const port = await ask("SSH port", { default: String(srv.port ?? 22) });
  if (port && port !== "22") srv.port = Number(port);
  srv.project_path = await ask("Project path on server", { default: srv.project_path });

  console.log("\n=== SSH auth ===");
  const useKey = secrets[alias].ssh_key_path
    ? await confirm("Use SSH key (already detected)?", true)
    : await confirm("Use SSH key instead of password?", false);

  if (useKey) {
    const keyPath = await ask("Path to private key", {
      default: secrets[alias].ssh_key_path ?? "~/.ssh/id_rsa",
      required: true,
    });
    secrets[alias].ssh_key_path = keyPath;
    delete secrets[alias].password;
  } else {
    const pwd = await ask("SSH password", {
      default: secrets[alias].password,
      required: true,
      secret: true,
    });
    secrets[alias].password = pwd;
    delete secrets[alias].ssh_key_path;
  }

  if (project.db?.[alias]) {
    console.log("\n=== Database ===");
    const db = project.db[alias];
    if (db.type !== "sqlite") {
      db.host = await ask("DB host", { default: String(db.host ?? ""), required: true });
      db.port = Number(await ask("DB port", { default: String(db.port ?? defaultPort(String(db.type ?? "postgres"))) }));
      db.database = await ask("DB name", { default: String(db.database ?? ""), required: true });
      db.user = await ask("DB user", { default: String(db.user ?? srv.user) });

      const samePwd = !secrets[alias].db_password;
      const useSamePwd = samePwd
        ? await confirm("Use SSH password for DB?", true)
        : false;
      if (!useSamePwd) {
        const dbPwd = await ask("DB password", {
          default: secrets[alias].db_password,
          required: true,
          secret: true,
        });
        secrets[alias].db_password = dbPwd;
      }
    } else {
      db.database = await ask("SQLite database file path", {
        default: String(db.database ?? ""),
        required: true,
      });
    }
  } else {
    if (await confirm("\nAdd a database?", false)) {
      const types = ["postgres", "mysql", "mariadb", "sqlite"];
      let dbType = "";
      while (!types.includes(dbType)) {
        dbType = (await ask(`DB type (${types.join("|")})`, { default: "postgres" })).toLowerCase();
      }
      if (dbType === "sqlite") {
        const filePath = await ask("SQLite file path", { required: true });
        project.db = { [alias]: { type: "sqlite", database: filePath } };
      } else {
        const host = await ask("DB host", { required: true });
        const port = Number(await ask("DB port", { default: String(defaultPort(dbType)) }));
        const database = await ask("DB name", { required: true });
        const user = await ask("DB user", { default: srv.user });
        project.db = { [alias]: { type: dbType, host, port, database, user } };
        if (!(await confirm("Use SSH password for DB?", true))) {
          secrets[alias].db_password = await ask("DB password", { required: true, secret: true });
        }
      }
    }
  }
}

async function main() {
  const { target, nonInteractive } = parseArgs(process.argv);
  if (!fs.existsSync(target)) {
    console.error(`Folder not found: ${target}`);
    process.exit(1);
  }

  const envFile = findEnvFile(target);
  const env = envFile ? parseEnv(envFile) : {};
  if (envFile) {
    console.log(`✓ found ${path.basename(envFile)} — SERVER_HOST=${env.SERVER_HOST ?? "?"} DB_NAME=${env.DB_NAME ?? "—"}`);
  } else {
    console.log("⚠ no .env file detected");
  }

  const { project, secrets } = buildConfigs(env);

  const configDir = path.join(target, ".mcp-remote-ops");
  fs.mkdirSync(configDir, { recursive: true });
  const projectFile = path.join(configDir, "project.yaml");
  const secretsFile = path.join(configDir, "secrets.yaml");

  // Migrate legacy files from project root
  for (const name of ["project.yaml", "secrets.yaml"]) {
    const legacy = path.join(target, name);
    const target_ = path.join(configDir, name);
    if (fs.existsSync(legacy) && !fs.existsSync(target_)) {
      fs.renameSync(legacy, target_);
      console.log(`↪ moved legacy ${legacy} → ${target_}`);
    }
  }

  if (fs.existsSync(projectFile) || fs.existsSync(secretsFile)) {
    if (fs.existsSync(projectFile)) console.log(`⚠ ${projectFile} exists — skipping`);
    if (fs.existsSync(secretsFile)) console.log(`⚠ ${secretsFile} exists — skipping`);
    console.log("Delete those files to regenerate, or edit them manually.");
  } else {
    if (!nonInteractive) {
      await fillSecretsInteractively(project, secrets);
    }
    writeYaml(projectFile, project);
    console.log(`\n✓ wrote ${projectFile}`);
    writeYaml(secretsFile, secrets);
    console.log(`✓ wrote ${secretsFile}`);
  }

  const settingsPath = registerMCP(target, findPackageRoot());
  console.log(`✓ registered MCP in ${settingsPath}`);
  console.log("\nDone. Restart Claude Code in this project for the MCP to load.");
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
