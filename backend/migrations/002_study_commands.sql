-- 学习完成命令的幂等凭据；重置进度后仍保留，防止已确认操作再次回放。
CREATE TABLE IF NOT EXISTS study_commands (
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    operation_id VARCHAR(128) NOT NULL,
    client_at BIGINT NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, operation_id)
);
