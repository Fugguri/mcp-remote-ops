import { runRemote } from "./ssh.js";
export class DockerTool {
    config;
    permissions;
    constructor(config, permissions) {
        this.config = config;
        this.permissions = permissions;
    }
    logs(server, container, lines = 100) {
        return this.permissions.request("docker_logs", server, container, () => runRemote(this.config, server, `docker logs --tail ${lines} ${container} 2>&1`));
    }
    restart(server, container) {
        return this.permissions.request("docker_restart", server, container, () => runRemote(this.config, server, `docker restart ${container}`));
    }
    status(server) {
        return this.permissions.request("docker_status", server, "all", () => runRemote(this.config, server, "docker ps --format 'table {{.Names}}\\t{{.Status}}'"));
    }
}
//# sourceMappingURL=docker.js.map