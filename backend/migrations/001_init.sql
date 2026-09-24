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

-- 学习日志旧整包。启动时回填到按条表；新写入不再更新此表。
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

-- 客户端时间戳：重试幂等（同一词同一天同一 client_at 不重复插入）
ALTER TABLE study_events ADD COLUMN IF NOT EXISTS client_at BIGINT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_study_events_idem
    ON study_events (user_id, day_key, word_idx, client_at)
    WHERE client_at IS NOT NULL AND client_at > 0;

CREATE INDEX IF NOT EXISTS idx_cards_user_updated ON cards (user_id, updated_at);

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

-- 考研政治主观题练习（草稿 / 自测记录）
CREATE TABLE IF NOT EXISTS user_politics (
    user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    payload JSONB NOT NULL DEFAULT '{}',
    updated_at TIMESTAMPTZ
);

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

-- 生词表 / 熟词表（一词一档；kind=none 为跨设备删除墓碑）
CREATE TABLE IF NOT EXISTS word_lists (
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    word_idx INTEGER NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('new', 'known', 'none')),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, word_idx)
);
CREATE INDEX IF NOT EXISTS idx_word_lists_user_kind ON word_lists (user_id, kind);
CREATE INDEX IF NOT EXISTS idx_word_lists_user_updated ON word_lists (user_id, updated_at);

-- 王道/题库大题 LLM 解析：全局共用，按题目 id 主键；题干变了才重生成
CREATE TABLE IF NOT EXISTS question_explanations (
    item_id TEXT PRIMARY KEY,
    stem TEXT NOT NULL,
    answer TEXT,
    solution TEXT,
    status TEXT,
    model TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

-- 学习日志按条同步：最后写入获胜，deleted_at 为墓碑。只属于当前账号。
CREATE TABLE IF NOT EXISTS journal_entries (
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    id TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    PRIMARY KEY (user_id, id)
);

CREATE TABLE IF NOT EXISTS journal_logs (
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    id TEXT NOT NULL,
    entry_id TEXT NOT NULL DEFAULT '',
    payload JSONB NOT NULL DEFAULT '{}',
    updated_at TIMESTAMPTZ NOT NULL,
    deleted_at TIMESTAMPTZ,
    PRIMARY KEY (user_id, id)
);

CREATE TABLE IF NOT EXISTS journal_categories (
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    id TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}',
    updated_at TIMESTAMPTZ NOT NULL,
    deleted_at TIMESTAMPTZ,
    PRIMARY KEY (user_id, id)
);

CREATE TABLE IF NOT EXISTS journal_weeklies (
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    week_key TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (user_id, week_key)
);

-- 权威清空。重置时间之前的按条写入不能把数据救活。
CREATE TABLE IF NOT EXISTS journal_reset (
    user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    reset_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_journal_entries_user_updated ON journal_entries (user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_journal_logs_user_updated ON journal_logs (user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_journal_categories_user_updated ON journal_categories (user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_journal_weeklies_user_updated ON journal_weeklies (user_id, updated_at);

-- 从旧 user_journal 整包回填。ON CONFLICT DO NOTHING，不盖住已经按条写过的行。
-- 重置过的账号跳过，避免重启把清空的数据灌回来。id 为空的元素不插入。
INSERT INTO journal_entries (user_id, id, payload, updated_at, deleted_at)
SELECT user_id, id, payload, updated_at, NULL::TIMESTAMPTZ
FROM (
    SELECT DISTINCT ON (uj.user_id, elem->>'id')
        uj.user_id AS user_id,
        elem->>'id' AS id,
        elem AS payload,
        to_timestamp(
            COALESCE(
                CASE
                    WHEN jsonb_typeof(elem->'updatedAt') = 'number'
                        THEN (elem->>'updatedAt')::DOUBLE PRECISION
                    ELSE NULL
                END,
                CASE
                    WHEN jsonb_typeof(uj.payload->'updatedAt') = 'number'
                        THEN (uj.payload->>'updatedAt')::DOUBLE PRECISION
                    ELSE NULL
                END,
                EXTRACT(EPOCH FROM uj.updated_at) * 1000.0,
                EXTRACT(EPOCH FROM NOW()) * 1000.0
            ) / 1000.0
        ) AS updated_at
    FROM user_journal uj
    CROSS JOIN LATERAL jsonb_array_elements(
        CASE
            WHEN jsonb_typeof(uj.payload->'entries') = 'array' THEN uj.payload->'entries'
            ELSE '[]'::jsonb
        END
    ) AS elem
    WHERE COALESCE(elem->>'id', '') <> ''
      AND NOT EXISTS (SELECT 1 FROM journal_reset jr WHERE jr.user_id = uj.user_id)
    ORDER BY uj.user_id, elem->>'id',
        COALESCE(
            CASE
                WHEN jsonb_typeof(elem->'updatedAt') = 'number'
                    THEN (elem->>'updatedAt')::DOUBLE PRECISION
                ELSE NULL
            END,
            0
        ) DESC
) AS backfill
ON CONFLICT (user_id, id) DO NOTHING;

INSERT INTO journal_logs (user_id, id, entry_id, payload, updated_at, deleted_at)
SELECT user_id, id, entry_id, payload, updated_at, NULL::TIMESTAMPTZ
FROM (
    SELECT DISTINCT ON (uj.user_id, elem->>'id')
        uj.user_id AS user_id,
        elem->>'id' AS id,
        COALESCE(NULLIF(elem->>'entryId', ''), NULLIF(elem->>'entry_id', ''), '') AS entry_id,
        elem AS payload,
        to_timestamp(
            COALESCE(
                CASE
                    WHEN jsonb_typeof(uj.payload->'updatedAt') = 'number'
                        THEN (uj.payload->>'updatedAt')::DOUBLE PRECISION
                    ELSE NULL
                END,
                EXTRACT(EPOCH FROM uj.updated_at) * 1000.0,
                EXTRACT(EPOCH FROM NOW()) * 1000.0
            ) / 1000.0
        ) AS updated_at
    FROM user_journal uj
    CROSS JOIN LATERAL jsonb_array_elements(
        CASE
            WHEN jsonb_typeof(uj.payload->'logs') = 'array' THEN uj.payload->'logs'
            ELSE '[]'::jsonb
        END
    ) AS elem
    WHERE COALESCE(elem->>'id', '') <> ''
      AND NOT EXISTS (SELECT 1 FROM journal_reset jr WHERE jr.user_id = uj.user_id)
    ORDER BY uj.user_id, elem->>'id'
) AS backfill
ON CONFLICT (user_id, id) DO NOTHING;

INSERT INTO journal_categories (user_id, id, payload, updated_at, deleted_at)
SELECT user_id, id, payload, updated_at, NULL::TIMESTAMPTZ
FROM (
    SELECT DISTINCT ON (uj.user_id, elem->>'id')
        uj.user_id AS user_id,
        elem->>'id' AS id,
        elem AS payload,
        to_timestamp(
            COALESCE(
                CASE
                    WHEN jsonb_typeof(uj.payload->'updatedAt') = 'number'
                        THEN (uj.payload->>'updatedAt')::DOUBLE PRECISION
                    ELSE NULL
                END,
                EXTRACT(EPOCH FROM uj.updated_at) * 1000.0,
                EXTRACT(EPOCH FROM NOW()) * 1000.0
            ) / 1000.0
        ) AS updated_at
    FROM user_journal uj
    CROSS JOIN LATERAL jsonb_array_elements(
        CASE
            WHEN jsonb_typeof(uj.payload->'categories') = 'array' THEN uj.payload->'categories'
            ELSE '[]'::jsonb
        END
    ) AS elem
    WHERE COALESCE(elem->>'id', '') <> ''
      AND NOT EXISTS (SELECT 1 FROM journal_reset jr WHERE jr.user_id = uj.user_id)
    ORDER BY uj.user_id, elem->>'id'
) AS backfill
ON CONFLICT (user_id, id) DO NOTHING;

INSERT INTO journal_weeklies (user_id, week_key, note, updated_at)
SELECT user_id, week_key, note, updated_at
FROM (
    SELECT DISTINCT ON (uj.user_id, elem->>'weekKey')
        uj.user_id AS user_id,
        elem->>'weekKey' AS week_key,
        COALESCE(elem->>'note', '') AS note,
        to_timestamp(
            COALESCE(
                CASE
                    WHEN jsonb_typeof(elem->'updatedAt') = 'number'
                        THEN (elem->>'updatedAt')::DOUBLE PRECISION
                    ELSE NULL
                END,
                CASE
                    WHEN jsonb_typeof(uj.payload->'updatedAt') = 'number'
                        THEN (uj.payload->>'updatedAt')::DOUBLE PRECISION
                    ELSE NULL
                END,
                EXTRACT(EPOCH FROM uj.updated_at) * 1000.0,
                EXTRACT(EPOCH FROM NOW()) * 1000.0
            ) / 1000.0
        ) AS updated_at
    FROM user_journal uj
    CROSS JOIN LATERAL jsonb_array_elements(
        CASE
            WHEN jsonb_typeof(uj.payload->'weeklies') = 'array' THEN uj.payload->'weeklies'
            ELSE '[]'::jsonb
        END
    ) AS elem
    WHERE COALESCE(elem->>'weekKey', '') <> ''
      AND NOT EXISTS (SELECT 1 FROM journal_reset jr WHERE jr.user_id = uj.user_id)
    ORDER BY uj.user_id, elem->>'weekKey',
        COALESCE(
            CASE
                WHEN jsonb_typeof(elem->'updatedAt') = 'number'
                    THEN (elem->>'updatedAt')::DOUBLE PRECISION
                ELSE NULL
            END,
            0
        ) DESC
) AS backfill
ON CONFLICT (user_id, week_key) DO NOTHING;

-- 删除墓碑。已有行（含上面刚回填的活条目，或已经按条更新过的行）不覆盖。
INSERT INTO journal_entries (user_id, id, payload, updated_at, deleted_at)
SELECT user_id, id, '{}'::jsonb, ts, ts
FROM (
    SELECT DISTINCT ON (uj.user_id, elem->>'id')
        uj.user_id AS user_id,
        elem->>'id' AS id,
        to_timestamp((elem->>'at')::DOUBLE PRECISION / 1000.0) AS ts
    FROM user_journal uj
    CROSS JOIN LATERAL jsonb_array_elements(
        CASE
            WHEN jsonb_typeof(uj.payload->'deleted') = 'array' THEN uj.payload->'deleted'
            ELSE '[]'::jsonb
        END
    ) AS elem
    WHERE COALESCE(elem->>'id', '') <> ''
      AND jsonb_typeof(elem->'at') = 'number'
      AND NOT EXISTS (SELECT 1 FROM journal_reset jr WHERE jr.user_id = uj.user_id)
    ORDER BY uj.user_id, elem->>'id', (elem->>'at')::DOUBLE PRECISION DESC
) AS backfill
ON CONFLICT (user_id, id) DO NOTHING;
