# mcp-remote-ops

[![CI](https://github.com/Fugguri/mcp-remote-ops/actions/workflows/ci.yml/badge.svg)](https://github.com/Fugguri/mcp-remote-ops/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@fugguri/mcp-remote-ops.svg)](https://www.npmjs.com/package/@fugguri/mcp-remote-ops)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

MCP-сервер для управления удалёнными серверами из Claude Code.
SSH exec, Docker logs/restart, rsync, SQL — с явным confirm-flow для опасных операций.

## Установка

### Из npm (когда пакет опубликован)

```bash
cd /path/to/your/project
npx @fugguri/mcp-remote-ops-init
```

### Напрямую из GitHub (без npm)

```bash
cd /path/to/your/project
npx github:Fugguri/mcp-remote-ops init
```

Или глобально:

```bash
npm install -g github:Fugguri/mcp-remote-ops
mcp-remote-ops-init /path/to/your/project
```

Что произойдёт:

1. Найдёт `.env.make` или `.env`, распарсит `SERVER_*` / `DB_*`
2. Создаст `project.yaml` (server + db, операции с дефолтами)
3. Создаст `secrets.yaml` (SSH/DB пароли, добавится в `.gitignore`)
4. Зарегистрирует MCP в `.claude/settings.local.json`

Перезапусти Claude Code в проекте — `/mcp` покажет `remote-ops`.

## Структура `project.yaml`

```yaml
servers:
  prod:
    host: 1.2.3.4
    user: deploy
    port: 22                    # опционально
    project_path: /var/www/app

operations:                     # auto | confirm
  docker_logs: auto
  docker_status: auto
  docker_restart: confirm
  ssh_exec: confirm
  sync: confirm
  db_select: auto
  db_update: confirm
  db_delete: confirm
  db_insert: confirm

db:
  prod:
    type: postgres              # postgres | mysql | mariadb | sqlite
    host: localhost
    port: 5432
    database: app_db
    user: app_user              # опционально, иначе берётся servers.prod.user

logging:
  retention_days: 30            # посуточная ротация
  # или max_size_mb + backup_count
```

## `secrets.yaml`

```yaml
prod:
  password: SSH_AND_DB_PWD      # один пароль для SSH и БД
  # ssh_key_path: ~/.ssh/id_rsa # альтернатива password
  # db_password: SEPARATE_DB    # если БД на отдельном пароле
```

Приоритет: `ssh_key_path` > `password`. `db_password` > `password`.

## Tools

| Tool | Default mode |
|---|---|
| `list_servers` | auto |
| `ssh_exec` | confirm |
| `docker_logs` | auto |
| `docker_status` | auto |
| `docker_restart` | confirm |
| `sync_files` | confirm |
| `db_query` SELECT | auto |
| `db_query` UPDATE/DELETE/INSERT | confirm |
| `db_query` DDL (DROP/ALTER/TRUNCATE/CREATE) | заблокировано |
| `confirm_action` | — |

## Confirm-flow

Tool в режиме `confirm` возвращает:

```json
{
  "status": "pending_confirmation",
  "action_id": "uuid",
  "message": "...",
  "instruction": "Call confirm_action with action_id=... only after user approval"
}
```

Чтобы выполнить — `confirm_action` с этим `action_id`.

## Логи

`<project>/server-mcp.log`. Формат:

```
2026-05-04 13:04:21 [AUTO]    docker_logs    prod    looker_bot
2026-05-04 13:04:54 [CONFIRM] ssh_exec       prod    whoami  → pending
2026-05-04 13:05:29 [CONFIRM] ssh_exec       prod    whoami  → approved
```

## Разработка

```bash
npm install
npm run build       # tsc
npm test            # vitest
```
