-- 数学解析是服务端共享内容；前端展开状态不作为学习进度保存。
CREATE TABLE IF NOT EXISTS math_explanations (
    cache_key TEXT PRIMARY KEY,
    item_id TEXT NOT NULL,
    source_hash TEXT NOT NULL,
    prompt_version TEXT NOT NULL,
    model TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('queued','processing','ready','needs_input','needs_review','error')),
    phase TEXT NOT NULL DEFAULT 'queued',
    solution JSONB,
    explanation JSONB,
    returned_models JSONB NOT NULL DEFAULT '[]',
    review_status TEXT NOT NULL DEFAULT 'model_draft',
    message TEXT NOT NULL DEFAULT '',
    attempts INTEGER NOT NULL DEFAULT 0,
    attempt_id TEXT,
    lease_until TIMESTAMPTZ,
    requested_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS math_explanations_queue ON math_explanations(status,created_at);
