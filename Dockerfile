# syntax=docker/dockerfile:1.6
# 多阶段：frontend (Vite) → rust builder → 精简 runtime
# 运行时依赖 PostgreSQL（见 docker-compose.yml）

# ---- frontend ----
FROM node:22-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
COPY web/data.js public/data.js
COPY web/papers.js public/papers.js
RUN npm run build

# ---- rust build ----
FROM rust:1-bookworm AS rust
WORKDIR /app/backend
# 依赖缓存层：仅 toml/lock + 空 main
COPY backend/Cargo.toml backend/Cargo.lock ./
RUN mkdir -p src && echo 'fn main(){}' > src/main.rs \
 && cargo build --release \
 && rm -rf src
COPY backend/ ./
RUN touch src/main.rs && cargo build --release \
 && strip target/release/english_web_server
# ---- runtime ----
FROM debian:bookworm-slim AS runtime
LABEL org.opencontainers.image.title="english_web" \
      org.opencontainers.image.description="考研英语背词 · 红宝书乱序 6550 · Rust+PG"

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates libssl3 \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=rust /app/backend/target/release/english_web_server /app/english_web_server
COPY --from=frontend /app/frontend/dist /app/frontend/dist
# seed 用 papers（可选，容器内也可挂卷）
COPY web/ /app/web/

ENV EW_DATABASE_URL=postgres://english:english@db:5432/english_web \
    EW_HOST=0.0.0.0 \
    EW_PORT=8000 \
    EW_STATIC_DIR=/app/frontend/dist \
    EW_LLM_URL="" \
    EW_LLM_KEY="" \
    EW_LLM_MODEL="" \
    RUST_LOG=english_web_server=info,tower_http=info

EXPOSE 8000
USER nobody
CMD ["/app/english_web_server"]
