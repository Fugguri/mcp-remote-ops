import { spawn } from "node:child_process";
function spawnRsync(args, env = process.env) {
    return new Promise((resolve) => {
        const child = spawn("rsync", args, { env });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (d) => (stdout += d.toString()));
        child.stderr.on("data", (d) => (stderr += d.toString()));
        child.on("close", (code) => resolve({ stdout, stderr, exit_code: code ?? -1 }));
    });
}
export class SyncTool {
    config;
    permissions;
    constructor(config, permissions) {
        this.config = config;
        this.permissions = permissions;
    }
    sync(server, localPath, remotePath) {
        const srv = this.config.servers[server];
        if (!srv)
            throw new Error(`Server '${server}' not found`);
        return this.permissions.request("sync", server, `${localPath} → ${remotePath}`, async () => {
            const target = `${srv.user}@${srv.host}:${remotePath}`;
            const port = srv.port ?? 22;
            const args = ["-avz", "--delete", "-e", `ssh -p ${port} -o StrictHostKeyChecking=no`, localPath, target];
            if (this.config.hasSecret(server, "password") && !this.config.hasSecret(server, "ssh_key_path")) {
                const password = this.config.getSecret(server, "password");
                args[3] = `sshpass -e ssh -p ${port} -o StrictHostKeyChecking=no`;
                return await spawnRsync(args, { ...process.env, SSHPASS: password });
            }
            if (this.config.hasSecret(server, "ssh_key_path")) {
                const keyPath = this.config.getSecret(server, "ssh_key_path").replace(/^~/, process.env.HOME ?? "");
                args[3] = `ssh -p ${port} -i ${keyPath} -o StrictHostKeyChecking=no`;
            }
            return await spawnRsync(args);
        });
    }
}
//# sourceMappingURL=sync.js.map