Clan Join Requests Consolidation

Overview
- Consolidates clan_applications and clan_invitations into a single table: clan_join_requests.
- Types: 'application' (user applies) and 'invite' (clan invites a user).
- Preserves statuses (pending, accepted, rejected, withdrawn, revoked, expired) and messages.

Schema
- Table: clan_join_requests
  - id UUID PK
  - clan_id UUID NOT NULL → clans(id) ON DELETE CASCADE
  - user_id UUID NOT NULL → users(id) ON DELETE CASCADE
  - type TEXT NOT NULL CHECK IN ('application','invite')
  - status TEXT NOT NULL CHECK IN ('pending','accepted','rejected','withdrawn','revoked','expired') DEFAULT 'pending'
  - message TEXT
  - created_by UUID NOT NULL → users(id)
  - token TEXT UNIQUE (invites)
  - expires_at TIMESTAMP
  - reviewed_by UUID → users(id)
  - reviewed_at TIMESTAMP
  - created_at, updated_at TIMESTAMP (default NOW)
  - Partial unique: (clan_id, user_id) WHERE status='pending'

Migration
- 085_create_clan_join_requests.sql creates the table and backfills existing clan_applications as type='application'.
- Code updated to read/write clan_join_requests in clanMembershipService.

Compatibility
- Existing clan_applications remains (for now). Future cleanup may drop it after rollout.

Next steps
- Add invite flows that write type='invite' with token/expiry.
- Add admin/officer UIs to list and manage join requests.

