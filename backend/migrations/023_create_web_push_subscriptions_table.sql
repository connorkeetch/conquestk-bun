-- Create table to persist web push subscriptions across deploys
CREATE TABLE IF NOT EXISTS web_push_subscriptions (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL,
    subscription JSONB NOT NULL,
    expiration_time TIMESTAMPTZ,
    p256dh_key TEXT,
    auth_key TEXT,
    failure_count INTEGER NOT NULL DEFAULT 0,
    last_failure_at TIMESTAMPTZ,
    last_failure_reason TEXT,
    last_success_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure each device endpoint is only stored once per user
CREATE UNIQUE INDEX IF NOT EXISTS web_push_subscriptions_user_endpoint_idx
    ON web_push_subscriptions (user_id, endpoint);

-- Accelerate lookups for user fan-out
CREATE INDEX IF NOT EXISTS web_push_subscriptions_user_idx
    ON web_push_subscriptions (user_id);

-- Maintain updated_at timestamps automatically
CREATE OR REPLACE FUNCTION update_web_push_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS web_push_subscriptions_updated_at ON web_push_subscriptions;
CREATE TRIGGER web_push_subscriptions_updated_at
    BEFORE UPDATE ON web_push_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_web_push_subscriptions_updated_at();
