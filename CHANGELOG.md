# Changelog

## 0.1.0 — 2026-05-04

Initial release.

### Features

- MCP server (stdio) with 8 tools: `list_servers`, `ssh_exec`, `docker_logs`, `docker_restart`, `docker_status`, `sync_files`, `db_query`, `confirm_action`
- SSH via `ssh2`: password + ssh-key auth, keyboard-interactive fallback
- Docker logs/restart/status over SSH
- `sync_files`: rsync wrapper with sshpass for password auth
- `db_query`: PostgreSQL (`pg`), MySQL/MariaDB (`mysql2`), SQLite (`node:sqlite`); DDL blocked
- Permission flow: `auto` runs immediately, `confirm` returns `action_id` requiring `confirm_action`
- Operation logger with daily-rotate or size-based rotation (winston)
- CLI `mcp-remote-ops-init`: parses `.env` / `.env.make`, generates `project.yaml` + `secrets.yaml`, registers MCP in `.claude/settings.local.json`
- 20 vitest tests
