import { randomUUID } from "node:crypto";
export class PermissionManager {
    config;
    logger;
    pending = new Map();
    constructor(config, logger) {
        this.config = config;
        this.logger = logger;
    }
    async request(operation, server, detail, action) {
        const mode = this.config.getOperationMode(operation);
        if (mode === "auto") {
            this.logger?.log(operation, server, detail, "auto");
            return await action();
        }
        const actionId = randomUUID();
        this.pending.set(actionId, {
            action: action,
            operation,
            server,
            detail,
        });
        this.logger?.log(operation, server, detail, "confirm", "pending");
        return {
            status: "pending_confirmation",
            action_id: actionId,
            message: `This action requires user confirmation: ${operation} on '${server}' — ${detail}`,
            instruction: `Show the user what will happen. If they approve, call the tool ` +
                `'confirm_action' with action_id='${actionId}'. Do NOT call confirm_action ` +
                `without explicit user approval.`,
        };
    }
    async confirm(actionId) {
        const entry = this.pending.get(actionId);
        if (!entry)
            throw new Error(`Unknown action_id: ${actionId}`);
        this.pending.delete(actionId);
        this.logger?.log(entry.operation, entry.server, entry.detail, "confirm", "approved");
        return await entry.action();
    }
}
//# sourceMappingURL=permissions.js.map