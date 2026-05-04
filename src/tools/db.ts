import type { Config } from "../config.js";
import type { PermissionManager } from "../permissions.js";

const DDL_KEYWORDS = ["DROP", "ALTER", "TRUNCATE", "CREATE", "RENAME"];

type QueryType = "select" | "update" | "delete" | "insert" | "ddl" | "unknown";

function queryType(sql: string): QueryType {
  const first = sql.trim().split(/\s+/)[0]?.toUpperCase() ?? "";
  if (DDL_KEYWORDS.includes(first)) return "ddl";
  if (first === "SELECT") return "select";
  if (first === "UPDATE") return "update";
  if (first === "DELETE") return "delete";
  if (first === "INSERT") return "insert";
  return "unknown";
}

export interface DBResult {
  columns?: string[];
  rows?: unknown[];
  affected_rows?: number;
}

async function runQuery(
  dbType: string,
  dbCfg: Record<string, unknown>,
  user: string,
  password: string,
  sql: string,
  qtype: QueryType,
): Promise<DBResult> {
  if (dbType === "postgres" || dbType === "postgresql") {
    const { Client } = await import("pg");
    const client = new Client({
      host: dbCfg.host as string,
      port: Number(dbCfg.port),
      database: dbCfg.database as string,
      user,
      password,
    });
    await client.connect();
    try {
      const res = await client.query(sql);
      if (qtype === "select") {
        return {
          columns: res.fields.map((f) => f.name),
          rows: res.rows,
        };
      }
      return { affected_rows: res.rowCount ?? 0 };
    } finally {
      await client.end();
    }
  }

  if (dbType === "mysql" || dbType === "mariadb") {
    const mysql = await import("mysql2/promise");
    const conn = await mysql.createConnection({
      host: dbCfg.host as string,
      port: Number(dbCfg.port),
      database: dbCfg.database as string,
      user,
      password,
    });
    try {
      const [result, fields] = await conn.execute(sql);
      if (qtype === "select" && Array.isArray(result)) {
        return {
          columns: fields?.map((f: { name: string }) => f.name) ?? [],
          rows: result,
        };
      }
      return { affected_rows: (result as { affectedRows?: number }).affectedRows ?? 0 };
    } finally {
      await conn.end();
    }
  }

  if (dbType === "sqlite") {
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(dbCfg.database as string);
    try {
      if (qtype === "select") {
        const stmt = db.prepare(sql);
        const rows = stmt.all() as Record<string, unknown>[];
        const columns = rows[0] ? Object.keys(rows[0]) : [];
        return { columns, rows };
      }
      const result = db.prepare(sql).run();
      return { affected_rows: Number(result.changes) };
    } finally {
      db.close();
    }
  }

  throw new Error(`Unsupported db type: ${dbType}`);
}

export class DBTool {
  constructor(
    private readonly config: Config,
    private readonly permissions: PermissionManager,
  ) {}

  query(server: string, sql: string) {
    const qtype = queryType(sql);
    if (qtype === "ddl") {
      throw new Error(`DDL operations are not allowed: ${sql}`);
    }

    const dbCfg = this.config.getDBConfig(server);
    const dbType = dbCfg.type ?? "postgres";

    let user = "";
    let password = "";
    if (dbType !== "sqlite") {
      user = dbCfg.user ?? this.config.servers[server]?.user ?? "";
      password = this.config.hasSecret(server, "db_password")
        ? this.config.getSecret(server, "db_password")
        : this.config.getSecret(server, "password");
    }

    const operationMap: Record<string, string> = {
      select: "db_select",
      update: "db_update",
      delete: "db_delete",
      insert: "db_insert",
    };
    const operation = operationMap[qtype] ?? "db_select";

    return this.permissions.request(operation, server, sql.slice(0, 80), () =>
      runQuery(dbType, dbCfg as Record<string, unknown>, user, password, sql, qtype),
    );
  }
}
