#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { Config } from "./config.js";
import { OperationLogger } from "./logger.js";
import { PermissionManager } from "./permissions.js";
import { SSHTool } from "./tools/ssh.js";
import { DockerTool } from "./tools/docker.js";
import { SyncTool } from "./tools/sync.js";
import { DBTool } from "./tools/db.js";
import { classifyError } from "./errors.js";

const PROJECT_PATH = process.env.PROJECT_PATH ?? process.cwd();

let config: Config;
try {
  config = new Config(PROJECT_PATH);
} catch (e) {
  process.stderr.write(
    `mcp-remote-ops: failed to load config from ${PROJECT_PATH}\n` +
      `  ${e instanceof Error ? e.message : String(e)}\n` +
      `Run: npx github:Fugguri/mcp-remote-ops init ${PROJECT_PATH}\n`,
  );
  process.exit(1);
}

const aliasesWithoutAuth = Object.keys(config.servers).filter(
  (alias) => !config.hasSecret(alias, "password") && !config.hasSecret(alias, "ssh_key_path"),
);
if (aliasesWithoutAuth.length > 0) {
  process.stderr.write(
    `mcp-remote-ops: warning — no SSH credentials for servers: ${aliasesWithoutAuth.join(", ")}.\n` +
      `  Set 'password' or 'ssh_key_path' in secrets.yaml, or env MCP_REMOTE_OPS_<ALIAS>_PASSWORD.\n`,
  );
}

const logger = new OperationLogger(PROJECT_PATH, config.logging);
const permissions = new PermissionManager(config, logger);
const ssh = new SSHTool(config, permissions);
const docker = new DockerTool(config, permissions);
const sync = new SyncTool(config, permissions);
const db = new DBTool(config, permissions);

const CONFIRM_NOTE =
  " If the operation requires confirmation, this tool returns " +
  "{action_id, message, instruction} instead of the result. " +
  "To actually execute, call confirm_action with that action_id. " +
  "Server alias must match a key under 'servers:' in the project's project.yaml " +
  "(e.g. 'prod', 'staging'). Use list_servers if unsure.";

const server = new Server(
  { name: "mcp-remote-ops", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "list_servers",
      description:
        "List configured server aliases and their hosts. Use this first if you don't know which alias to pass to other tools.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "ssh_exec",
      description: "Run a shell command on a remote server via SSH." + CONFIRM_NOTE,
      inputSchema: {
        type: "object",
        properties: {
          server: { type: "string", description: "Server alias from project.yaml" },
          command: { type: "string" },
        },
        required: ["server", "command"],
      },
    },
    {
      name: "docker_logs",
      description: "Get logs from a Docker container on a remote server.",
      inputSchema: {
        type: "object",
        properties: {
          server: { type: "string" },
          container: { type: "string" },
          lines: { type: "integer", default: 100 },
        },
        required: ["server", "container"],
      },
    },
    {
      name: "docker_restart",
      description: "Restart a Docker container." + CONFIRM_NOTE,
      inputSchema: {
        type: "object",
        properties: {
          server: { type: "string" },
          container: { type: "string" },
        },
        required: ["server", "container"],
      },
    },
    {
      name: "docker_status",
      description: "Show running Docker containers on the server (docker ps).",
      inputSchema: {
        type: "object",
        properties: { server: { type: "string" } },
        required: ["server"],
      },
    },
    {
      name: "sync_files",
      description: "rsync a local directory to a remote path." + CONFIRM_NOTE,
      inputSchema: {
        type: "object",
        properties: {
          server: { type: "string" },
          local_path: { type: "string" },
          remote_path: { type: "string" },
        },
        required: ["server", "local_path", "remote_path"],
      },
    },
    {
      name: "db_query",
      description:
        "Execute a SQL query. SELECT runs immediately. UPDATE/DELETE/INSERT need confirm. DDL is blocked." +
        CONFIRM_NOTE,
      inputSchema: {
        type: "object",
        properties: {
          server: { type: "string" },
          sql: { type: "string" },
        },
        required: ["server", "sql"],
      },
    },
    {
      name: "confirm_action",
      description:
        "Execute a previously-returned pending action by its action_id. Call only after user approval.",
      inputSchema: {
        type: "object",
        properties: { action_id: { type: "string" } },
        required: ["action_id"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;
  let result: unknown;
  try {
    if (name === "list_servers") {
      result = Object.fromEntries(
        Object.entries(config.servers).map(([alias, s]) => [
          alias,
          { host: s.host, user: s.user },
        ]),
      );
    } else if (name === "ssh_exec") {
      result = await ssh.exec(String(args.server), String(args.command));
    } else if (name === "docker_logs") {
      result = await docker.logs(
        String(args.server),
        String(args.container),
        Number(args.lines ?? 100),
      );
    } else if (name === "docker_restart") {
      result = await docker.restart(String(args.server), String(args.container));
    } else if (name === "docker_status") {
      result = await docker.status(String(args.server));
    } else if (name === "sync_files") {
      result = await sync.sync(
        String(args.server),
        String(args.local_path),
        String(args.remote_path),
      );
    } else if (name === "db_query") {
      result = await db.query(String(args.server), String(args.sql));
    } else if (name === "confirm_action") {
      result = await permissions.confirm(String(args.action_id));
    } else {
      result = { error: `Unknown tool: ${name}` };
    }
  } catch (e) {
    const serverArg = typeof args.server === "string" ? args.server : undefined;
    result = classifyError(e, { server: serverArg });
    logger.log(name, serverArg ?? "—", String(args.command ?? args.sql ?? ""), "error", (result as { kind: string }).kind);
  }

  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
  };
});

async function start() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

start().catch((e) => {
  process.stderr.write(`mcp-remote-ops fatal: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
