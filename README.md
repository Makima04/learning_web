# english_web · 考研英语背词应用

红宝书 · 乱序 · 6550 词。三层结构：数据管线脚本 → FastAPI + SQLite 后端 → React 前端（同源挂载）。

**前端**：`frontend/`（Vite + React 18 + TS + Tailwind + Zustand）。`web/` 仅存放生成的 `data.js` / `papers.js` 数据文件。

## 功能

- **间隔重复背词**：SM-2 风格状态机，新词「评估 → 3 次练习 → 复习」
- **真题模式**：按年份篇章背词，背完读原文，命中词高亮
- **点词查义**：例句/原文中词库词点击弹释义卡（含发音）
- **on-card 翻译**：例句中文翻译，走后端 LLM 代理，key 不放前端
- **本地优先**：学习进度先落 localStorage，登录后静默镜像到服务端
- **账号系统**：注册/登录/进度同步（pbkdf2 + token）

## 一键部署（Docker）

镜像由 GitHub Actions 自动构建并发布到 GitHub Container Registry（ghcr.io）。

### 方式一：docker run（最快）

```bash
docker run -d \
  --name english_web \
  -p 8000:8000 \
  -v english_web_data:/data \
  -e EW_LLM_URL="http://your-llm-host/v1" \
  -e EW_LLM_KEY="your-key" \
  -e EW_LLM_MODEL="deepseek-v4-flash" \
  --restart unless-stopped \
  ghcr.io/makima04/learning_web:latest
```

浏览器打开 `http://localhost:8000` 即可使用。

> **说明**
> - `-v english_web_data:/data`：SQLite 挂命名卷，容器重建进度不丢。
> - `EW_LLM_*`：LLM 网关（OpenAI 兼容）。不配也能跑，仅例句翻译不可用。
> - 改宿主端口：`-p 8080:8000`。

### 方式二：docker-compose.yml

```yaml
services:
  english_web:
    image: ghcr.io/makima04/learning_web:latest
    container_name: english_web
    ports:
      - "8000:8000"
    volumes:
      - english_web_data:/data
    environment:
      EW_LLM_URL: "http://your-llm-host/v1"
      EW_LLM_KEY: "your-key"
      EW_LLM_MODEL: "deepseek-v4-flash"
    restart: unless-stopped

volumes:
  english_web_data:
```

```bash
docker compose up -d
```

### 升级

```bash
docker pull ghcr.io/makima04/learning_web:latest
docker rm -f english_web
# 再用上面的 docker run 重新启动（卷不变，进度保留）
```

## 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `EW_DB_PATH` | `/data/english_web.db` | SQLite 路径 |
| `EW_LLM_URL` | （空） | LLM 网关，OpenAI 兼容 |
| `EW_LLM_KEY` | （空） | API key |
| `EW_LLM_MODEL` | （空） | 默认模型名 |

> 也可用项目根 `ew_llm.json`（本地开发）；环境变量优先。

## 本地开发

```bash
./start.sh          # gen_version + seed + npm build + uvicorn :8000
# 或热更新开发：
.venv/bin/uvicorn server.app:app --port 8000   # 终端 1
cd frontend && npm run dev                     # 终端 2 → :5173
```

需要 Python 3.12+（`requirements.txt`）与 Node（`frontend/` 下 `npm install`）。

## 数据来源

- 词库：`web/data.js`（脚本生成，勿手改）
- 真题：`web/papers.js`（~8MB，脚本生成）

## 项目结构

```
server/              FastAPI + stdlib sqlite3
  app.py             /api/* + 静态 frontend/dist
  db.py / auth.py / llm.py / seed_sentences.py
frontend/            React（Vite/TS/Tailwind/Zustand）→ dist
web/                 数据产物 only：data.js、papers.js
docs/                UI 设计说明
scripts/             数据管线
tests/               Python 单测
Dockerfile           多阶段：Node 构建前端 + Python runtime
.github/workflows/   构建推送 ghcr.io
```

## License

MIT
