# english_web · 考研英语背词应用

红宝书 · 乱序 · 6550 词。三层结构：数据管线脚本 → **Rust + PostgreSQL** 后端 → React 前端（同源挂载）。

**前端**：`frontend/`（Vite + React 18 + TS + Tailwind + Zustand）。`web/` 仅存放生成的 `data.js` / `papers.js`。

## 功能

- **间隔重复背词**：SM-2 风格状态机，新词「评估 → 3 次练习 → 复习」
- **真题模式**：按年份篇章背词，背完读原文，命中词高亮
- **点词查义**：例句/原文中词库词点击弹释义卡（含发音）
- **on-card 翻译**：例句中文翻译，走后端 LLM 代理，key 不放前端
- **本地优先**：学习进度先落 localStorage，登录后静默镜像到服务端
- **账号系统**：注册/登录/进度同步（PBKDF2 + Bearer token）

## 一键部署（Docker Compose，推荐）

需要 Docker。会起 **PostgreSQL + 应用** 两个服务：

```bash
# 可选：LLM
export EW_LLM_URL="http://your-llm-host/v1"
export EW_LLM_KEY="your-key"
export EW_LLM_MODEL="deepseek-v4-flash"

docker compose up -d --build
```

浏览器打开 `http://localhost:8000`。

> - 数据卷 `pgdata` 持久化 PostgreSQL。
> - 宿主 PG 映射端口 `5433`（容器内 5432）。
> - 仅改应用镜像、不改 compose 时：`docker compose up -d --build app`。

### 从旧 SQLite 迁数据进容器 PG

```bash
# 1. 先起库
docker compose up -d db

# 2. 宿主机迁移（把 SQLite 灌进映射端口 5433）
export EW_DATABASE_URL=postgres://english:english@localhost:5433/english_web
.venv/bin/pip install 'psycopg[binary]'
.venv/bin/python3 scripts/migrate_sqlite_to_pg.py --wipe

# 3. 再起应用
docker compose up -d app
```

### 仅 docker run（需自备 PostgreSQL）

```bash
docker run -d \
  --name english_web \
  -p 8000:8000 \
  -e EW_DATABASE_URL="postgres://user:pass@host:5432/english_web" \
  -e EW_LLM_URL="http://your-llm-host/v1" \
  -e EW_LLM_KEY="your-key" \
  -e EW_LLM_MODEL="deepseek-v4-flash" \
  --restart unless-stopped \
  ghcr.io/makima04/learning_web:latest
```

### 发布镜像到 ghcr.io（CI amd64 + 本地 arm64）

GitHub Actions 只构建 **linux/amd64**（`:amd64-latest` / `:amd64-<sha>`），避免 multi-arch QEMU 与 GHA cache 失败。arm64 在本机 Mac 推：

```bash
# 1. 推 main，等 Actions 成功
git push origin main

# 2. 登录 ghcr（token 需 write:packages）
echo "$GHCR_TOKEN" | docker login ghcr.io -u YOUR_GITHUB_USER --password-stdin

# 3. 本地构建 arm64，并合成 multi-arch :latest / :<sha>
./scripts/publish-arm64-image.sh
```

生产板（arm64）再：

```bash
docker pull ghcr.io/makima04/learning_web:latest
docker compose up -d app
```

若 CI 已好、arm 已推、只需重合成 manifest：`./scripts/publish-arm64-image.sh --manifest-only`。

## 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `EW_DATABASE_URL` | `postgres://makima@localhost/english_web` | PostgreSQL 连接串 |
| `EW_HOST` / `EW_PORT` | `0.0.0.0` / `8000` | 监听 |
| `EW_STATIC_DIR` | `frontend/dist` | 静态资源目录 |
| `EW_SESSION_TTL_DAYS` | `30` | 会话天数 |
| `EW_ALLOW_FIRST_ADMIN` | `1` | 首位注册用户是否 admin |
| `EW_TRUSTED_PROXY_HOPS` | `0` | 可信反向代理跳数；直连保持 `0`，单层反代设为 `1` |
| `EW_LLM_URL` / `KEY` / `MODEL` | （空） | LLM 网关（OpenAI 兼容） |
| `EW_RESEND_API_KEY` | （空） | Resend 发信 API Key；空则默认 `EW_MAIL_DEV` 开发模式 |
| `EW_MAIL_FROM` | `english_web <onboarding@resend.dev>` | 发件人 |
| `EW_MAIL_DEV` | key 空时 `1` | `1` 时不真正发信，验证码打日志并在 API 返回 `dev_code` |

> 也可用项目根 `ew_llm.json`（本地开发）；环境变量优先。

### 邮箱验证码

- 发码：`POST /api/auth/email/send-code` `{ email, purpose: "register"|"login" }`
- 注册：`POST /api/auth/email/register` `{ email, code, password? }`
- 登录：`POST /api/auth/email/login` `{ email, code }`
- 生产：配置 `EW_RESEND_API_KEY` + 域名发件人；本地可直接用开发模式。

### 例句翻译（共用缓存）

- `POST /api/translate` 仅接受像例句的文本；成功译文写入全局 `translations`，已 `ok` 永不重翻。
- 已移除 `/api/translate/{id}/retranslate`。

## 本地开发

```bash
# 建库（一次）
createdb english_web

export EW_DATABASE_URL=postgres://makima@localhost/english_web

# 可选：从旧 SQLite 迁数据
.venv/bin/pip install 'psycopg[binary]'
.venv/bin/python3 scripts/migrate_sqlite_to_pg.py --wipe

# 可选：灌例句
.venv/bin/python3 scripts/seed_sentences_pg.py

# 终端 1：Rust 后端
cd backend && cargo run

# 终端 2：前端热更新
cd frontend && npm run dev   # → :5173，/api 代理到 8000

# 或一键生产构建 + 启动
./start.sh
```

需要：Rust stable、PostgreSQL 16+、Node（前端）、Python 3.12+（数据管线 / 迁移脚本）。

## 数据迁移（SQLite → PostgreSQL）

```bash
export EW_DATABASE_URL=postgres://makima@localhost/english_web
.venv/bin/python3 scripts/migrate_sqlite_to_pg.py --wipe
```

会迁移：users / sessions / sentences / translations / parses / paragraph_analyses / paper_answers / cards / meta / config / user_settings。密码哈希原样拷贝，登录方式不变。

## 数据来源

- 词库：`web/data.js`（脚本生成，勿手改）
- 真题：`web/papers.js`（~8MB，脚本生成）

## 项目结构

```
backend/             Rust Axum + sqlx + PostgreSQL（含 ew_pipeline CLI）
  src/routes/        /api/* 路由
  migrations/        001_init.sql
frontend/            React（Vite/TS/Tailwind/Zustand）→ dist
web/                 数据产物 only：data.js、papers.js
scripts/             数据管线 + migrate_sqlite_to_pg.py + seed_sentences_pg.py
docs/                UI 设计文档
docker-compose.yml   app + postgres
Dockerfile           多阶段：Node 前端 + Rust 后端
```

## License

MIT
