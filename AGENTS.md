# AGENTS.md

This file provides guidance to coding agents when working with code in this repository.

## 查代码先走 codegraph

需要理解/定位代码（"X 在哪""X 怎么实现""谁调用了 X""改 X 会影响什么"）时，**先用 codegraph 工具**（`codegraph_explore` / `codegraph_callers` / `codegraph_callees` / `codegraph_impact` / `codegraph_search`），再考虑 grep/Read。仅在 codegraph 未覆盖某细节时才回退到 Read/Grep 确认。

## 项目概览

「小祥学习」考研综合复习系统（英语红宝书 6578 词 + 英语真题 + 考研数学一手稿/真题/李林 880/图谱 + 408 复习）。三层结构，自底向上：

1. **数据管线脚本** `scripts/` —— 词库、英语真题与数学手稿导出脚本（`export_math_handouts.py`）；`ew_pipeline`（Rust）生成 `web/papers.js`。
2. **后端** `backend/` —— Rust Axum + PostgreSQL，同源挂 `frontend/dist`，提供 `/api/*`。
3. **前端** `frontend/` —— Vite + React 18 + TS + Tailwind + Zustand + Radix。

`web/` **仅存放英语数据产物**（`data.js`、`papers.js`），无应用代码。

运行入口 `start.sh`：`npm run build` + `cargo build --release` + Rust `:8000`。  
开发：`cd backend && cargo run` + `cd frontend && npm run dev`（Vite `:5173`，/api 代理到 8000）。

## 常用命令

Python 管线用 `.venv/bin/python3`（数学手稿导出直接 `python3`）。后端默认 Rust。

```bash
# 运行应用（同源前后端，Rust + PG）
export EW_DATABASE_URL=postgres://makima@localhost/english_web
./start.sh

# 数学手稿导出与前端构建（每次改完手稿必跑）
python3 scripts/export_math_handouts.py
cd frontend && npm run build

# 词库与英语真题管线
.venv/bin/python3 scripts/extract_all.py          # PDF → words.json / words.csv
.venv/bin/python3 scripts/gen_data.py             # words.json → web/data.js (window.WORDS)
cargo run --manifest-path backend/Cargo.toml --bin ew_pipeline -- match papers/*.json
cargo run --manifest-path backend/Cargo.toml --bin ew_pipeline -- validate
```

## 数学手稿体系与全量补齐规范（硬约定）

1. **源头与导出链**：
   - 手稿源文件位于 `/Users/makima/Downloads/考研数学一手稿/`（23 章 46 讲独立 HTML+MathML）。
   - 统一由 `scripts/export_math_handouts.py` 导出为 `frontend/public/math/handouts.json`；**禁止手改 `handouts.json`**。
   - 每次修改手稿或导出逻辑后，必须：
     1. 运行 `python3 scripts/export_math_handouts.py`；
     2. 递增 `frontend/src/lib/mathHandouts.ts` 中的 `HANDOUTS_DATA_VERSION`；
     3. 在 `frontend/` 执行 `npm run build` 同步 `dist/`；
     4. 同步更新本文件「分批补齐进度表」与 `README.md` 统计。

2. **分类与补题原则（真题为主干，880 为辅助）**：
   - **真题定骨架**：每讲的场景分组（左侧导航）以**历年数一真题高频考法**为主干，控制在 **3–6 个场景**（单组一般 5–15 题），避免过粗（1 组塞 30 题）或过碎（拆出 10 组）。
   - **真题与 880 同步全量补齐**：按章分批补齐该章缺失的**历年数一真题**（对齐 `frontend/src/data/kg/math1Questions.json` 的 `id`）与**全部李林 880 题**（对齐 `frontend/public/math/lilin880.json` 的 `lilin880Id`），实现每章真题 + 880 的 100% 覆盖。
   - **跨章综合题允许重复放置**：同一道跨章题可同时出现在多个相关章节的手稿中；前端 `MathHandoutDetailPage.tsx` 与 `MathHandoutsPage.tsx` 均按 `id` / `lilin880Id` 读写「会 / 模糊 / 不会 / 斩掉」状态，自动互通进度。

3. **页面与场景结构规范**：
   - **左侧栏极简 3 块**：仅保留「判别场景列表」（点击直接切换当前激活的小类，显示各组进度 `x/y` / 完成勾）+「真题优先 / 880 优先切换」+「全部展开步骤 `Space`」（有已斩题时才显示「隐藏已斩」）；不放口诀、不放小字说明、不放底部重复入口。
   - **正文单页专注翻页闭环**：右侧只渲染当前选中的 1 个判别场景，无多余外层套娃边框；每个场景内**「核心讲解」单独作为第 0 页**（含「一句话起手」与展开式 `.scenario-guide` 卡片），**第 1–N 页每页只显示 1 道题**，与讲解页平级。顶部只留一行「场景名 + `[讲解] [1] [2] ...` 页码胶囊」，底部留唯一一条「上一页 / 下一题（或下一场景）」翻页栏，支持键盘 `←` / `→` 翻页、`Space` 显隐当前题步骤。

4. **公式、图文、解析风格与质量底线**：
   - 全程使用原生 MathML（0 `$` LaTeX 残留、`<math>` 标签 100% 闭合平衡）。
   - **应试高效原则（少堆生僻反例，直击核心要点）**：概念辨析与推导优先讲透「定理前提漏了什么、充分/必要方向有没有反、考场通用判别尺（一通百通）」，尽量少用难记的构造型怪反例，减轻记忆负担。
   - 补题必须逐图核对原题图（`/math/img/ll/...` 或真题卷）与官方解析图（`/math/img/ll-ans/...`），严禁仅凭 OCR 文本猜测公式；含函数/几何图形的题目必须在题干中内嵌 `<img src="/math/img/ll/...">`。
   - 每次导出必须验证：该章 880 覆盖率 100%、`lilin880Id` 100% 绑定、数一真题 `matchedMath1` 绑定正确、路线图锚点 0 失效。

5. **文档与仓库清洁约定**：
   - 不保留旧版排版样页、各章静态 `目录.md`、一次性评审 HTML/Demo 目录或过时报告；文档与代码/数据必须时刻同步。

### 数学手稿全量补齐与分类重构进度表（`HANDOUTS_DATA_VERSION = "20261122v2"`）

> 全站 **46/46 份手稿（155 个判别场景、1,685 道例题、0 空组、0 坏图、0 `$` 残留）** 已全部完成场景化 UI 升级、**1,120/1,120（100%）李林 880** 与 **408/408（100%）历年数一真题** 全量覆盖，并对照《李林 880 数一题库》完成了全部 23 章的原生 MathML 题干/真实选项升级与高清原书解析图（1,120/1,120 齐备，`<details class="mh-orig-ans">`）挂载：

| 批次 | 科目与章节 | 覆盖与重构结果 | 状态 |
| --- | --- | --- | --- |
| 第 1 批 | 高数第 1 章 · 函数、极限与连续（5 讲） | **56 / 56 880 + 27 / 27 数一真题**（全量原生 MathML + 折叠原书解析图） | ✅ 已全量升级 |
| 第 2 批 | 高数第 2 章 · 一元函数微分学（4 讲） | **107 / 107 880 + 全量数一真题**（120 题逐题精修订正 + 折叠原书解析图） | ✅ 已全量精修 |
| 第 3 批 | 高数第 3–9 章 · 积分/解几/多元/重积分/微分方程/级数/线面积分（18 讲） | **495 / 495 880 + 全量数一真题**（338 题转原生 MathML 题干选项 + 分步/原书高清解析） | ✅ 已全量升级 |
| 第 4 批 | 线性代数第 10–15 章 · 行列式/矩阵/向量/方程组/相似/二次型（10 讲） | **260 / 260 880 + 90 道数一真题**（173 题转原生 MathML 题干选项 + 分步/原书高清解析） | ✅ 已全量升级 |
| 第 5 批 | 概率论与数理统计第 16–23 章 · 事件至假设检验（9 讲） | **202 / 202 880 + 93 道数一真题**（138 题转原生 MathML 题干选项 + 分步/原书高清解析） | ✅ 已全量升级 |

## 关键架构点

### 数据是「构建产物」，别手改

- `web/data.js`、`web/papers.js`、`frontend/public/math/handouts.json` 均由脚本生成，改动必须改源头并重跑对应脚本。

### 前端（frontend/）与后端（backend/）

- 前端：Vite + React 18 + TS + Tailwind + Zustand，生产构建产物在 `frontend/dist`。
- 后端：Rust Axum + PostgreSQL（`EW_DATABASE_URL`，默认 `postgres://makima@localhost/english_web`），鉴权 PBKDF2-HMAC-SHA256 + Bearer session；LLM key 收归服务端 `ew_llm.json` / `EW_LLM_*`。

### Docker / CI / 部署（multi-arch 全部在 CI 构建）

- 镜像：`ghcr.io/makima04/learning_web`，仅在 GitHub Actions（`.github/workflows/docker.yml`）原生构建 `amd64` + `arm64` 并合成 multi-arch `:latest`。
- 发版顺序：`git push origin main`（由用户手动执行）→ 等 CI 全绿 → 生产板 `docker pull && docker compose up -d app`。

## 跨设备同步（硬约定）

**任何用户学习/进度数据都必须可跨设备合并，且以服务端为权威**，不要只做本地-only 或 fire-and-forget 不拉回。

- 写路径：本地即时更新 UX → 登录则入队 / 镜像 API（`syncQueue` 可重试）→ `syncAccountData` / 页面进入时 `syncFromServer` 拉取。
- 读路径 / 冲突：以服务端快照为准覆盖本地缓存；允许「先推 pending 再拉」。
- 每日边界固定按**北京时间（UTC+8）0 点** `YYYY-MM-DD`（`lib/day.ts` 与后端 `src/day.rs` 统一口径）。
- 文件/注释保持中文风格。
