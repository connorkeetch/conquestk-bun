-- Add legal acceptance tracking to users table
-- This ensures we have proof of acceptance for compliance

-- Add columns to track legal acceptance
ALTER TABLE users ADD COLUMN terms_accepted_at DATETIME;
ALTER TABLE users ADD COLUMN privacy_accepted_at DATETIME;
ALTER TABLE users ADD COLUMN terms_version VARCHAR(20) DEFAULT '1.0';
ALTER TABLE users ADD COLUMN privacy_version VARCHAR(20) DEFAULT '1.0';

-- Create legal acceptance log for audit trail
CREATE TABLE IF NOT EXISTS legal_acceptances (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id TEXT NOT NULL,
    document_type VARCHAR(50) NOT NULL, -- 'terms' or 'privacy'
    document_version VARCHAR(20) NOT NULL,
    accepted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    ip_address VARCHAR(45),
    user_agent TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_legal_acceptances_user_id ON legal_acceptances(user_id);
CREATE INDEX IF NOT EXISTS idx_legal_acceptances_document_type ON legal_acceptances(document_type);

-- Mark existing users as having accepted (grandfather them in)
-- They've been using the service, so implicit acceptance
UPDATE users 
SET terms_accepted_at = CURRENT_TIMESTAMP,
    privacy_accepted_at = CURRENT_TIMESTAMP
WHERE terms_accepted_at IS NULL;