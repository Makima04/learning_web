# syntax=docker/dockerfile:1.6
# 多阶段构建：runner 镜像不含 npm/node，体积小。
# vanilla 前端 web/ 是当前可运行版本（frontend/ 的 React 重写未完成，无 dist），无需构建。

# ---- deps: 装 Python 依赖 ----
FROM python:3.12-slim AS deps
WORKDIR /app
ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# ---- runtime ----
FROM python:3.12-slim AS runtime
LABEL org.opencontainers.image.title="english_web" \
      org.opencontainers.image.description="考研英语背词应用 · 红宝书乱序 6550 词"

# 从 deps 拷贝已装好的 site-packages + 入口
COPY --from=deps /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=deps /usr/local/bin /usr/local/bin

WORKDIR /app

# 应用代码（server/ + web/ 静态，含 data.js / papers.js；seed_sentences 回退读 web/papers.js）
COPY server/ ./server/
COPY web/ ./web/

# 运行时配置（可被环境变量覆盖）
ENV EW_DB_PATH=/data/english_web.db \
    EW_LLM_URL="" \
    EW_LLM_KEY="" \
    EW_LLM_MODEL="" \
    PYTHONUNBUFFERED=1

# 持久化数据库的卷
VOLUME ["/data"]
EXPOSE 8000

# 启动：先幂等灌例句，再起 uvicorn（与 start.sh 一致，跳过 frontend 构建）
CMD ["sh", "-c", "python -m server.seed_sentences && uvicorn server.app:app --host 0.0.0.0 --port 8000"]
