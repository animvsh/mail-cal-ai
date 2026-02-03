# Setup Guide for Mail Cal AI

## Quick Setup (5 minutes)

### Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click "Create Project" → Name it "Mail Cal AI" → Create
3. Wait for project creation to complete

### Step 2: Enable APIs

In Google Cloud Console:
1. Go to "APIs & Services" → "Library"
2. Search and enable each:
   - **Gmail API** → Click Enable
   - **Google Calendar API** → Click Enable

### Step 3: Configure OAuth Consent Screen

1. Go to "APIs & Services" → "OAuth consent screen"
2. Choose "External" → Create
3. Fill in:
   - App name: `Mail Cal AI`
   - User support email: Your email
   - Developer contact: Your email
4. Click "Save and Continue"
5. Scopes: Click "Add or Remove Scopes" and add:
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/gmail.send`
   - `https://www.googleapis.com/auth/gmail.compose`
   - `https://www.googleapis.com/auth/calendar.readonly`
   - `https://www.googleapis.com/auth/calendar.events`
   - `https://www.googleapis.com/auth/userinfo.email`
   - `https://www.googleapis.com/auth/userinfo.profile`
6. Save and Continue through test users (add your email)
7. Back to Dashboard

### Step 4: Create OAuth Credentials

1. Go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "OAuth client ID"
3. Choose "Web application"
4. Name: `Mail Cal AI Web`
5. **Authorized JavaScript origins:**
   - `https://mail-cal-ai.pages.dev`
   - `http://localhost:5173` (for local dev)
6. **Authorized redirect URIs:**
   - `https://mail-cal-ai.pages.dev`
   - `http://localhost:5173` (for local dev)
7. Click Create
8. **Copy the Client ID and Client Secret** - you'll need these!

### Step 5: Add Secrets to Cloudflare

```bash
cd /Users/animesh/Downloads/projects/mail-cal-ai

# Set Google OAuth credentials
wrangler pages secret put GOOGLE_CLIENT_ID --project-name mail-cal-ai
# Paste your Client ID when prompted

wrangler pages secret put GOOGLE_CLIENT_SECRET --project-name mail-cal-ai
# Paste your Client Secret when prompted

# Optional: Add OpenAI for smarter AI processing
wrangler pages secret put OPENAI_API_KEY --project-name mail-cal-ai
```

### Step 6: Deploy and Test

```bash
npm run build
wrangler pages deploy dist --project-name mail-cal-ai
```

Visit https://mail-cal-ai.pages.dev and click "Connect Google" to test!

---

## Local Development

Create `.dev.vars` file:
```
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
OPENAI_API_KEY=your-openai-key  # optional
```

Run locally:
```bash
npm install
npm run dev                    # Frontend on :5173
npx wrangler pages dev dist    # With Functions on :8788
```

---

## Troubleshooting

### "OAuth not configured"
- Make sure secrets are set in Cloudflare Pages
- Run `wrangler pages secret list --project-name mail-cal-ai` to check

### "Redirect URI mismatch"
- Ensure `https://mail-cal-ai.pages.dev` is in both:
  - Authorized JavaScript origins
  - Authorized redirect URIs

### "Access blocked: This app's request is invalid"
- Check OAuth consent screen is properly configured
- Make sure all scopes are added
- Verify redirect URI matches exactly

### "Requires app verification"
- For testing, add your email as a test user in OAuth consent screen
- For production, submit for Google verification
