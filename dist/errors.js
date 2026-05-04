import { envVarName } from "./config.js";
export function classifyError(e, context = {}) {
    const raw = e instanceof Error ? e.message : String(e);
    const lower = raw.toLowerCase();
    if (raw.startsWith("Secret '") && context.server) {
        const keyMatch = raw.match(/Secret '([^']+)'/);
        const key = keyMatch?.[1] ?? context.key ?? "password";
        return {
            error: true,
            kind: "missing_credentials",
            message: `No credentials for server '${context.server}'. Need '${key}' in secrets.yaml or env ${envVarName(context.server, key)}.`,
            hint: `Set the env var or add to .mcp-remote-ops/secrets.yaml under '${context.server}'.`,
            details: raw,
        };
    }
    if (raw.includes("not found in project.yaml") || raw.startsWith("Server '")) {
        return {
            error: true,
            kind: "server_not_configured",
            message: raw,
            hint: "Call list_servers to see configured aliases, or add the server to .mcp-remote-ops/project.yaml.",
        };
    }
    if (lower.includes("authentication") ||
        lower.includes("auth method") ||
        lower.includes("permission denied") ||
        lower.includes("password")) {
        const envName = context.server ? envVarName(context.server, "password") : "MCP_REMOTE_OPS_<server>_PASSWORD";
        return {
            error: true,
            kind: "auth_failed",
            message: `SSH authentication failed for server '${context.server ?? "?"}'.`,
            hint: `Verify the password/key in secrets.yaml or env ${envName}. If the server only allows keys, set ssh_key_path.`,
            details: raw,
        };
    }
    if (lower.includes("econnrefused") || lower.includes("connection refused")) {
        return {
            error: true,
            kind: "connection_failed",
            message: `Connection refused by server '${context.server ?? "?"}'.`,
            hint: "Check that SSH is running on the server and the configured port matches.",
            details: raw,
        };
    }
    if (lower.includes("enotfound") ||
        lower.includes("eai_again") ||
        lower.includes("ehostunreach") ||
        lower.includes("etimedout") ||
        lower.includes("timeout")) {
        return {
            error: true,
            kind: "host_unreachable",
            message: `Host for server '${context.server ?? "?"}' is unreachable or DNS failed.`,
            hint: "Check the host value in project.yaml and that the server is online / network reachable.",
            details: raw,
        };
    }
    if (raw.includes("DDL operations are not allowed")) {
        return {
            error: true,
            kind: "ddl_blocked",
            message: raw,
            hint: "DDL is intentionally blocked. Run schema migrations through your normal migration tool, not via MCP.",
        };
    }
    if (raw.includes("Unsupported db type")) {
        return { error: true, kind: "db_unsupported", message: raw };
    }
    if (raw.startsWith("Unknown action_id")) {
        return {
            error: true,
            kind: "unknown_action",
            message: raw,
            hint: "The action_id has expired or was already confirmed. Re-call the original tool to get a fresh action_id.",
        };
    }
    return { error: true, kind: "internal", message: raw };
}
//# sourceMappingURL=errors.js.map