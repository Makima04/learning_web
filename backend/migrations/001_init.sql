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
