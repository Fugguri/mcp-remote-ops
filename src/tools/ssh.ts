import { Client, type ConnectConfig } from "ssh2";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Config } from "../config.js";
import type { PermissionManager } from "../permissions.js";

export interface SSHResult {
  stdout: string;
  stderr: string;
  exit_code: number;
}

export function buildConnectConfig(config: Config, server: string): ConnectConfig {
  const srv = config.servers[server];
  if (!srv) throw new Error(`Server '${server}' not found in project.yaml`);

  const base: ConnectConfig = {
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

export function runRemote(
  config: Config,
  server: string,
  command: string,
): Promise<SSHResult> {
  return new Promise((resolve, reject) => {
    const client = new Client();
    const cfg = buildConnectConfig(config, server);

    client.on("keyboard-interactive", (_n, _i, _l, _p, finish) => {
      if (cfg.password) finish([cfg.password]);
      else finish([]);
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
        stream.on("data", (d: Buffer) => {
          stdout += d.toString("utf8");
        });
        stream.stderr.on("data", (d: Buffer) => {
          stderr += d.toString("utf8");
        });
        stream.on("exit", (code: number | null) => {
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
  constructor(
    private readonly config: Config,
    private readonly permissions: PermissionManager,
  ) {}

  exec(server: string, command: string) {
    return this.permissions.request("ssh_exec", server, command, () =>
      runRemote(this.config, server, command),
    );
  }
}
