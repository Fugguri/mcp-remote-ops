# mcp-remote-ops

[![CI](https://github.com/Fugguri/mcp-remote-ops/actions/workflows/ci.yml/badge.svg)](https://github.com/Fugguri/mcp-remote-ops/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@fugguri/mcp-remote-ops.svg)](https://www.npmjs.com/package/@fugguri/mcp-remote-ops)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

MCP-сервер для управления удалёнными серверами из Claude Code.
SSH exec, Docker logs/restart, rsync, SQL — с явным confirm-flow для опасных операций.

## Поддерживаемые AI-агенты

- **Claude Code** — пишет в `<project>/.claude/settings.local.json`
- **OpenCode** — пишет в `<project>/opencode.json`

По умолчанию `init` регистрирует MCP **в обоих** (если не нужен один — флаг `--target claude` или `--target opencode`).

## Установка

### Напрямую из GitHub (без npm publish)

```bash
cd /path/to/your/project
npx github:Fugguri/mcp-remote-ops init
```

### Из npm

```bash
cd /path/to/your/project
npx @fugguri/mcp-remote-ops-init
```

### Глобально

Один раз установил — пользуешься везде без `npx`.

```bash
npm install -g github:Fugguri/mcp-remote-ops

# проверка
which mcp-remote-ops-init     # должен показать путь к бинарю
which mcp-remote-ops          # сам MCP-сервер

# использование
cd /any/your/project
mcp-remote-ops-init           # интерактив, текущая папка
# или с явным путём:
mcp-remote-ops-init /path/to/another/project
# или авто из .env, без вопросов:
mcp-remote-ops-init --yes
```

При глобальной установке `prepare` хук собирает TS в `dist/` автоматически. Если `which mcp-remote-ops-init` ничего не показывает — проверь что `npm bin -g` в `$PATH`.

Обновление до последней версии из GitHub:

```bash
npm install -g github:Fugguri/mcp-remote-ops      # просто переустановка тянет свежий main
```

### Опции CLI

```
init [project_path] [options]

  --yes, -y                 не задавать вопросов, использовать только данные из .env
  --target claude           регистрировать только для Claude Code
  --target opencode         регистрировать только для OpenCode
  --target both             регистрировать для обоих (default)
```

## Что делает init

1. Создаёт папку `.mcp-remote-ops/` в корне проекта
2. Если есть `.env.make` или `.env` — парсит `SERVER_*` / `DB_*` как дефолты
3. **Интерактивно опрашивает** недостающие поля: SSH host/user/port, метод аутентификации (пароль или ключ), параметры БД (со скрытым вводом для паролей)
4. Пишет `.mcp-remote-ops/project.yaml` + `.mcp-remote-ops/secrets.yaml`
5. **Автоматически добавляет `.mcp-remote-ops/secrets.yaml` в `.gitignore`** проекта (идемпотентно — повторный запуск не создаёт дублей)
6. Регистрирует MCP в Claude Code и/или OpenCode
7. Если ранее были `project.yaml`/`secrets.yaml` в корне — переносит в новую папку

После init — **рестарт твоего AI-инструмента** в этой папке → `remote-ops` появится в списке MCP.

> ⚠️ **Безопасность:** `secrets.yaml` содержит пароли SSH и БД в открытом виде. Не коммить его, не пересылай, не клади в публичные облачные синки. Init добавляет его в `.gitignore` автоматически, но если репо уже содержит закоммиченный `secrets.yaml` (старая версия проекта) — `.gitignore` его не уберёт. Удали из git руками: `git rm --cached secrets.yaml && git commit`.

## Ручная регистрация (если init не подошёл)

### Claude Code

`<project>/.claude/settings.local.json`:

```json
{
  "mcpServers": {
    "remote-ops": {
      "command": "node",
      "args": ["/абсолютный/путь/до/dist/server.js"],
      "env": { "PROJECT_PATH": "/абсолютный/путь/до/проекта" }
    }
  }
}
```

### OpenCode

`<project>/opencode.json`:

```json
{
  "mcp": {
    "remote-ops": {
      "type": "local",
      "command": ["node", "/абсолютный/путь/до/dist/server.js"],
      "enabled": true,
      "environment": { "PROJECT_PATH": "/абсолютный/путь/до/проекта" }
    }
  }
}
```

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

## Секреты: 3 способа задать

Приоритет (выше → ниже): **env-переменная** → `secrets.yaml` → ошибка.

### 1. `secrets.yaml` (default)

```yaml
prod:
  password: SSH_AND_DB_PWD      # один пароль для SSH и БД
  # ssh_key_path: ~/.ssh/id_rsa # альтернатива password
  # db_password: SEPARATE_DB    # если БД на отдельном пароле
```

Внутри одного сервера: `ssh_key_path` > `password`, `db_password` > `password`.

### 2. Переменные окружения

Формат: `MCP_REMOTE_OPS_<SERVER>_<KEY>` — алиас сервера и ключ переводятся в верхний регистр, любые не-A-Z0-9 заменяются на `_`.

```bash
export MCP_REMOTE_OPS_PROD_PASSWORD='your-ssh-password'
export MCP_REMOTE_OPS_PROD_DB_PASSWORD='your-db-password'
# или через ключ:
export MCP_REMOTE_OPS_PROD_SSH_KEY_PATH='~/.ssh/id_rsa'

# Для алиаса staging-2 → MCP_REMOTE_OPS_STAGING_2_PASSWORD
```

Удобно для:
- CI/CD пайплайнов (секреты из vault)
- продакшн-серверов (передавать через systemd unit / docker-compose)
- общих проектов где `secrets.yaml` нельзя коммитить даже локально

Можно частично перекрывать: `secrets.yaml` хранит SSH-пароль, env-переменная хранит DB-пароль.

### 3. `.env` файл в `.mcp-remote-ops/`

`.mcp-remote-ops/.env` загружается автоматически при старте сервера (как фолбэк, существующие `process.env` НЕ перезаписываются):

```env
MCP_REMOTE_OPS_PROD_PASSWORD=your-ssh-password
MCP_REMOTE_OPS_PROD_DB_PASSWORD=your-db-password
```

Файл попадает в `.gitignore` автоматически.

### Полный список ключей секретов

| Ключ | Что | Где используется |
|---|---|---|
| `password` | SSH и (по умолчанию) БД пароль | SSH/Docker/sync, db_query если нет `db_password` |
| `ssh_key_path` | Путь к приватному SSH-ключу (приоритет над password) | SSH/Docker/sync |
| `db_password` | Отдельный пароль БД (override) | db_query |

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

## Ошибки

Tools возвращают структурированные ошибки с подсказкой как чинить:

```json
{
  "error": true,
  "kind": "missing_credentials",
  "message": "No credentials for server 'prod'. Need 'password' in secrets.yaml or env MCP_REMOTE_OPS_PROD_PASSWORD.",
  "hint": "Set the env var or add to .mcp-remote-ops/secrets.yaml under 'prod'."
}
```

Возможные `kind`:

| Kind | Когда |
|---|---|
| `missing_credentials` | Нет ни yaml, ни env с нужным секретом |
| `server_not_configured` | Алиас не найден в `project.yaml` |
| `auth_failed` | SSH-сервер отверг пароль/ключ |
| `connection_failed` | Connection refused (SSH не слушает порт) |
| `host_unreachable` | DNS fail / timeout |
| `ddl_blocked` | Попытка DROP/ALTER/CREATE в db_query |
| `unknown_action` | action_id истёк или уже подтверждён |
| `db_unsupported` | Неизвестный `db.type` |
| `internal` | Прочее (детали в `details`) |

При старте сервер проверяет, что для каждого сервера в `project.yaml` есть либо `password`, либо `ssh_key_path` (yaml или env). Если нет — пишет warning в stderr (видно в `claude --debug`).

Если `project.yaml` не найден — сервер падает с подсказкой запустить `init`.

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
