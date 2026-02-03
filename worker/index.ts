import { Hono } from 'hono'
import { cors } from 'hono/cors'

interface Env {
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  OPENAI_API_KEY: string
  // In production, use KV for token storage
  // TOKENS: KVNamespace
}

interface TokenData {
  access_token: string
  refresh_token: string
  expires_at: number
  user: {
    email: string
    name: string
    picture: string
  }
}

// In-memory token storage (for demo - in production use KV)
const tokenStore = new Map<string, TokenData>()

const app = new Hono<{ Bindings: Env }>()

app.use('/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowHeaders: ['Content-Type'],
}))

// OAuth URLs
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo'

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
].join(' ')

// For demo purposes - session cookie simulation
const SESSION_ID = 'demo-session'

// Get redirect URI based on request
function getRedirectUri(c: any): string {
  const host = c.req.header('host') || 'localhost:8787'
  const protocol = host.includes('localhost') ? 'http' : 'https'
  
  // For Cloudflare Pages deployment
  if (host.includes('.pages.dev') || host.includes('mail-cal-ai')) {
    return `https://${host}/api/auth/callback`
  }
  return `${protocol}://${host.replace(':8787', ':5173')}`
}

// Auth routes
app.get('/api/auth/url', async (c) => {
  const clientId = c.env.GOOGLE_CLIENT_ID
  if (!clientId) {
    return c.json({ error: 'Google OAuth not configured' }, 500)
  }
  
  const redirectUri = getRedirectUri(c)
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
  })
  
  return c.json({ url: `${GOOGLE_AUTH_URL}?${params}` })
})

app.post('/api/auth/callback', async (c) => {
  const { code } = await c.req.json()
  const clientId = c.env.GOOGLE_CLIENT_ID
  const clientSecret = c.env.GOOGLE_CLIENT_SECRET
  
  if (!clientId || !clientSecret) {
    return c.json({ error: 'OAuth not configured' }, 500)
  }
  
  const redirectUri = getRedirectUri(c)
  
  try {
    // Exchange code for tokens
    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    })
    
    const tokens = await tokenRes.json() as any
    
    if (tokens.error) {
      return c.json({ error: tokens.error_description || tokens.error }, 400)
    }
    
    // Get user info
    const userRes = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
    const user = await userRes.json() as any
    
    // Store tokens
    const tokenData: TokenData = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: Date.now() + (tokens.expires_in * 1000),
      user: {
        email: user.email,
        name: user.name,
        picture: user.picture,
      },
    }
    tokenStore.set(SESSION_ID, tokenData)
    
    return c.json({ success: true, user: tokenData.user })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

app.get('/api/auth/status', async (c) => {
  const tokens = tokenStore.get(SESSION_ID)
  if (tokens) {
    return c.json({ isAuthenticated: true, user: tokens.user })
  }
  return c.json({ isAuthenticated: false })
})

app.post('/api/auth/logout', async (c) => {
  tokenStore.delete(SESSION_ID)
  return c.json({ success: true })
})

// Helper to get valid access token
async function getAccessToken(c: any): Promise<string | null> {
  const tokens = tokenStore.get(SESSION_ID)
  if (!tokens) return null
  
  // Check if token needs refresh
  if (Date.now() >= tokens.expires_at - 60000) {
    try {
      const res = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          refresh_token: tokens.refresh_token,
          client_id: c.env.GOOGLE_CLIENT_ID,
          client_secret: c.env.GOOGLE_CLIENT_SECRET,
          grant_type: 'refresh_token',
        }),
      })
      const newTokens = await res.json() as any
      tokens.access_token = newTokens.access_token
      tokens.expires_at = Date.now() + (newTokens.expires_in * 1000)
      tokenStore.set(SESSION_ID, tokens)
    } catch (e) {
      return null
    }
  }
  
  return tokens.access_token
}

// Gmail API helpers
async function listEmails(accessToken: string, query?: string, maxResults = 10) {
  const params = new URLSearchParams({
    maxResults: maxResults.toString(),
    ...(query && { q: query }),
  })
  
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  const data = await res.json() as any
  
  if (!data.messages) return []
  
  // Get details for each message
  const emails = await Promise.all(
    data.messages.slice(0, maxResults).map(async (msg: any) => {
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )
      const msgData = await msgRes.json() as any
      
      const getHeader = (name: string) => 
        msgData.payload?.headers?.find((h: any) => h.name === name)?.value || ''
      
      return {
        id: msg.id,
        from: getHeader('From'),
        subject: getHeader('Subject'),
        snippet: msgData.snippet,
        date: new Date(parseInt(msgData.internalDate)).toLocaleDateString(),
        unread: msgData.labelIds?.includes('UNREAD'),
      }
    })
  )
  
  return emails
}

async function sendEmail(accessToken: string, to: string, subject: string, body: string) {
  const email = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    body,
  ].join('\r\n')
  
  const encodedEmail = btoa(email).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw: encodedEmail }),
  })
  
  return await res.json()
}

// Calendar API helpers
async function listEvents(accessToken: string, timeMin?: string, timeMax?: string, maxResults = 10) {
  const now = new Date()
  const params = new URLSearchParams({
    timeMin: timeMin || now.toISOString(),
    timeMax: timeMax || new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    maxResults: maxResults.toString(),
    singleEvents: 'true',
    orderBy: 'startTime',
  })
  
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  const data = await res.json() as any
  
  return (data.items || []).map((event: any) => ({
    id: event.id,
    summary: event.summary || '(No title)',
    start: event.start?.dateTime || event.start?.date,
    end: event.end?.dateTime || event.end?.date,
    location: event.location,
    attendees: event.attendees?.map((a: any) => a.email) || [],
  }))
}

async function createEvent(
  accessToken: string,
  summary: string,
  start: string,
  end: string,
  attendees?: string[],
  description?: string
) {
  const event: any = {
    summary,
    start: { dateTime: start, timeZone: 'America/Los_Angeles' },
    end: { dateTime: end, timeZone: 'America/Los_Angeles' },
  }
  
  if (attendees?.length) {
    event.attendees = attendees.map(email => ({ email }))
  }
  if (description) {
    event.description = description
  }
  
  const res = await fetch(
    'https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    }
  )
  
  return await res.json()
}

// AI Chat processing
app.post('/api/chat', async (c) => {
  const { message, history } = await c.req.json()
  const accessToken = await getAccessToken(c)
  
  if (!accessToken) {
    return c.json({ error: 'Please connect your Google account first' })
  }
  
  const openaiKey = c.env.OPENAI_API_KEY
  if (!openaiKey) {
    // Fallback to basic command processing without AI
    return processCommandBasic(accessToken, message)
  }
  
  try {
    // Use AI to understand intent and extract parameters
    const systemPrompt = `You are an AI assistant that helps users manage their email and calendar. 
You have access to the following functions:
- list_emails(query?: string, maxResults?: number): List/search emails
- send_email(to: string, subject: string, body: string): Send an email
- list_events(timeMin?: string, timeMax?: string): List calendar events
- create_event(summary: string, start: string, end: string, attendees?: string[], description?: string): Create calendar event

Based on the user's message, determine what action to take and extract the parameters.
Respond with JSON in this format:
{
  "action": "list_emails" | "send_email" | "list_events" | "create_event" | "none",
  "params": { ... },
  "response": "Your friendly response to the user"
}

For dates, use ISO format. Current date: ${new Date().toISOString()}
If the user asks something you can't help with, set action to "none".`

    const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message },
        ],
        response_format: { type: 'json_object' },
      }),
    })
    
    const aiData = await aiRes.json() as any
    const parsed = JSON.parse(aiData.choices[0].message.content)
    
    let data = {}
    
    // Execute the action
    switch (parsed.action) {
      case 'list_emails': {
        const emails = await listEmails(accessToken, parsed.params?.query, parsed.params?.maxResults || 5)
        data = { emails }
        break
      }
      case 'send_email': {
        await sendEmail(accessToken, parsed.params.to, parsed.params.subject, parsed.params.body)
        break
      }
      case 'list_events': {
        const events = await listEvents(accessToken, parsed.params?.timeMin, parsed.params?.timeMax)
        data = { events }
        break
      }
      case 'create_event': {
        await createEvent(
          accessToken,
          parsed.params.summary,
          parsed.params.start,
          parsed.params.end,
          parsed.params.attendees,
          parsed.params.description
        )
        break
      }
    }
    
    return c.json({ response: parsed.response, data })
  } catch (e: any) {
    console.error('AI processing error:', e)
    // Fallback to basic processing
    return processCommandBasic(accessToken, message)
  }
})

// Basic command processing without AI
async function processCommandBasic(accessToken: string, message: string) {
  const lower = message.toLowerCase()
  
  try {
    if (lower.includes('email') || lower.includes('inbox') || lower.includes('mail')) {
      const query = lower.includes('from') ? message.split('from')[1]?.trim() : undefined
      const emails = await listEmails(accessToken, query, 5)
      
      if (emails.length === 0) {
        return { response: 'No emails found matching your query.', data: {} }
      }
      
      return {
        response: `📥 Here are your ${query ? 'matching' : 'latest'} emails:`,
        data: { emails }
      }
    }
    
    if (lower.includes('calendar') || lower.includes('schedule') || lower.includes('event') || lower.includes('meeting')) {
      let timeMin = new Date().toISOString()
      let timeMax: string | undefined
      
      if (lower.includes('today')) {
        const end = new Date()
        end.setHours(23, 59, 59, 999)
        timeMax = end.toISOString()
      } else if (lower.includes('week')) {
        const end = new Date()
        end.setDate(end.getDate() + 7)
        timeMax = end.toISOString()
      } else if (lower.includes('tomorrow')) {
        const start = new Date()
        start.setDate(start.getDate() + 1)
        start.setHours(0, 0, 0, 0)
        timeMin = start.toISOString()
        const end = new Date(start)
        end.setHours(23, 59, 59, 999)
        timeMax = end.toISOString()
      }
      
      const events = await listEvents(accessToken, timeMin, timeMax)
      
      if (events.length === 0) {
        return { response: '📅 No upcoming events found.', data: {} }
      }
      
      return {
        response: `📅 Here are your upcoming events:`,
        data: { events }
      }
    }
    
    return {
      response: `I can help you with:
• **View emails**: "Show my latest emails" or "Search emails from John"
• **View calendar**: "What's on my calendar today?" or "Show my schedule this week"
• **Send email**: "Send an email to [email] about [topic]"
• **Create event**: "Schedule a meeting tomorrow at 2pm"

What would you like to do?`,
      data: {}
    }
  } catch (e: any) {
    return { error: `Failed to process request: ${e.message}` }
  }
}

// Health check
app.get('/api/health', (c) => c.json({ ok: true, time: new Date().toISOString() }))

export default app
