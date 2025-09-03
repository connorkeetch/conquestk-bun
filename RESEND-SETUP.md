# Resend Email Setup Guide

## Quick Setup

### 1. Get Your Resend API Key
1. Go to https://resend.com
2. Sign up or login
3. Go to **API Keys** in the sidebar
4. Click **"Create API Key"**
5. Name it "ConquestK" or similar
6. Copy the key (starts with `re_`)

### 2. Add to Local .env File
Add these lines to `backend/.env`:
```bash
# Resend Configuration
RESEND_API_KEY=re_YOUR_API_KEY_HERE
EMAIL_FROM=noreply@send.conquestk.com
EMAIL_FROM_NAME=ConquestK
EMAIL_ENABLED=true
REQUIRE_EMAIL_VERIFICATION=true
```

### 3. Verify Domain (Optional but Recommended)
1. In Resend dashboard, go to **Domains**
2. Add domain: `send.conquestk.com`
3. Add the DNS records they provide to your domain
4. Once verified, emails won't go to spam

### 4. Test Locally
```bash
cd backend
npm run test:email
```

### 5. Add to Railway Production
In Railway dashboard:
1. Go to your service
2. Click **Variables**
3. Add:
   - `RESEND_API_KEY` = your API key
   - `EMAIL_FROM` = noreply@send.conquestk.com
   - `EMAIL_FROM_NAME` = ConquestK
   - `EMAIL_ENABLED` = true
   - `REQUIRE_EMAIL_VERIFICATION` = true

## Troubleshooting

### "Email service disabled"
- Check RESEND_API_KEY is set
- Check EMAIL_ENABLED is true or not set (defaults to true)

### Emails going to spam
- Verify your domain in Resend
- Use send.conquestk.com subdomain

### Not receiving emails
- Check Resend dashboard for failed sends
- Check logs for error messages
- Verify email address is correct