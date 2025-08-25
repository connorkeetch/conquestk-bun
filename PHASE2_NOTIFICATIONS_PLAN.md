# Phase 2: Comprehensive Notification System

## Overview
Multi-channel notification system supporting Email, SMS, Browser Push, and Slack notifications for game events.

## Architecture Components

### 1. Database Schema
```sql
-- User notification preferences
CREATE TABLE notification_preferences (
  user_id INT PRIMARY KEY,
  email_enabled BOOLEAN DEFAULT true,
  email_address VARCHAR(255),
  sms_enabled BOOLEAN DEFAULT false,
  phone_number VARCHAR(20),
  browser_enabled BOOLEAN DEFAULT true,
  slack_enabled BOOLEAN DEFAULT false,
  slack_webhook_url VARCHAR(500),
  
  -- Event preferences
  game_start BOOLEAN DEFAULT true,
  turn_reminder BOOLEAN DEFAULT true,
  game_end BOOLEAN DEFAULT true,
  game_invite BOOLEAN DEFAULT true,
  achievement_unlock BOOLEAN DEFAULT false,
  
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- Notification queue for reliability
CREATE TABLE notification_queue (
  id SERIAL PRIMARY KEY,
  user_id INT,
  type VARCHAR(50), -- email, sms, browser, slack
  event VARCHAR(50), -- game_start, turn_reminder, etc.
  payload JSONB,
  status VARCHAR(20) DEFAULT 'pending', -- pending, sent, failed
  retry_count INT DEFAULT 0,
  created_at TIMESTAMP,
  sent_at TIMESTAMP,
  error_message TEXT
);

-- Browser push subscription storage
CREATE TABLE push_subscriptions (
  id SERIAL PRIMARY KEY,
  user_id INT,
  endpoint TEXT,
  keys JSONB, -- p256dh and auth keys
  created_at TIMESTAMP
);
```

### 2. Backend Services

#### A. Core Notification Service (`backend/src/services/notificationService.ts`)
```typescript
interface NotificationEvent {
  type: 'game_start' | 'turn_reminder' | 'game_end' | 'game_invite';
  userId: number;
  gameId?: number;
  metadata: Record<string, any>;
}

class NotificationService {
  async notify(event: NotificationEvent) {
    // Get user preferences
    // Queue notifications for each enabled channel
    // Process queue with retry logic
  }
}
```

#### B. Channel Providers

**Email Provider (`backend/src/providers/emailProvider.ts`)**
- Primary: SendGrid API (production)
- Fallback: Nodemailer with Gmail SMTP (development)
- Templates: HTML email templates with game links
- Features: Batch sending, unsubscribe links

**SMS Provider (`backend/src/providers/smsProvider.ts`)**  
- Twilio API integration
- Short URLs using bit.ly API
- Template: "[Risk Game] It's your turn! Play now: {shortUrl}"
- Rate limiting to prevent spam

**Browser Push (`backend/src/providers/pushProvider.ts`)**
- Web Push Protocol implementation
- VAPID keys for authentication
- Service Worker for receiving notifications
- Click action to open game

**Slack Provider (`backend/src/providers/slackProvider.ts`)**
- Webhook-based integration
- Rich message formatting with game preview
- Interactive buttons for quick actions

### 3. Frontend Implementation

#### A. Service Worker (`frontend/public/sw.js`)
```javascript
self.addEventListener('push', event => {
  const data = event.data.json();
  self.registration.showNotification(data.title, {
    body: data.body,
    icon: '/icon-192.png',
    badge: '/badge-72.png',
    data: { gameId: data.gameId }
  });
});

self.addEventListener('notificationclick', event => {
  clients.openWindow(`/game/${event.notification.data.gameId}`);
});
```

#### B. Notification Settings UI Updates
```typescript
// New settings for notifications tab
interface NotificationSettings {
  channels: {
    email: { enabled: boolean; address: string; verified: boolean; };
    sms: { enabled: boolean; number: string; verified: boolean; };
    browser: { enabled: boolean; subscribed: boolean; };
    slack: { enabled: boolean; webhookUrl: string; };
  };
  events: {
    gameStart: boolean;
    turnReminder: boolean;
    gameEnd: boolean;
    gameInvite: boolean;
  };
}
```

### 4. Environment Variables
```env
# Email
SENDGRID_API_KEY=
SENDGRID_FROM_EMAIL=noreply@conquestk.com
SENDGRID_TEMPLATE_ID=

# SMS
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=+1234567890

# URL Shortener
BITLY_ACCESS_TOKEN=

# Web Push
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_EMAIL=mailto:admin@conquestk.com

# Slack (per-user webhooks stored in DB)
```

### 5. Implementation Steps

#### Step 1: Database Setup (30 min)
- [ ] Create migration files for new tables
- [ ] Run migrations
- [ ] Add TypeORM entities

#### Step 2: Backend Core (2 hours)
- [ ] Create NotificationService class
- [ ] Implement queue system with retry logic
- [ ] Add notification event emitters to game logic
- [ ] Create REST endpoints for preferences

#### Step 3: Email Notifications (1 hour)
- [ ] SendGrid account setup
- [ ] Create email templates
- [ ] Implement EmailProvider
- [ ] Add unsubscribe handling

#### Step 4: SMS Notifications (1 hour)
- [ ] Twilio account setup
- [ ] Implement SmsProvider
- [ ] Add phone number verification
- [ ] Implement URL shortening

#### Step 5: Browser Push (2 hours)
- [ ] Generate VAPID keys
- [ ] Create service worker
- [ ] Implement subscription flow
- [ ] Add PushProvider

#### Step 6: Slack Integration (30 min)
- [ ] Create webhook UI
- [ ] Implement SlackProvider
- [ ] Add rich message formatting

#### Step 7: Frontend UI (1 hour)
- [ ] Update Settings page notifications tab
- [ ] Add verification flows for email/SMS
- [ ] Implement permission requests for browser
- [ ] Add test notification buttons

#### Step 8: Testing & Monitoring (1 hour)
- [ ] Queue monitoring dashboard
- [ ] Retry logic testing
- [ ] Rate limit testing
- [ ] Error handling

### 6. Cost Considerations

**Free Tiers:**
- SendGrid: 100 emails/day free
- Twilio: $15 trial credit
- Browser Push: Free (uses web standards)
- Slack: Free (webhooks)

**Production Costs (estimated per month):**
- SendGrid: $15/month (40k emails)
- Twilio: $0.0075/SMS (~$20 for 2,600 SMS)
- Bit.ly: Free tier (1,000 links/month)

### 7. Security Considerations

- **Phone/Email Verification**: Required before enabling
- **Rate Limiting**: Max 10 notifications per user per hour
- **Webhook Validation**: Verify Slack webhook ownership
- **GDPR Compliance**: Clear opt-in/opt-out, data deletion
- **Unsubscribe Links**: One-click unsubscribe in emails
- **Encryption**: Store phone numbers and emails encrypted

### 8. Testing Strategy

**Unit Tests:**
- Provider implementations
- Queue retry logic
- Template rendering

**Integration Tests:**
- End-to-end notification flow
- Channel fallback logic
- Preference updates

**Manual Testing:**
- Cross-browser push notifications
- Mobile SMS delivery
- Email client rendering
- Slack message formatting

### 9. Monitoring & Analytics

- Track delivery rates per channel
- Monitor queue processing times
- Alert on high failure rates
- User engagement metrics (open rates, click-through)

### 10. Future Enhancements

- Discord integration
- Telegram bot
- In-app notification center
- Notification scheduling (quiet hours)
- Digest notifications (daily/weekly summary)
- Custom notification sounds
- Rich push notifications with images

## Quick Start Implementation

For immediate implementation, prioritize:
1. **Browser Push** - No external dependencies, free
2. **Email with Nodemailer** - Quick setup with Gmail
3. **Basic queue system** - In-memory for development

This provides core functionality while more complex integrations can be added incrementally.