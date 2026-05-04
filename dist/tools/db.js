const DDL_KEYWORDS = ["DROP", "ALTER", "TRUNCATE", "CREATE", "RENAME"];
function queryType(sql) {
    const first = sql.trim().split(/\s+/)[0]?.toUpperCase() ?? "";
    if (DDL_KEYWORDS.includes(first))
        return "ddl";
    if (first === "SELECT")
        return "select";
    if (first === "UPDATE")
        return "update";
    if (first === "DELETE")
        return "delete";
    if (first === "INSERT")
        return "insert";
    return "unknown";
}
async function runQuery(dbType, dbCfg, user, password, sql, qtype) {
    if (dbType === "postgres" || dbType === "postgresql") {
        const { Client } = await import("pg");
        const client = new Client({
            host: dbCfg.host,
            port: Number(dbCfg.port),
            database: dbCfg.database,
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
        }
        finally {
            await client.end();
        }
    }
    if (dbType === "mysql" || dbType === "mariadb") {
        const mysql = await import("mysql2/promise");
        const conn = await mysql.createConnection({
            host: dbCfg.host,
            port: Number(dbCfg.port),
            database: dbCfg.database,
            user,
            password,
        });
        try {
            const [result, fields] = await conn.execute(sql);
            if (qtype === "select" && Array.isArray(result)) {
                return {
                    columns: fields?.map((f) => f.name) ?? [],
                    rows: result,
                };
            }
            return { affected_rows: result.affectedRows ?? 0 };
        }
        finally {
            await conn.end();
        }
    }
    if (dbType === "sqlite") {
        const { DatabaseSync } = await import("node:sqlite");
        const db = new DatabaseSync(dbCfg.database);
        try {
            if (qtype === "select") {
                const stmt = db.prepare(sql);
                const rows = stmt.all();
                const columns = rows[0] ? Object.keys(rows[0]) : [];
                return { columns, rows };
            }
            const result = db.prepare(sql).run();
            return { affected_rows: Number(result.changes) };
        }
        finally {
            db.close();
        }
    }
    throw new Error(`Unsupported db type: ${dbType}`);
}
export class DBTool {
    config;
    permissions;
    constructor(config, permissions) {
        this.config = config;
        this.permissions = permissions;
    }
    query(server, sql) {
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
        const operationMap = {
            select: "db_select",
            update: "db_update",
            delete: "db_delete",
            insert: "db_insert",
        };
        const operation = operationMap[qtype] ?? "db_select";
        return this.permissions.request(operation, server, sql.slice(0, 80), () => runQuery(dbType, dbCfg, user, password, sql, qtype));
    }
}
//# sourceMappingURL=db.js.map