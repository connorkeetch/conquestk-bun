# Legal Stack Implementation Plan

## Overview
Implementing minimal viable legal protection for Conquest K before accepting any user data or payments.

## Phase 1: Minimal Launch Requirements (TODAY)
✅ What we MUST have:
- Terms of Service (basic)
- Privacy Policy (basic)  
- Footer with copyright notice
- Cookie notice (can be part of Privacy Policy)

## What We're NOT Promising
❌ Avoiding these commitments:
- 24/7 support or guaranteed response times
- 99.9% uptime guarantees
- Specific feature release dates
- Professional tournaments with prizes
- Mobile apps "coming soon"
- API access
- Data portability beyond basic export

## Implementation Order

### 1. Footer Component (Quick Win)
Simple footer with:
- © 2025 Conquest K. All rights reserved.
- Links: Terms | Privacy | Contact
- No social media icons yet (don't have accounts)
- No "Coming Soon" features

### 2. Terms of Service (Minimal)
Essential sections only:
- Age requirement (13+)
- Account responsibilities
- No cheating/harassment
- We can ban anyone
- No refunds policy
- Service provided "as is"
- Contact: support@conquestk.com

### 3. Privacy Policy (Basic)
GDPR/CCPA minimum:
- What we collect (email, username, game data)
- We don't sell data
- We use cookies for login
- Contact for data requests
- We use Railway for hosting

### 4. Database Tracking
Simple implementation:
- Add terms_accepted_at to users table
- Block game access until accepted
- Log acceptance for compliance

## What We're Deferring
🔄 Can add later:
- DMCA procedure (no user uploads yet)
- Detailed cookie policy
- Data Processing Agreements  
- Referral program terms
- Premium/payment terms (no payments yet)
- Forum rules (no forums yet)
- User-generated content policy (no UGC yet)

## Legal Disclaimers to Include
⚠️ Critical protections:
- "Risk® is a trademark of Hasbro, Inc. This game is not affiliated with or endorsed by Hasbro."
- "Beta version - features may change"
- "No warranty of availability"
- "Game data may be reset during beta"
- "Maximum liability = $0 (free service)"

## Contact Information
Using generic emails initially:
- support@conquestk.com (forwards to your email)
- legal@conquestk.com (forwards to your email)  
- privacy@conquestk.com (forwards to your email)

## Timeline
Day 1 (Today):
- [ ] Create footer component
- [ ] Write minimal Terms
- [ ] Write minimal Privacy Policy
- [ ] Add to routes
- [ ] Deploy

Day 2-7:
- [ ] Add acceptance flow for new users
- [ ] Track acceptances in database

Later (Month 2+):
- [ ] Expand policies as features grow
- [ ] Add DMCA if user content added
- [ ] Add payment terms when monetizing