# english_web · 考研综合复习系统（英语 · 数学一 · 408）

前后端同源部署的个人考研复习平台：三层结构为 **数据管线脚本 (`scripts/`) → Rust + PostgreSQL 后端 (`backend/`) → React 前端 (`frontend/`)**。

模块边界、学习事务与同步协议见 [架构说明](docs/architecture.md)；开发与手稿维护规范见 [AGENTS.md](AGENTS.md)。

## 核心模块

- **考研英语（红宝书 6578 词 + 真题）**：SM-2 间隔重复背词、按年份篇章背词与原文阅读、点词查义、服务端 LLM 例句翻译缓存。
- **考研数学一（手稿 + 真题 + 李林 880 + 知识图谱）**：
  - 46 讲独立 HTML+MathML 手稿（共 **204 个判别场景、1,678 题、0 个失效路线图锚点**，已实现 **1,120/1,120（100%）李林 880** 与 **408/408（100%）历年数一真题** 全量覆盖；高数 27 讲 975 题、线代 10 讲 382 题、概统 9 讲 321 题）。
  - 左侧极简「判别场景」导航（带每组进度与滚动高亮）+「真题优先 / 880 优先」切换 + `Space` 快捷显隐答题步骤；右侧每个场景内展开「看式子认题眼 / 核心关键与起手 / 高频坑点 / 示范母题路线图」。
  - 跨章题与真题/880 同题按 `id` / `lilin880Id` 全站同步「会 / 模糊 / 不会 / 斩掉」进度。
- **408 手稿**：数据结构、组成原理、操作系统、计算机网络按章节与考点复习。选择题先看判断依据与边界自测，大题按对应真题看答题方法和卷面步骤，再逐页练历年真题与配套王道题。自评、斩题和错题复习复用账号进度，目录也可进入按年份练习和模考。
- **多端同步与账号系统**：本地优先即时响应，登录后自动镜像并拉取服务端权威状态（PBKDF2 + Bearer token）。

## 本地开发与手稿更新

```bash
# 1. 更新数学手稿数据（修改 materials/math/handouts/ 后）
python3 scripts/export_math_handouts.py
(cd frontend && npm run build)

# 2. 一键构建和启动（自动启动已迁入项目的 PostgreSQL）
./start.sh

# 或从项目根开始，在不同终端启动开发服务
./scripts/local_postgres.sh start # 使用项目内数据库时执行
(cd backend && cargo run)        # 后端 :8000
(cd frontend && npm run dev)     # 前端 :5173（/api 代理到 8000）
```

本机的项目内 PostgreSQL 通过 `.local/run/` 的 Unix socket 连接。连接串由 `scripts/local_postgres.sh start` 写入 `.local/database-url`。执行 `scripts/local_postgres.sh stop` 可停止这一个实例。已配置 `EW_DATABASE_URL` 或 `DATABASE_URL` 时，应用连接对应数据库。新检出的仓库可通过这些环境变量连接已有 PostgreSQL。

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

## 提交到 GitHub 的内容

| 内容 | 路径 |
| --- | --- |
| 源代码与构建配置 | `backend/`、`frontend/src/`、`frontend/scripts/`、`scripts/`、锁文件、`Dockerfile`、`docker-compose.yml`、`.github/workflows/` |
| 站点已生成的数据 | `web/` 的三份英语数据，以及 `frontend/public/` 内的手稿 JSON、题库、题图和站点资源 |
| 维护文档与配置示例 | `docs/`、`README.md`、`AGENTS.md`、`.env.example`、`ew_llm.json.example` |

本地开发和镜像构建都从 `web/` 同步英语数据到 `frontend/public/`，生成的三份副本由 Git 忽略。修改手稿时，先在本机导出，再一并提交新版 `frontend/public/math/handouts.json`、引用的新增站点资源和版本号。

`materials/`、`papers/`、`.local/`、`tmp/`、`releases/`、真实的 `.env` 和 `ew_llm.json` 留在本机。依赖目录和 `frontend/dist/` 由构建重新生成。

## 主要环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `EW_DATABASE_URL` / `DATABASE_URL` | 项目内 `.local/database-url`，其次为 `postgres://makima@localhost/english_web` | PostgreSQL 连接串 |
| `EW_HOST` / `EW_PORT` | `0.0.0.0` / `8000` | 服务监听地址与端口 |
| `EW_STATIC_DIR` | `frontend/dist` | 前端静态资源目录 |
| `EW_SESSION_TTL_DAYS` | `30` | 登录会话有效天数 |
| `EW_LLM_URL` / `KEY` / `MODEL` | （空） | OpenAI 兼容 LLM 网关（本地亦可用 `ew_llm.json`） |
| `EW_RESEND_API_KEY` / `EW_MAIL_FROM` | （空） | 邮箱验证码发信配置；留空走开发模式 |

## 项目结构

```text
backend/              Rust Axum + sqlx + PostgreSQL（含 ew_pipeline CLI）
frontend/             React 前端，站点数据在 public/，构建输出到 dist/
web/                  英语词库与真题的发布数据（data.js、papers.js、wordinfo.js）
scripts/              数据管线、维护和部署脚本
docs/                 架构与核心功能设计文档
materials/            本地原始资料
  english/            红宝书原始 PDF
  math/handouts/      数学手稿 HTML 主源
  math/lilin880/      李林 880 题本、解析和参考资料
  math/zhangyu1000/   张宇 1000 题本与解析的预留位置
  cs408/wangdao/      王道 408 原始资料
  politics/xiao1000/  肖 1000 题本与解析的预留位置
papers/               试卷归档与题库处理中间数据
tmp/                  OCR 缓存、题库合并的中间文件与预览
.local/               本地运行数据
  postgres/           PostgreSQL 数据目录
  backups/            PostgreSQL 逻辑备份
  logs/               本地服务日志
docker-compose.yml    app + postgres 编排
Dockerfile            Node 前端 + Rust 后端多阶段构建
```

备份资料时，原件在 `materials/`，账号与学习记录在 PostgreSQL 及其逻辑备份中。

## License

MIT
