import type { Config } from "../config.js";
import type { PermissionManager } from "../permissions.js";
import { runRemote } from "./ssh.js";

export class DockerTool {
  constructor(
    private readonly config: Config,
    private readonly permissions: PermissionManager,
  ) {}

  logs(server: string, container: string, lines = 100) {
    return this.permissions.request("docker_logs", server, container, () =>
      runRemote(this.config, server, `docker logs --tail ${lines} ${container} 2>&1`),
    );
  }

  restart(server: string, container: string) {
    return this.permissions.request("docker_restart", server, container, () =>
      runRemote(this.config, server, `docker restart ${container}`),
    );
  }

  status(server: string) {
    return this.permissions.request("docker_status", server, "all", () =>
      runRemote(this.config, server, "docker ps --format 'table {{.Names}}\\t{{.Status}}'"),
    );
  }
}
