# Changelog

## 0.3.0 — 2026-05-04

### Added

- OpenCode support: `init` now writes `opencode.json` alongside `.claude/settings.local.json`
- `--target claude|opencode|both` CLI flag (default: `both`)
- Manual registration snippets for Claude Code and OpenCode in README

## 0.2.0 — 2026-05-04

### Changed

- Configs now live in `.mcp-remote-ops/` directory (was: project root). Legacy files in root are auto-migrated by `init`. Backwards-compat fallback to root if no dedicated dir.
- `init` is now interactive: prompts for SSH host/user/port, auth method, DB params. Use `--yes` (or `-y`) to skip prompts.

### Added

- `prompt.ts` helper with masked password input
- Auto-migration of legacy `project.yaml`/`secrets.yaml` from project root

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
