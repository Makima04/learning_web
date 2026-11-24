# english_web · 考研综合复习系统（英语 · 数学一 · 408）

前后端同源部署的个人考研复习平台：三层结构为 **数据管线脚本 (`scripts/`) → Rust + PostgreSQL 后端 (`backend/`) → React 前端 (`frontend/`)**。

模块边界、学习事务与同步协议见 [架构说明](docs/architecture.md)；开发与手稿维护规范见 [AGENTS.md](AGENTS.md)。

## 核心模块

- **考研英语（红宝书 6578 词 + 真题）**：SM-2 间隔重复背词、按年份篇章背词与原文阅读、点词查义、服务端 LLM 例句翻译缓存。
- **考研数学一（手稿 + 真题 + 李林 880 + 知识图谱）**：
  - 46 讲独立 HTML+MathML 手稿（共 **155 个判别场景、1,678 题**，已实现 **1,120/1,120（100%）李林 880** 与 **408/408（100%）历年数一真题** 全量覆盖；高数 27 讲 975 题、线代 10 讲 382 题、概统 9 讲 321 题）。
  - 左侧极简「判别场景」导航（带每组进度与滚动高亮）+「真题优先 / 880 优先」切换 + `Space` 快捷显隐答题步骤；右侧每个场景内展开「看式子认题眼 / 核心关键与起手 / 高频坑点 / 示范母题路线图」。
  - 跨章题与真题/880 同题按 `id` / `lilin880Id` 全站同步「会 / 模糊 / 不会 / 斩掉」进度。
- **408 与复习性价比**：王道 408 题库、错题本（1/3/7/14 复习队列）与知识图谱掌握度联动。
- **多端同步与账号系统**：本地优先即时响应，登录后自动镜像并拉取服务端权威状态（PBKDF2 + Bearer token）。

## 本地开发与手稿更新

```bash
# 1. 更新数学手稿数据（修改 /Users/makima/Downloads/考研数学一手稿 后）
python3 scripts/export_math_handouts.py
cd frontend && npm run build

# 2. 本地开发启动
export EW_DATABASE_URL=postgres://makima@localhost/english_web
cd backend && cargo run          # 后端 :8000
cd frontend && npm run dev       # 前端 :5173（/api 代理到 8000）

# 或一键生产构建 + 启动
./start.sh
```

## 部署与发版（Docker Compose + GitHub Actions）

```bash
export EW_LLM_URL="http://your-llm-host/v1"
export EW_LLM_KEY="your-key"
export EW_LLM_MODEL="deepseek-v4-flash"

docker compose up -d --build
```

浏览器访问 `http://localhost:8000`。

- 生产镜像 `ghcr.io/makima04/learning_web:latest` 由 `.github/workflows/docker.yml` 原生构建 `linux/amd64` 与 `linux/arm64` 并合成 multi-arch manifest。
- 发布流程：`git push origin main` → 等待 Actions 完成 → 生产机执行 `docker pull ghcr.io/makima04/learning_web:latest && docker compose up -d app`。

## 主要环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `EW_DATABASE_URL` | `postgres://makima@localhost/english_web` | PostgreSQL 连接串 |
| `EW_HOST` / `EW_PORT` | `0.0.0.0` / `8000` | 服务监听地址与端口 |
| `EW_STATIC_DIR` | `frontend/dist` | 前端静态资源目录 |
| `EW_SESSION_TTL_DAYS` | `30` | 登录会话有效天数 |
| `EW_LLM_URL` / `KEY` / `MODEL` | （空） | OpenAI 兼容 LLM 网关（本地亦可用 `ew_llm.json`） |
| `EW_RESEND_API_KEY` / `EW_MAIL_FROM` | （空） | 邮箱验证码发信配置；留空走开发模式 |

## 项目结构

```text
backend/             Rust Axum + sqlx + PostgreSQL（含 ew_pipeline CLI）
frontend/            React + Vite + TS + Tailwind + Zustand（构建产物至 dist/）
web/                 英语词库与真题构建产物（data.js、papers.js，勿手改）
scripts/             词库、真题与数学手稿导出脚本（export_math_handouts.py）
docs/                架构与核心功能设计文档
docker-compose.yml   app + postgres 编排
Dockerfile           Node 前端 + Rust 后端多阶段构建
```

## License

MIT
