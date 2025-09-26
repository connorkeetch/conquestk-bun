-- Migration 044: Remove deprecated clans feature flag
-- Date: 2025-09-26
-- Description: Purges the 'clans_enabled' feature flag and related user overrides and audit rows.

BEGIN;

-- Remove user-specific overrides for the flag
DELETE FROM user_feature_flags WHERE flag_name = 'clans_enabled';

-- Remove audit entries for the flag
DELETE FROM feature_flag_audit WHERE flag_name = 'clans_enabled';

-- Remove the flag itself
DELETE FROM feature_flags WHERE flag_name = 'clans_enabled';

COMMIT;

