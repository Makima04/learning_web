# syntax=docker/dockerfile:1.6
# 多阶段：frontend 构建 React dist → runtime 挂 frontend/dist + web/ 数据

# ---- frontend build ----
FROM node:22-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
COPY web/data.js public/data.js
COPY web/papers.js public/papers.js
RUN npm run build

# ---- Python deps ----
FROM python:3.12-slim AS deps
WORKDIR /app
ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# ---- runtime ----
FROM python:3.12-slim AS runtime
LABEL org.opencontainers.image.title="english_web" \
      org.opencontainers.image.description="考研英语背词应用 · 红宝书乱序 6550 词"

COPY --from=deps /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=deps /usr/local/bin /usr/local/bin

WORKDIR /app

COPY server/ ./server/
# 数据产物：seed_sentences 与镜像内备用
COPY web/ ./web/
COPY --from=frontend /app/frontend/dist ./frontend/dist

ENV EW_DB_PATH=/data/english_web.db \
    EW_LLM_URL="" \
    EW_LLM_KEY="" \
    EW_LLM_MODEL="" \
    PYTHONUNBUFFERED=1

VOLUME ["/data"]
EXPOSE 8000

CMD ["sh", "-c", "python -m server.seed_sentences && uvicorn server.app:app --host 0.0.0.0 --port 8000"]
