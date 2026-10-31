# 架构与模块边界

项目保持同源单体：Axum 托管 Vite 产物，PostgreSQL 保存账号数据，静态内容由数据管线生成。

## 英语学习

调用链：`StudyPage → study store → completeWord → completeStudy`。

- `features/study/domain/completion.ts`：纯学习过关规则，输入卡片不变，不访问 Zustand、网络或存储；日期统一走 `lib/day.ts`。
- `features/study/application/completeWord.ts`：读取最新卡片、生成幂等命令，先持久化命令，再更新本地卡片、词表和计数。
- `features/study/infrastructure/completionQueue.ts`：按账号、按操作 ID 单独存储命令，确认成功后才删除。多个标签页不再读改写同一个学习队列对象。
- `stores/study.ts`：分组、答题与页面阶段；不会自行计算 SRS 或分别镜像学习结果。

登录后 POST `/api/study/completions/bulk`，每批至多 200 条，内容包括 `operation_id / word_idx / card / event_type / day_key / client_at`。
`services/study.rs` 校验命令，在同一个事务中写幂等凭据、卡片、学习事件，并从事件更新当日统计。
同一账号的学习写入与清空进度共用用户行锁；重置前的离线命令不会复活旧进度。重复操作 ID 的不同内容返回冲突。

未登录继续使用本地进度。旧卡片、事件、导入接口保留兼容；存在待提交学习命令时，旧同步不能把对应卡片提前单独写入，也不能回放一份重复事件。

## 账号文档

`services/documents.rs` 统一知识图谱和政治文档的校验、读取和条件 UPSERT。
版本比较在 SQL 写入时原子执行，文档内 `updatedAt` 与接口版本统一。旧请求不会在并发窗口内无条件覆盖更新文档。

这里仍是客户端时间戳驱动的整包 LWW，**尚不支持两个设备对同一文档不同实体的自动合并**。
后续应迁移为按知识点、题目标记、草稿和笔记同步，使用服务端修订号及删除墓碑。

## 测试与发布

前端：`cd frontend && npm test && npm run build`。

后端：`DATABASE_URL=postgres://用户:密码@localhost/postgres cargo test --manifest-path backend/Cargo.toml`。
SQLx 集成测试需要可创建数据库的测试账号，会自动创建并清理隔离数据库；不要使用生产环境账号。
CI 提供 PostgreSQL 服务，实际执行迁移、并发写入、事务回滚、重试幂等和账号隔离测试。

ARM64 发布脚本要求工作区已提交且目标 SHA 等于 HEAD；manifest-only 可独立合并已有镜像。

## 后续边界

通用离线队列仍有 localStorage 实现，IndexedDB 的整体迁移、内容分片、LLM 持久化任务和前后端契约生成尚未在本次变更中引入。
新增业务应沿用 domain / application / infrastructure 的划分，并为跨设备写入提供服务端事务和冲突策略。
