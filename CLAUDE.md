# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 查代码先走 codegraph

需要理解/定位代码（"X 在哪""X 怎么实现""谁调用了 X""改 X 会影响什么"）时，**先用 codegraph 工具**（`codegraph_explore` / `codegraph_callers` / `codegraph_callees` / `codegraph_impact` / `codegraph_search`），再考虑 grep/Read。codegraph 是预建好的符号索引，一次调用即可拿到分组源码与调用关系，比 grep+read 循环快得多。仅在 codegraph 未覆盖某细节时才回退到 Read/Grep 确认。

（注：本会话 codegraph 的 projectPath 若未自动识别，调用时传 `projectPath: "/Users/makima/program/web/english_web"`；或先按 codegraph 提示初始化 `.codegraph/`。）

## 项目概览

考研英语背词应用「红宝书 · 乱序 · 6550 词」。三层结构，自底向上：

1. **数据管线脚本** `scripts/` —— 从 PDF 抽取词库与真题，生成前端可直接 `<script>` 加载的 JS 数据文件。
2. **后端** `server/` —— FastAPI + stdlib sqlite3，同源挂 `web/` 静态，提供 `/api/*`。
3. **前端** `web/` —— 纯 vanilla JS（无构建、无框架），靠全局对象通信。

运行入口 `start.sh`：先跑 `server.seed_sentences`（幂等灌例句），再 `uvicorn server.app:app --port 8000`，浏览器开 http://localhost:8000 。

## 常用命令

所有 Python 命令用项目根的 `.venv/bin/python3`（Python 3.14，已装 pdfplumber/pymupdf/fastapi/uvicorn/nltk 等）。

```bash
# 运行应用（同源前后端）
./start.sh
# 或手动：
.venv/bin/python3 -m server.seed_sentences        # 灌例句到 sentences 表（幂等）
.venv/bin/uvicorn server.app:app --port 8000
.venv/bin/python3 -m server.db                    # 仅建库 english_web.db

# 词库管线（从红宝书 PDF 重建词库，极少重跑）
.venv/bin/python3 scripts/extract_all.py          # PDF → words.json / words.csv / report.txt
.venv/bin/python3 scripts/gen_data.py             # words.json → web/data.js (window.WORDS)

# 真题管线
.venv/bin/python3 scripts/parse_paper.py papers/2023.pdf papers/2023.json   # 单份解析
.venv/bin/python3 scripts/match_vocab.py papers/*.json                       # 全部 → web/papers.js (window.PAPERS)
.venv/bin/python3 scripts/validate_parse.py       # 跑全部年份 PDF 回归校验题量

# LLM CLI（与 web/llm.js 行为一致的命令行镜像，用于离线测试翻译/模型列表）
.venv/bin/python3 scripts/llm_translate.py models
.venv/bin/python3 scripts/llm_translate.py translate "The homeless make up..."
```

无测试套件（`package.json` 的 test 是占位）。无 lint 配置。Node 侧仅 `pdfjs-dist`，给 `scripts/inspect-pdf.mjs` 这类探针用。

## 关键架构点

### 数据是「构建产物」，别手改

`web/data.js`（`window.WORDS`，~500KB）与 `web/papers.js`（`window.PAPERS`，~8MB）是脚本生成的，文件首行有 `auto-generated` 注释。改词库/真题数据要改源头（`words.json` / `papers/*.json`）再重跑 `gen_data.py` / `match_vocab.py`，不要直接编辑这两个 JS。`words.json`/`words.csv`/`report.txt` 同理由 `extract_all.py` 生成。

之所以用 `<script src="data.js">` 而非 `fetch(words.json)`：`file://` 打开 index.html 时 fetch 会被 CORS 挡，classic script 不受影响——应用可以双击运行，不必起服务。

### 前端：全局对象 + 固定加载顺序

`index.html` 末尾按序加载：`data.js` → `papers.js` → `api.js` → `srs.js` → `store.js` → `llm.js` → `app.js`。每个文件挂一个全局：`window.WORDS`/`PAPERS`/`Api`/`SRS`/`Store`/`LLM`。`app.js` 是主控制器，负责 dashboard、study session、真题模式、设置 UI、翻译管理页。改依赖关系时注意这个加载顺序。

- **`srs.js`**：纯函数 SM-2 风格间隔重复状态机。卡片对象形如 `{state, due, ivl, ease, reps, lapses, step}`，状态流转 `new → learn → review`。`answer(card,q,now)` 就地改 card 并返回；`preview` 不改。无依赖，可单测。
- **`store.js`**：localStorage 持久化 + 每日计数器按本地日期 `YYYY-MM-DD` 重置。**本地优先**：所有写操作先落 localStorage，登录后在后台静默镜像到服务端（`saveCard`→`Api.putCard`、`bumpMeta`→`Api.putMeta`，均不 await、失败静默）。`sync()` 登录时合并：cards 以 remote 为权威覆盖本地、本地独有保留；meta 仅同 dayKey 才覆盖。
- **`api.js`**：所有 `/api/*` 调用集中于此，自动带 Bearer token、统一错误抛 `Error(status,data)`。
- **`llm.js`**：翻译客户端，**只走后端 `/api/translate`**，不再直连 LLM 网关（key 不放前端）。`isConfigured()` 恒返 true，让 on-card 翻译总能尝试；后端未配置时返 `status:'unconfigured'`，UI 据此提示。译文命中 `Store.getTrans` 缓存则瞬返。

### 后端：单文件路由 + stdlib sqlite3

- **`server/app.py`**：所有 `/api` 路由集中于此。静态挂载 `web/` 在**最后**（避免吞 `/api`）。启动时 `init_db()`。注意 `/api/translate/batch` 必须在 `/api/translate/{sid}` 之前注册，否则 `"batch"` 会被当 sid 匹配。
- **`server/db.py`**：SQLite 在项目根 `english_web.db`（`server/` 上一级）。每请求开一个连接（同步端点 OK，勿跨线程复用），`row_factory=Row`，`PRAGMA foreign_keys=ON`。`init_db()` 幂等建表并 seed `active_llm_model`。表：`users/sessions/sentences/translations/cards/meta/config`。
- **`server/auth.py`**：`pbkdf2_hmac('sha256',100000)` + 每用户 salt；token=`secrets.token_urlsafe(32)`；`get_user` 是 FastAPI 依赖，解析 Bearer → 查 sessions → 返回 user row，失败 401。
- **`server/llm.py`**：OpenAI 兼容网关代理，**仅 stdlib urllib**。读项目根 `ew_llm.json`（`{url,key,model}`）。`translate_text` 用的 model 取 `config` 表 `active_llm_model`，覆盖 json 里的 model。`join_url` 容忍尾斜杠、无 `/vN` 时补 `/v1`——这套逻辑在 `server/llm.py`、`scripts/llm_translate.py` 两处保持一致，改一处要同步另一处。
- **`server/seed_sentences.py`**：从 `web/papers.js` 抠 `window.PAPERS=<json>` 段，遍历 passages.words.sentences，按 text 去重 `INSERT OR IGNORE` 进 `sentences` 表。

### LLM key 收归服务端

`ew_llm.json` 在项目根，含 `{url,key,model}`，**不进前端**。on-card 翻译走 `POST /api/translate`（按文本，**无需 token**，全局共享：译文存 `translations` 表，命中 `status=ok` 直返）。翻译管理端点（按 id 翻译/重翻/批量、`/api/llm/*` 配置）需登录。系统 prompt（`server/llm.py` 的 `SYS_PROMPT`）要求只输出简体中文译文，在 `scripts/llm_translate.py` 里也有一份相同文本。

### 真题模式（studyMode: "daily" | "passage"）

`app.js` 里 `studyMode` 决定 `nextCard` 走哪条队列。daily 模式：`buildQueue()` 先 due 复习、再新词（受 `dailyNew` 与 `meta.newToday` 限制）。passage 模式：从 `window.PAPERS` 取某篇章命中的词，已毕业进 review 的跳过，其余每词一张卡，**复用同一套 SRS 卡片**（与日常背词共享记忆曲线）；背完进入 reader 读原文，命中词高亮（`highlightWords` 含粗略屈折还原 -s/-ed/-ing）。

## 常量与约定

- 词库总量 6550，`window.WORDS` 条目形如 `[index, english, [[pos,cn],...]]`（短键、数组而非对象，省体积）。
- 卡片在 SQLite `cards` 表的主键是 `(user_id, word_idx)`，`word_idx` 即 `window.WORDS` 的 index。
- 前端每日边界用本地时区 `YYYY-MM-DD`（`Store.dayKey`）；后端 `meta` 表 `day_key` 同格式。
- 文件/注释大量中文，保持中文注释风格。
