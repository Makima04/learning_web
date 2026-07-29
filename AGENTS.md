# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## 查代码先走 codegraph

需要理解/定位代码（"X 在哪""X 怎么实现""谁调用了 X""改 X 会影响什么"）时，**先用 codegraph 工具**（`codegraph_explore` / `codegraph_callers` / `codegraph_callees` / `codegraph_impact` / `codegraph_search`），再考虑 grep/Read。codegraph 是预建好的符号索引，一次调用即可拿到分组源码与调用关系，比 grep+read 循环快得多。仅在 codegraph 未覆盖某细节时才回退到 Read/Grep 确认。

（注：本会话 codegraph 的 projectPath 若未自动识别，调用时传 `projectPath: "/Users/makima/program/web/english_web"`；或先按 codegraph 提示初始化 `.codegraph/`。）

## 项目概览

考研英语背词应用「红宝书 · 乱序 · 6550 词」。三层结构，自底向上：

1. **数据管线脚本** `scripts/` —— 从 PDF 抽取词库与真题；`ew_pipeline`（Rust）生成 `web/papers.js`。
2. **后端** `backend/` —— Rust Axum + PostgreSQL，同源挂 `frontend/dist`，提供 `/api/*`。
3. **前端** `frontend/` —— Vite + React 18 + TS + Tailwind + Zustand + Radix。

`web/` **仅存放数据产物**（`data.js`、`papers.js`），无应用代码。

运行入口 `start.sh`：`npm run build` + `cargo build --release` + Rust `:8000`。  
开发：`cd backend && cargo run` + `cd frontend && npm run dev`（Vite `:5173`，/api 代理到 8000）。

## 常用命令

Python 管线仍用 `.venv/bin/python3`。后端默认 Rust。

```bash
# 运行应用（同源前后端，Rust + PG）
export EW_DATABASE_URL=postgres://makima@localhost/english_web
./start.sh
# 或手动：
cp web/data.js web/papers.js frontend/public/
cd frontend && npm run build
cd backend && cargo run --release

# 词库管线（从红宝书 PDF 重建词库，极少重跑）
.venv/bin/python3 scripts/extract_all.py          # PDF → words.json / words.csv / report.txt
.venv/bin/python3 scripts/gen_data.py             # words.json → web/data.js (window.WORDS)

# 真题管线
.venv/bin/python3 scripts/parse_paper.py papers/2023.pdf papers/2023.json
cargo run --manifest-path backend/Cargo.toml --bin ew_pipeline -- match papers/*.json   # → web/papers.js (window.PAPERS)
cargo run --manifest-path backend/Cargo.toml --bin ew_pipeline -- validate

# LLM CLI
cargo run --manifest-path backend/Cargo.toml --bin ew_pipeline -- models
cargo run --manifest-path backend/Cargo.toml --bin ew_pipeline -- translate "The homeless make up..."
```

前端有部分 vitest 单元测试（`frontend/src/**/*.test.ts`）；`frontend/package.json` 有 dev/build/preview。

## 关键架构点

### 数据是「构建产物」，别手改

`web/data.js`（`window.WORDS`，~500KB）与 `web/papers.js`（`window.PAPERS`，~8MB）由脚本生成。改词库/真题要改源头再重跑 `gen_data.py` / `ew_pipeline match`。构建时 `start.sh` / Docker 把它们拷到 `frontend/public/`，Vite 再复制进 `dist/`。

### 前端（frontend/）：React + Zustand

- **入口**：`index.html` classic script 加载 `/data.js`、`/papers.js`、`/version.js`，再挂 React。
- **`src/lib/`**：`api.ts`、`srs.ts`、`llm.ts`、`tts.ts`、`words.ts`、`lookup.ts`。
- **`src/stores/`**：`cards` / `meta` / `settings` / `auth` / `trans` / `theme` / `study`。本地优先 + 登录后 fire-and-forget 镜像服务端。
- **`src/pages/`**：Dashboard、Study、Papers、PapersRecite、Reader、Settings、TransMgr。
- **开发**：`cd frontend && npm run dev`；生产：`npm run build` → `frontend/dist`。

### 后端：Rust Axum + PostgreSQL

- **`backend/`**：Axum 路由在 `src/routes/*`；`migrations/001_init.sql` 启动时执行。
- **DB**：`EW_DATABASE_URL`（默认 `postgres://makima@localhost/english_web`）。
- **鉴权**：PBKDF2-HMAC-SHA256（600k，兼容旧 100k）+ Bearer session，与旧前端兼容。
- **LLM**：`ew_llm.json` / `EW_LLM_*` 环境变量；OpenAI 兼容网关。

### LLM key 收归服务端

`ew_llm.json` 在项目根，**不进前端**。on-card 翻译走 `POST /api/translate`（按文本，无需 token）。翻译管理与 `/api/llm/*` 需登录（配置改模型需管理员）。

### 真题模式

`study` store 的 `mode`: `learn` | `review` | `passage`。passage 复用同一套 SRS 卡片；背完可进 reader 读原文，命中词高亮（`lookup.ts` 词形还原）。

### Docker / CI / 部署（CI 只建 amd64，arm 本地推）

- 镜像：`ghcr.io/makima04/learning_web`（仓库名小写）。
- **分工**（避免 GHA 上 QEMU multi-arch + GHA cache 踩坑）：
  1. **CI**（`.github/workflows/docker.yml`）只构建 `linux/amd64`，推：
     - `:amd64-latest` / `:amd64-<sha>`
  2. **本地 Mac arm64**：`./scripts/publish-arm64-image.sh`
     - 推 `:arm64-latest` / `:arm64-<sha>`
     - 再 `imagetools` 把 amd64+arm64 合成 multi-arch 的 `:latest` / `:<sha>`
- 构建时传入 `EW_VERSION=<git-sha>`，设置页显示的版本即该 sha。
- 推荐发版顺序：`git push origin main` → 等 CI 成功 → 本地跑 arm 脚本 → 板子 pull。
- **生产板（如 `192.168.1.161` Orange Pi arm64）** 用 compose 拉镜像跑，**不是**服务器上的 git 工作树：
  - 目录示例：`/home/orangepi/learning_web`，`image: ghcr.io/makima04/learning_web:latest`，端口 `8800:8000`。
  - 在板子上 `git pull` **不会**更新容器；必须 `docker pull` + `docker compose up -d app`。
  - 板子应 pull **`:latest`（multi-arch）**；若只跑了 CI、没跑 arm 脚本，`:latest` 不会更新，可临时 pin `:arm64-latest`。

## 常量与约定

- 词库总量 6550，`window.WORDS` 条目 `[index, english, [[pos,cn],...]]`。
- 卡片主键 `(user_id, word_idx)`，`word_idx` 即 WORDS index。
- 每日边界本地时区 `YYYY-MM-DD`（`lib/day.ts` / meta `dayKey`）。
- 文件/注释大量中文，保持中文注释风格。
