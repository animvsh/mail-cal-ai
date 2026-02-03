# Mail Cal AI 📬

A unified Email + Calendar AI Assistant that lets you manage your Gmail and Google Calendar through natural language chat.

## Features

### 📧 Email
- View latest emails
- Search inbox
- Send emails
- Reply to threads

### 📅 Calendar
- View upcoming events
- Create new meetings
- Modify/delete events
- Check availability

### 🔗 Cross-functionality
- Schedule meetings with email contacts
- "What meetings do I have with [person]?"
- "Schedule a call with everyone from that email"

## Setup

### 1. Create Google OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable Gmail API and Google Calendar API
4. Go to "Credentials" → "Create Credentials" → "OAuth client ID"
5. Choose "Web application"
6. Add authorized redirect URIs:
   - For local: `http://localhost:5173`
   - For production: `https://mail-cal-ai.pages.dev` (or your domain)
7. Copy the Client ID and Client Secret

### 2. Configure Environment

Create `.dev.vars` for local development:

```
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
OPENAI_API_KEY=your-openai-key  # Optional - enables AI processing
```

### 3. Install & Run

```bash
# Install dependencies
npm install

# Start the frontend
npm run dev

# In another terminal, start the worker
npm run dev:worker
```

Open http://localhost:5173

## Deploy to Cloudflare

### 1. Set Secrets

```bash
# Set production secrets
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put OPENAI_API_KEY
```

### 2. Deploy

```bash
# Deploy everything
npm run deploy
npm run deploy:worker
```

## Tech Stack

- **Frontend**: React + Vite + TailwindCSS
- **Backend**: Cloudflare Workers + Hono
- **APIs**: Gmail API, Google Calendar API
- **AI**: OpenAI GPT-4o-mini (optional)

## Example Commands

```
"Show my latest emails"
"Search emails from John"
"What's on my calendar today?"
"Show my schedule for this week"
"Send an email to bob@example.com about the project update"
"Schedule a meeting tomorrow at 2pm with the team"
```

## Architecture

```
┌─────────────────┐     ┌──────────────────┐
│  React Frontend │────▶│ Cloudflare Worker│
│   (Vite/Pages)  │     │    (Hono API)    │
└─────────────────┘     └────────┬─────────┘
                                 │
                    ┌────────────┼────────────┐
                    ▼            ▼            ▼
              ┌─────────┐  ┌──────────┐  ┌────────┐
              │ Gmail   │  │ Calendar │  │ OpenAI │
              │   API   │  │   API    │  │  API   │
              └─────────┘  └──────────┘  └────────┘
```

## License

MIT
