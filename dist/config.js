import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
export const CONFIG_DIR_NAME = ".mcp-remote-ops";
export const ENV_PREFIX = "MCP_REMOTE_OPS_";
export function resolveConfigDir(projectPath) {
    const dedicated = path.join(projectPath, CONFIG_DIR_NAME);
    if (fs.existsSync(path.join(dedicated, "project.yaml")))
        return dedicated;
    return projectPath;
}
export function envVarName(server, key) {
    const norm = (s) => s.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
    return `${ENV_PREFIX}${norm(server)}_${norm(key)}`;
}
function readSecretFromEnv(server, key) {
    return process.env[envVarName(server, key)];
}
function loadDotenv(filePath) {
    if (!fs.existsSync(filePath))
        return;
    for (const raw of fs.readFileSync(filePath, "utf8").split("\n")) {
        const line = raw.trim();
        if (!line || line.startsWith("#"))
            continue;
        const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
        if (!m)
            continue;
        let value = m[2].trim();
        if (value.length >= 2 && (value[0] === '"' || value[0] === "'") && value.at(-1) === value[0]) {
            value = value.slice(1, -1);
        }
        if (process.env[m[1]] === undefined)
            process.env[m[1]] = value;
    }
}
export class Config {
    projectPath;
    servers;
    operations;
    db;
    logging;
    secrets;
    constructor(projectPath) {
        this.projectPath = projectPath;
        const configDir = resolveConfigDir(projectPath);
        loadDotenv(path.join(configDir, ".env"));
        const projectFile = path.join(configDir, "project.yaml");
        if (!fs.existsSync(projectFile)) {
            throw new Error(`project.yaml not found. Looked in ${path.join(projectPath, CONFIG_DIR_NAME)} and ${projectPath}`);
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
    getSecret(server, key) {
        const envValue = readSecretFromEnv(server, key);
        if (envValue !== undefined)
            return envValue;
        const value = this.secrets[server]?.[key];
        if (value === undefined) {
            throw new Error(`Secret '${key}' for server '${server}' not found. ` +
                `Set it in secrets.yaml or via env ${envVarName(server, key)}`);
        }
        return value;
    }
    hasSecret(server, key) {
        if (readSecretFromEnv(server, key) !== undefined)
            return true;
        return this.secrets[server]?.[key] !== undefined;
    }
    getOperationMode(operation) {
        return this.operations[operation] ?? "confirm";
    }
    getDBConfig(server) {
        const cfg = this.db[server];
        if (!cfg)
            throw new Error(`DB config for server '${server}' not found`);
        return cfg;
    }
    ensureGitignore() {
        const gitignore = path.join(this.projectPath, ".gitignore");
        const lines = fs.existsSync(gitignore)
            ? fs.readFileSync(gitignore, "utf8").split("\n")
            : [];
        const needed = [];
        if (!lines.some((l) => l.trim() === "secrets.yaml"))
            needed.push("secrets.yaml");
        const dotenvLine = `${CONFIG_DIR_NAME}/.env`;
        const secretsInDir = `${CONFIG_DIR_NAME}/secrets.yaml`;
        if (!lines.some((l) => l.includes(secretsInDir)))
            needed.push(secretsInDir);
        if (!lines.some((l) => l.includes(dotenvLine)))
            needed.push(dotenvLine);
        if (needed.length > 0) {
            fs.appendFileSync(gitignore, "\n" + needed.join("\n") + "\n");
        }
    }
}
//# sourceMappingURL=config.js.map