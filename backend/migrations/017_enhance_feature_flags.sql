-- Migration: Enhanced Feature Flag System
-- Description: Adds access levels, categories, audit logging, and improved targeting for feature flags
-- Date: 2025-01-14

-- Add new columns to feature_flags table
ALTER TABLE feature_flags 
ADD COLUMN IF NOT EXISTS access_level VARCHAR(20) DEFAULT 'disabled' 
  CHECK (access_level IN ('disabled', 'internal', 'beta', 'public')),
ADD COLUMN IF NOT EXISTS category VARCHAR(50),
ADD COLUMN IF NOT EXISTS dependencies JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS metrics JSONB DEFAULT '{}'::jsonb;

-- Create audit table for tracking feature flag changes
CREATE TABLE IF NOT EXISTS feature_flag_audit (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  flag_name VARCHAR(100) NOT NULL,
  changed_by UUID REFERENCES users(id),
  change_type VARCHAR(20) NOT NULL CHECK (change_type IN ('created', 'updated', 'deleted', 'toggled')),
  old_value JSONB,
  new_value JSONB,
  reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_feature_flag_audit_flag_name ON feature_flag_audit(flag_name);
CREATE INDEX IF NOT EXISTS idx_feature_flag_audit_changed_by ON feature_flag_audit(changed_by);
CREATE INDEX IF NOT EXISTS idx_feature_flag_audit_created_at ON feature_flag_audit(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feature_flags_access_level ON feature_flags(access_level);
CREATE INDEX IF NOT EXISTS idx_feature_flags_category ON feature_flags(category);

-- Add beta_user flag to users table if not exists
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS is_beta_user BOOLEAN DEFAULT FALSE;

-- Insert initial feature flags for existing features
INSERT INTO feature_flags (flag_name, description, access_level, category, is_enabled, rollout_percentage, target_criteria)
VALUES 
  ('gameplay_spoils_of_war', 'Card trading system for conquered territories', 'internal', 'gameplay', false, 0, '{}'),
  ('gameplay_territory_modifiers', 'Special abilities for specific territories', 'internal', 'gameplay', false, 0, '{}'),
  ('ui_holiday_themes', 'Seasonal UI themes (Christmas, Halloween, etc)', 'disabled', 'ui', false, 0, '{}'),
  ('experimental_ai_players', 'Computer-controlled players', 'disabled', 'experimental', false, 0, '{}'),
  ('vip_exclusive_maps', 'Maps only accessible to VIP users', 'public', 'vip', true, 100, '{"require_vip": true}'),
  ('premium_advanced_stats', 'Detailed game statistics and analytics', 'disabled', 'premium', false, 0, '{"require_premium": true}')
ON CONFLICT (flag_name) DO UPDATE SET
  description = EXCLUDED.description,
  category = EXCLUDED.category;

-- Create function to automatically log feature flag changes
CREATE OR REPLACE FUNCTION log_feature_flag_change()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO feature_flag_audit (flag_name, changed_by, change_type, new_value)
    VALUES (NEW.flag_name, NEW.created_by, 'created', row_to_json(NEW));
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.is_enabled != NEW.is_enabled THEN
      INSERT INTO feature_flag_audit (flag_name, changed_by, change_type, old_value, new_value)
      VALUES (NEW.flag_name, NEW.created_by, 'toggled', row_to_json(OLD), row_to_json(NEW));
    ELSE
      INSERT INTO feature_flag_audit (flag_name, changed_by, change_type, old_value, new_value)
      VALUES (NEW.flag_name, NEW.created_by, 'updated', row_to_json(OLD), row_to_json(NEW));
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO feature_flag_audit (flag_name, changed_by, change_type, old_value)
    VALUES (OLD.flag_name, OLD.created_by, 'deleted', row_to_json(OLD));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic audit logging
DROP TRIGGER IF EXISTS feature_flag_audit_trigger ON feature_flags;
CREATE TRIGGER feature_flag_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON feature_flags
FOR EACH ROW EXECUTE FUNCTION log_feature_flag_change();

-- Add comment for documentation
COMMENT ON TABLE feature_flags IS 'Feature flag definitions with access levels and rollout controls';
COMMENT ON TABLE feature_flag_audit IS 'Audit log for all feature flag changes';
COMMENT ON COLUMN feature_flags.access_level IS 'Access level: disabled, internal (admin/tester), beta, or public';
COMMENT ON COLUMN feature_flags.category IS 'Feature category: gameplay, ui, experimental, premium, vip';
COMMENT ON COLUMN feature_flags.dependencies IS 'Array of flag names this flag depends on';
COMMENT ON COLUMN feature_flags.metrics IS 'Usage metrics and performance data';