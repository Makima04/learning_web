# 修复计划：SRS 调度 + 同步 / 账号隔离

> 来源：2026-07-29 项目 bug / 架构审查  
> 状态图例：`[ ]` 未开始 · `[~]` 进行中 · `[x]` 已完成 · `[-]` 取消 / 推迟

## 目标

修复学习核心与同步边界上的 P0 缺陷，使：

1. **到期复习**语义与 `card.due` 一致  
2. **间隔调度**真正写入卡片（不再永远 +1 天）  
3. **清空进度**可收敛到服务端  
4. **多账号**不在同一浏览器串数据  

后续 P1/P2 单独开 PR，不在本轮强行做完。

---

## 依赖关系（实现顺序）

```text
PR1 due 过滤 ──┐
               ├──→ PR2 真实调度（共用 study.ts）
PR3 清空远端 ──┘
PR4 账号隔离（可与 PR3 并行，但建议在 PR1–3 之后，减少冲突）
```

| PR | 主题 | 依赖 | 状态 |
|----|------|------|------|
| **PR1** | 复习队列 / snapshot 按 due 过滤 | — | [x] |
| **PR2** | `savePassedCard` 接入间隔调度 | PR1（同文件） | [x] |
| **PR3** | 清空进度同步服务端 | — | [x] |
| **PR4** | localStorage 按用户隔离 | 建议 PR1–3 后 | [x] |
| **PR5** | study_events 接入 savePassedCard | — | [x] |
| **PR6** | translate 未缓存 LLM 需登录 | — | [x] |
| **PR7** | 废弃 Python server 文档标注 | — | [x] |

---

## PR1 — 复习按 due + Dashboard 语义对齐

**状态：** [x] 完成（2026-07-29）

### 问题

- `buildQueue("review")` 只滤 `learned`，不过滤 `due <= now`
- `snapshot().due / reviewAvailable / mastered` 把「已学」当成「到期 / 掌握」
- Dashboard 文案「到期复习」与数据不一致

### 改动

| 文件 | 变更 |
|------|------|
| `frontend/src/stores/study.ts` | `isDue(card, now)`；review 队列 `learned && due <= now`；snapshot 分项：due / reviewing / mastered(`isMastered`) |
| `frontend/src/stores/study.test.ts` | 覆盖 due 过滤与 snapshot |
| `frontend/src/pages/DashboardPage.tsx` | 确认文案仍成立（若字段语义已修则可能无改） |

### 验收

- [x] 未到期 learned 卡不进复习队列  
- [x] `reviewAvailable` = min(今日剩余额度, 到期数)  
- [x] `mastered` 使用 `isMastered()`  
- [x] 相关单测通过  

---

## PR2 — 真实间隔调度写入卡片

**状态：** [x] 完成（2026-07-29）

### 问题

`savePassedCard` 固定 `due = now + DAY`，`srs.answer()` 未接入生产路径。

### 设计决策

当前 UI 是「评估 + 组内三轮重学」，不是 classic again/hard/good/easy 四键。映射：

| UI 结果 | 映射 Quality | 说明 |
|---------|--------------|------|
| 评估「认识」直接过 | `good`（已学过则 review 路径） | 首次学完进 review |
| 三轮重学完成 | `good` | 同上 |
| （若将来有「简单」） | `easy` | 预留 |

实现：

1. 从 `cloneCard(previous)` 得到可调度卡（保留 ease/ivl/reps/lapses/quiz/state）  
2. 若尚未 `learned`：先设 `state` 合理初值再 `answer(card, "good", now)`，并强制 `learned = true`  
3. 若已 `learned`：对 review 态调用 `answer(card, "good", now)`  
4. `updatedAt = now` 后 `save`

注意：`cloneCard` 当前把 `quiz` 清零——调度前应保留 `previous.quiz`（若仍走 learn 态）。本轮以「通过 = 毕业/推进 review」为主，避免破坏组内重学 UX。

### 改动

| 文件 | 变更 |
|------|------|
| `frontend/src/stores/study.ts` | `savePassedCard` 调用 `answer()`；`cloneCard` 保留 quiz |
| `frontend/src/lib/srs.ts` | 可选：首次毕业时同步 `learned`（或仅在 study 层设） |
| `frontend/src/stores/study.test.ts` | 通过后 `ivl/due` 符合 good 路径 |

### 验收

- [x] 新词首次通过后 `state=review`，`due ≈ now + ivl*DAY`，`ivl >= 1`  
- [x] 复习再次通过后 `ivl` 随 ease 增长，`due` 非固定 +1 天  
- [x] `srs.test.ts` 与 study 单测均绿  

---

## PR3 — 清空进度可同步到服务端

**状态：** [x] 完成（2026-07-29）

### 问题

`cards.clearAll` 只清 localStorage；无 DELETE API；登录用户重置后 sync 会拉回远端。

### 改动

| 文件 | 变更 |
|------|------|
| `backend/src/routes/cards.rs` | `DELETE /api/cards` 删除当前用户全部卡片；可选 `DELETE /api/cards/{idx}` |
| `frontend/src/lib/api.ts` | `deleteAllCards()` |
| `frontend/src/stores/cards.ts` | `clearAll` 登录时调删除 API，并清空 pending cards 队列 |
| `frontend/src/stores/meta.ts` | reset 后若登录则 put 当日零值（或接受 GREATEST 限制并在文案说明） |
| `frontend/src/pages/SettingsPage.tsx` | 文案：登录时清空账号服务端进度；确认框说明 |

Meta 同日 `GREATEST` 无法真降：清空时至少 `putMeta` 零值；跨日自然归零。可在设置页注明「今日统计以较高值为准，跨日后重新计数」。

### 验收

- [x] 登录 + 重置 → 远端 cards 为空，再次 sync 本地仍空  
- [x] 未登录重置仍只清本地  
- [x] journal 清空行为保持  

---

## PR4 — localStorage 按用户隔离

**状态：** [x] 完成（2026-07-29）

### 问题

`ew.cards.v1` 等全局 key；换号 / 登出会串进度与 pending 队列。

### 设计

```text
未登录:   ew.cards.v1          （访客本地）
用户 id=N: ew.cards.v1.uN      （账号命名空间）
pending:  ew.sync.pending.cards.v1.uN 等
```

| 时机 | 行为 |
|------|------|
| 登录成功 | flush 访客 pending（若有）→ 切换 namespace → rehydrate 各 store → `syncAccountData` |
| 登出 | 先 `flushPending` → 清 token → 切回访客 namespace 并 rehydrate（不把账号数据写回访客 key） |
| 启动 | 有 token 则用 `user.id` 命名空间 |

### 改动

| 文件 | 变更 |
|------|------|
| `frontend/src/lib/storageScope.ts`（新） | `currentScope()` / `scopedKey(base)` / `setScopeUserId` |
| `frontend/src/stores/cards.ts` meta settings journal | load/save 用 scoped key |
| `frontend/src/lib/syncQueue.ts` | pending keys scoped |
| `frontend/src/lib/api.ts` 或 `auth` / Settings 登录登出 | 切换 scope + rehydrate |
| 测试 | scope 切换不读写错 key |

### 验收

- [x] A 学词 → 登出 → B 登录：B 看不到 A 的本地卡  
- [x] B 登出后访客模式不加载 B 的账号卡  
- [x] 同步队列不跨账号 flush  

---

## PR5 — study_events 接入

**状态：** [x] 完成（2026-07-29）

- [x] `savePassedCard` 登录后 fire-and-forget `postStudyEvent`（`new`/`review` + `good`）
- [x] 单测覆盖登录 / 未登录

## PR6 — translate 公网加固

**状态：** [x] 完成（2026-07-29）

- [x] 缓存命中仍可匿名（IP 限流）
- [x] 未命中需登录；用户级 LLM 桶 20/min
- [x] 前端 401 友好提示

## PR7 — Python server 弃用标注

**状态：** [x] 完成（2026-07-29）

- [x] `server/DEPRECATED.md` + `app.py` 头注释
- [x] README / Agents.md / Claude.md 标明 DEPRECATED
- [ ] 整目录删除：确认无依赖后再做

---

## 测试与发布检查

- [x] `cd frontend && npm test`（或 vitest 相关）  
- [x] `cargo test --manifest-path backend/Cargo.toml`（若有）/ `cargo check`  
- [ ] 手动：学一词 → 看 due/ivl → 次日或改时钟测复习队列  
- [ ] 手动：双账号切换不串数据  
- [ ] 手动：登录重置后另一设备/强制 sync 仍为空  
- [ ] 手动：未登录翻译新句 → 401 提示；登录后可译  
- [ ] 手动：登录学词后 `/api/stats/today` 有事件  

---

## 进度日志

| 日期 | 事件 |
|------|------|
| 2026-07-29 | 创建本计划；开始 PR1–PR4 实现 |
| 2026-07-29 | PR1–PR4 代码完成；单测/cargo check 通过；文档状态标 [x] |
| 2026-07-29 | 提交 `4aa4caa`；实现 PR5–PR7（study_events / translate 登录 / server 弃用） |

---

## 非目标（明确不做）

- 不重做整页学习 UX（仍为评估 + 三轮重学）  
- 不引入完整 Anki 式四键 UI（除非后续产品要求）  
- 不在本轮拆 `papers.js` 体积  
- 不改 Docker / 部署流水线  
