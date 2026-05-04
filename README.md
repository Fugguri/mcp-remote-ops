# mcp-remote-ops

[![CI](https://github.com/Fugguri/mcp-remote-ops/actions/workflows/ci.yml/badge.svg)](https://github.com/Fugguri/mcp-remote-ops/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@fugguri/mcp-remote-ops.svg)](https://www.npmjs.com/package/@fugguri/mcp-remote-ops)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

MCP-сервер для управления удалёнными серверами из Claude Code.
SSH exec, Docker logs/restart, rsync, SQL — с явным confirm-flow для опасных операций.

## Установка

### Напрямую из GitHub (без npm publish)

```bash
cd /path/to/your/project
npx github:Fugguri/mcp-remote-ops init
```

### Из npm (когда пакет опубликован)

```bash
cd /path/to/your/project
npx @fugguri/mcp-remote-ops-init
```

### Глобально

```bash
npm install -g github:Fugguri/mcp-remote-ops
mcp-remote-ops-init /path/to/your/project
```

## Что делает init

1. Создаёт папку `.mcp-remote-ops/` в корне проекта
2. Если есть `.env.make` или `.env` — парсит `SERVER_*` / `DB_*` как дефолты
3. **Интерактивно опрашивает** недостающие поля: SSH host/user/port, метод аутентификации (пароль или ключ), параметры БД
4. Пишет `.mcp-remote-ops/project.yaml` + `.mcp-remote-ops/secrets.yaml` (последний попадёт в `.gitignore`)
5. Регистрирует MCP в `.claude/settings.local.json`
6. Если ранее были `project.yaml`/`secrets.yaml` в корне — переносит в новую папку

Флаг `--yes` (или `-y`) пропускает интерактивные промпты — пишет только то что нашлось в `.env`. Удобно для CI.

После init: рестарт Claude Code → `/mcp` покажет `remote-ops`.

## Структура файлов в проекте

```
your-project/
├── .mcp-remote-ops/
│   ├── project.yaml      # серверы, операции, БД, логи
│   └── secrets.yaml      # пароли/ключи (gitignored)
├── .claude/
│   └── settings.local.json   # регистрация MCP (per-user)
├── .gitignore            # auto: .mcp-remote-ops/secrets.yaml
└── server-mcp.log        # лог операций
```

## `project.yaml`

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
  # или: max_size_mb: 10 + backup_count: 5
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

## Поддерживаемые БД

| Тип | Драйвер | Авто-детект |
|---|---|---|
| `postgres` | pg | port 5432 |
| `mysql` / `mariadb` | mysql2 | port 3306, или нестандартный port |
| `sqlite` | node:sqlite (Node 22+) | DB_PATH без DB_HOST |

Override через `DB_TYPE` в `.env` или `db.<server>.type` в yaml.

## Разработка

```bash
npm install
npm run build       # tsc → dist/
npm test            # vitest
```
