-- users
CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    pw_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    is_admin BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS sentences (
    id BIGSERIAL PRIMARY KEY,
    text TEXT UNIQUE NOT NULL,
    year INTEGER,
    label TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS translations (
    sentence_id BIGINT PRIMARY KEY REFERENCES sentences(id) ON DELETE CASCADE,
    zh TEXT,
    status TEXT,
    model TEXT,
    translated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    translated_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS parses (
    sentence_id BIGINT PRIMARY KEY REFERENCES sentences(id) ON DELETE CASCADE,
    content TEXT,
    status TEXT,
    model TEXT,
    parsed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS paragraph_analyses (
    cache_key TEXT PRIMARY KEY,
    content TEXT,
    status TEXT,
    model TEXT,
    analyzed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS paper_answers (
    cache_key TEXT PRIMARY KEY,
    answers JSONB NOT NULL DEFAULT '{}',
    source TEXT,
    model TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS cards (
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    word_idx INTEGER NOT NULL,
    state TEXT,
    due BIGINT,
    ivl INTEGER,
    ease DOUBLE PRECISION,
    reps INTEGER,
    lapses INTEGER,
    step INTEGER,
    quiz INTEGER,
    updated_at TIMESTAMPTZ,
    PRIMARY KEY (user_id, word_idx)
);

ALTER TABLE cards ADD COLUMN IF NOT EXISTS learned BOOLEAN;
UPDATE cards SET learned = (state = 'review') WHERE learned IS NULL;
ALTER TABLE cards ALTER COLUMN learned SET DEFAULT FALSE;
ALTER TABLE cards ALTER COLUMN learned SET NOT NULL;

CREATE TABLE IF NOT EXISTS meta (
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day_key TEXT NOT NULL,
    new_today INTEGER DEFAULT 0,
    review_today INTEGER DEFAULT 0,
    learn_today INTEGER DEFAULT 0,
    done_today INTEGER DEFAULT 0,
    data_version TEXT,
    updated_at TIMESTAMPTZ,
    PRIMARY KEY (user_id, day_key)
);

CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT
);

CREATE TABLE IF NOT EXISTS user_settings (
    user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    payload JSONB NOT NULL DEFAULT '{}',
    updated_at TIMESTAMPTZ
);

-- 学习日志 / 复盘板（按用户隔离的个人数据）
CREATE TABLE IF NOT EXISTS user_journal (
    user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    payload JSONB NOT NULL DEFAULT '{}',
    updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS study_events (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    word_idx INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    quality TEXT,
    day_key TEXT NOT NULL,
    studied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_study_events_user_day ON study_events(user_id, day_key);

-- 邮箱（可选；邮箱验证码注册/登录）
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users (email) WHERE email IS NOT NULL;

-- 邮箱验证码（短时、单次消费）
CREATE TABLE IF NOT EXISTS email_codes (
    id BIGSERIAL PRIMARY KEY,
    email TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    purpose TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    consumed BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_email_codes_lookup
    ON email_codes (email, purpose, consumed, expires_at);

-- 知识图谱进度（408/数学考点状态、题目标记、预测卷缓存）
CREATE TABLE IF NOT EXISTS user_kg (
    user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    payload JSONB NOT NULL DEFAULT '{}',
    updated_at TIMESTAMPTZ
);

-- 账号级权威清空时间戳：重置后远端空不再被过期本地数据救活
CREATE TABLE IF NOT EXISTS progress_reset (
    user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    reset_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    day_key TEXT NOT NULL DEFAULT ''
);

-- 词库外点查：LLM 释义缓存（全局共用，按 surface 小写主键）
CREATE TABLE IF NOT EXISTS word_lookups (
    word TEXT PRIMARY KEY,
    lemma TEXT,
    senses JSONB NOT NULL DEFAULT '[]',
    phonetic TEXT,
    status TEXT,
    model TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);
