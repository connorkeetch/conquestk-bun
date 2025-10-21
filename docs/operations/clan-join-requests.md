---
last_reviewed: 2025-10-21
---

# Clan Join Requests

This document outlines the technical implementation of the clan join request feature.

## Overview

The clan join request system allows players to apply to join a clan or accept invitations from a clan. This process is managed through the `clan_join_requests` table in the database.

## Database Schema

The `clan_join_requests` table is defined in the `001_baseline_schema.sql` migration file.

Key columns in this table include:
- `id`: Unique identifier for the join request.
- `clan_id`: The ID of the clan being joined.
- `user_id`: The ID of the user requesting to join or being invited.
- `type`: The type of request, either 'application' or 'invite'.
- `status`: The current status of the request (e.g., 'pending', 'accepted', 'rejected').
- `created_by`: The user who initiated the request.
- `reviewed_by`: The user who reviewed the request.

This setup allows for a robust and auditable system for managing clan memberships.
