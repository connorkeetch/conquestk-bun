# Notifications

This document describes in‑app notifications in the ConquestK frontend.

What shows up
- Turn reminders: When a turn switches to you, a single notification is added (no per‑phase spam).
- System and server events: The backend may push items via `notification:new` (e.g., chat messages, map review updates).

Read/unread behavior
- New items are visually emphasized. Read items are more subdued.
- Items are marked read when you click them, or when you use “Mark all”.
- Opening the dropdown does not auto‑mark items as read.

Deleting
- Click the × on any notification to delete it.
- Use “Clear” to remove all notifications.

Ordering and retention
- Items are ordered newest‑first by timestamp.
- Notifications persist locally for the session until you delete or clear them. There is no auto‑expiry.

Where the code lives
- UI: `frontend/src/components/notifications/NotificationDropdown.tsx`
- Client store/service: `frontend/src/services/notificationService.ts`
- Socket integration: `frontend/src/services/socketService.ts`

Notes
- The header’s bell shows the current unread count; it does not change simply by opening the dropdown.
- Browser push notifications are separate and configured in Settings.
