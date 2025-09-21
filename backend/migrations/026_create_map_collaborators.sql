-- 026_create_map_collaborators.sql
-- Adds collaboration table to model delegated map editing access

CREATE TABLE IF NOT EXISTS map_collaborators (
  map_id UUID NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(32) NOT NULL DEFAULT 'editor',
  assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (map_id, user_id),
  CONSTRAINT map_collaborators_role_check CHECK (role IN ('editor', 'viewer', 'owner', 'reviewer'))
);

CREATE INDEX IF NOT EXISTS idx_map_collaborators_user ON map_collaborators(user_id);
CREATE INDEX IF NOT EXISTS idx_map_collaborators_map_role ON map_collaborators(map_id, role);

COMMENT ON TABLE map_collaborators IS 'Users granted collaborative access to author maps created by others.';
COMMENT ON COLUMN map_collaborators.role IS 'editor=full edit rights, viewer=read-only, owner=delegated owner, reviewer=approval workflow support.';
COMMENT ON COLUMN map_collaborators.assigned_by IS 'Admin or map owner that granted the collaboration access.';
