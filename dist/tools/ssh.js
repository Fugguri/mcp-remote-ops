import { Client } from "ssh2";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
export function buildConnectConfig(config, server) {
    const srv = config.servers[server];
    if (!srv)
        throw new Error(`Server '${server}' not found in project.yaml`);
    const base = {
        host: srv.host,
        port: srv.port ?? 22,
        username: srv.user,
        readyTimeout: 15000,
    };
    if (config.hasSecret(server, "ssh_key_path")) {
        const keyPath = config.getSecret(server, "ssh_key_path").replace(/^~/, os.homedir());
        return {
            ...base,
            privateKey: fs.readFileSync(path.resolve(keyPath)),
        };
    }
    const password = config.getSecret(server, "password");
    return {
        ...base,
        password,
        tryKeyboard: true,
    };
}
export function runRemote(config, server, command) {
    return new Promise((resolve, reject) => {
        const client = new Client();
        const cfg = buildConnectConfig(config, server);
        client.on("keyboard-interactive", (_n, _i, _l, _p, finish) => {
            if (cfg.password)
                finish([cfg.password]);
            else
                finish([]);
        });
        client.on("ready", () => {
            client.exec(command, (err, stream) => {
                if (err) {
                    client.end();
                    return reject(err);
                }
                let stdout = "";
                let stderr = "";
                let exitCode = -1;
                stream.on("data", (d) => {
                    stdout += d.toString("utf8");
                });
                stream.stderr.on("data", (d) => {
                    stderr += d.toString("utf8");
                });
                stream.on("exit", (code) => {
                    exitCode = code ?? -1;
                });
                stream.on("close", () => {
                    client.end();
                    resolve({ stdout, stderr, exit_code: exitCode });
                });
            });
        });
        client.on("error", (e) => reject(e));
        client.connect(cfg);
    });
}
export class SSHTool {
    config;
    permissions;
    constructor(config, permissions) {
        this.config = config;
        this.permissions = permissions;
    }
    exec(server, command) {
        return this.permissions.request("ssh_exec", server, command, () => runRemote(this.config, server, command));
    }
}
//# sourceMappingURL=ssh.js.map