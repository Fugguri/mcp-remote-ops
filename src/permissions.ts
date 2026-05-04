import { randomUUID } from "node:crypto";
import type { Config } from "./config.js";
import type { OperationLogger } from "./logger.js";

export type ActionFn<T> = () => Promise<T> | T;

interface PendingEntry {
  action: ActionFn<unknown>;
  operation: string;
  server: string;
  detail: string;
}

export interface PendingResponse {
  status: "pending_confirmation";
  action_id: string;
  message: string;
  instruction: string;
}

export class PermissionManager {
  private readonly pending = new Map<string, PendingEntry>();

  constructor(
    private readonly config: Config,
    private readonly logger?: OperationLogger,
  ) {}

  async request<T>(
    operation: string,
    server: string,
    detail: string,
    action: ActionFn<T>,
  ): Promise<T | PendingResponse> {
    const mode = this.config.getOperationMode(operation);
    if (mode === "auto") {
      this.logger?.log(operation, server, detail, "auto");
      return await action();
    }
    const actionId = randomUUID();
    this.pending.set(actionId, {
      action: action as ActionFn<unknown>,
      operation,
      server,
      detail,
    });
    this.logger?.log(operation, server, detail, "confirm", "pending");
    return {
      status: "pending_confirmation",
      action_id: actionId,
      message: `This action requires user confirmation: ${operation} on '${server}' — ${detail}`,
      instruction:
        `Show the user what will happen. If they approve, call the tool ` +
        `'confirm_action' with action_id='${actionId}'. Do NOT call confirm_action ` +
        `without explicit user approval.`,
    };
  }

  async confirm(actionId: string): Promise<unknown> {
    const entry = this.pending.get(actionId);
    if (!entry) throw new Error(`Unknown action_id: ${actionId}`);
    this.pending.delete(actionId);
    this.logger?.log(
      entry.operation,
      entry.server,
      entry.detail,
      "confirm",
      "approved",
    );
    return await entry.action();
  }
}
