import path from "node:path";
import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
export class OperationLogger {
    logger;
    constructor(projectPath, settings = {}) {
        const filename = path.join(projectPath, "server-mcp.log");
        const transport = OperationLogger.buildTransport(filename, settings);
        this.logger = winston.createLogger({
            level: "info",
            format: winston.format.printf((info) => String(info.message)),
            transports: [transport],
        });
    }
    static buildTransport(filename, settings) {
        if (settings.retention_days) {
            return new DailyRotateFile({
                filename: `${filename}.%DATE%`,
                datePattern: "YYYY-MM-DD",
                maxFiles: `${settings.retention_days}d`,
                symlinkName: path.basename(filename),
                createSymlink: true,
                dirname: path.dirname(filename),
            });
        }
        if (settings.max_size_mb) {
            return new winston.transports.File({
                filename,
                maxsize: settings.max_size_mb * 1024 * 1024,
                maxFiles: settings.backup_count ?? 5,
                tailable: true,
            });
        }
        return new winston.transports.File({ filename });
    }
    log(operation, server, detail, mode, result = "") {
        const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
        const tag = `[${mode.toUpperCase()}]`;
        const suffix = result ? `  → ${result}` : "";
        const line = `${ts} ${tag.padEnd(10)} ${operation.padEnd(20)} ${server.padEnd(8)} ${detail}${suffix}`;
        this.logger.info(line);
    }
}
//# sourceMappingURL=logger.js.map