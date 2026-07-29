# DEPRECATED：旧 Python / FastAPI 后端

**状态：已弃用，请勿用于新部署或新功能开发。**

| 项 | 说明 |
|----|------|
| 默认入口 | `start.sh` / Docker / 文档均指向 **Rust** `backend/` |
| 数据库 | 旧路径偏 SQLite；生产为 **PostgreSQL** |
| 功能差距 | 邮箱登录、`learned`/`quiz`、翻译缓存策略、清空 cards 等以 Rust 为准 |
| 保留原因 | 历史对照、少量迁移/测试参考 |

## 该用什么

```bash
export EW_DATABASE_URL=postgres://makima@localhost/english_web
cd backend && cargo run --release
# 或 ./start.sh
```

## 何时删除

确认无外部脚本依赖 `server/` 后，可整目录删除；Python **数据管线** `scripts/` 与 `tests/` 仍保留。
