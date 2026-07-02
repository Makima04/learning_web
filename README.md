# english_web · 考研英语背词应用

红宝书 · 乱序 · 6550 词。三层结构：数据管线脚本 → FastAPI + SQLite 后端 → 纯 vanilla JS 前端（同源挂载）。

## 功能

- **间隔重复背词**：SM-2 风格状态机，新词「评估 → 3 次练习 → 复习」
- **真题模式**：按年份篇章背词，背完读原文，命中词高亮
- **点词查义**：例句/原文中任意词库收录的单词点击即弹释义卡（含发音）
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
> - `-v english_web_data:/data`：把 SQLite 数据库挂到命名卷，容器重建后进度不丢。
> - `EW_LLM_URL/EW_LLM_KEY/EW_LLM_MODEL`：LLM 网关配置（OpenAI 兼容）。**不配也能跑**——背词/真题/点词查义全部正常，仅例句中文翻译不可用。
> - 端口 8000 是容器内 uvicorn 监听端口；改宿主端口映射 `-p 8080:8000` 即可。

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
| `EW_DB_PATH` | `/data/english_web.db` | SQLite 数据库路径，指向卷内以持久化 |
| `EW_LLM_URL` | （空） | LLM 网关地址，OpenAI 兼容，如 `http://host:3000/v1` |
| `EW_LLM_KEY` | （空） | LLM API key |
| `EW_LLM_MODEL` | （空） | 默认模型名，UI 可在设置页切换 |

> 三个 `EW_LLM_*` 也可用项目根 `ew_llm.json` 文件配置（本地开发场景）；环境变量优先级更高。

## 本地开发（无 Docker）

```bash
./start.sh          # 灌例句 + 起 uvicorn :8000
# 或手动：
.venv/bin/python3 -m server.seed_sentences
.venv/bin/uvicorn server.app:app --port 8000
```

需要 Python 3.12+，依赖见 `requirements.txt`。前端是 `web/` 下的 vanilla JS，无需构建。

## 数据来源

- 词库：红宝书乱序版 6550 词（`web/data.js`，脚本生成，勿手改）
- 真题：历年考研真题（`web/papers.js`，~8MB，含篇章/命中词/例句）

## 项目结构

```
server/              FastAPI + stdlib sqlite3（单文件路由）
  app.py             /api/* 路由 + 静态挂载 web/
  db.py              SQLite 数据层
  auth.py            pbkdf2 + token
  llm.py             OpenAI 兼容网关代理（stdlib urllib）
  seed_sentences.py  从 papers.js 灌例句（幂等）
web/                 vanilla JS 前端（data.js/papers.js/api.js/srs.js/store.js/llm.js/app.js）
scripts/             数据管线（PDF 抽词库、真题解析匹配）
Dockerfile           多阶段构建，runner 不含 node
.github/workflows/   GitHub Actions 构建并推送镜像到 ghcr.io
```

## License

MIT
