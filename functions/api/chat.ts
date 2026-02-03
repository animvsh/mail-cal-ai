interface Env {
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  OPENAI_API_KEY: string
}

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'

async function refreshTokens(refreshToken: string, clientId: string, clientSecret: string) {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    }),
  })
  return await res.json() as any
}

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
    start: event.start?.dateTime ? new Date(event.start.dateTime).toLocaleString() : event.start?.date,
    end: event.end?.dateTime ? new Date(event.end.dateTime).toLocaleString() : event.end?.date,
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

async function processWithAI(message: string, openaiKey: string) {
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

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
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
  
  const data = await res.json() as any
  return JSON.parse(data.choices[0].message.content)
}

function processBasic(message: string) {
  const lower = message.toLowerCase()
  
  if (lower.includes('email') || lower.includes('inbox') || lower.includes('mail')) {
    const fromMatch = message.match(/from\s+(\S+)/i)
    return {
      action: 'list_emails',
      params: { query: fromMatch ? `from:${fromMatch[1]}` : undefined },
      response: fromMatch ? `Searching for emails from ${fromMatch[1]}...` : 'Here are your latest emails:'
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
    
    return {
      action: 'list_events',
      params: { timeMin, timeMax },
      response: lower.includes('today') ? "Here's your schedule for today:" : 
                lower.includes('tomorrow') ? "Here's your schedule for tomorrow:" :
                "Here are your upcoming events:"
    }
  }
  
  return {
    action: 'none',
    params: {},
    response: `I can help you with:
• **View emails**: "Show my latest emails" or "Search emails from John"
• **View calendar**: "What's on my calendar today?" or "Show my schedule this week"
• **Send email**: "Send an email to [email] about [topic]"
• **Create event**: "Schedule a meeting tomorrow at 2pm"

What would you like to do?`
  }
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { message, tokens } = await context.request.json() as { 
    message: string
    tokens?: { access_token: string, refresh_token: string, expires_at: number }
  }
  
  if (!tokens?.access_token) {
    return Response.json({ error: 'Please connect your Google account first' })
  }
  
  let accessToken = tokens.access_token
  let newTokens = null
  
  // Refresh if expired
  if (tokens.expires_at && Date.now() >= tokens.expires_at - 60000) {
    try {
      const refreshed = await refreshTokens(
        tokens.refresh_token,
        context.env.GOOGLE_CLIENT_ID,
        context.env.GOOGLE_CLIENT_SECRET
      )
      accessToken = refreshed.access_token
      newTokens = {
        access_token: refreshed.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: Date.now() + (refreshed.expires_in * 1000)
      }
    } catch (e) {
      return Response.json({ error: 'Session expired. Please reconnect.' })
    }
  }
  
  try {
    // Try AI processing, fall back to basic
    let parsed
    if (context.env.OPENAI_API_KEY) {
      try {
        parsed = await processWithAI(message, context.env.OPENAI_API_KEY)
      } catch (e) {
        parsed = processBasic(message)
      }
    } else {
      parsed = processBasic(message)
    }
    
    let data: any = {}
    
    switch (parsed.action) {
      case 'list_emails': {
        const emails = await listEmails(accessToken, parsed.params?.query, parsed.params?.maxResults || 5)
        data = { emails }
        if (emails.length === 0) {
          parsed.response = 'No emails found matching your query.'
        }
        break
      }
      case 'send_email': {
        if (!parsed.params?.to || !parsed.params?.subject) {
          parsed.response = 'Please specify who to send the email to and the subject.'
        } else {
          await sendEmail(accessToken, parsed.params.to, parsed.params.subject, parsed.params.body || '')
          parsed.response = `✅ Email sent to ${parsed.params.to}!`
        }
        break
      }
      case 'list_events': {
        const events = await listEvents(accessToken, parsed.params?.timeMin, parsed.params?.timeMax)
        data = { events }
        if (events.length === 0) {
          parsed.response = '📅 No upcoming events found.'
        }
        break
      }
      case 'create_event': {
        if (!parsed.params?.summary || !parsed.params?.start || !parsed.params?.end) {
          parsed.response = 'Please specify the meeting title, start time, and end time.'
        } else {
          await createEvent(
            accessToken,
            parsed.params.summary,
            parsed.params.start,
            parsed.params.end,
            parsed.params.attendees,
            parsed.params.description
          )
          parsed.response = `✅ Created event: "${parsed.params.summary}"`
        }
        break
      }
    }
    
    return Response.json({ 
      response: parsed.response, 
      data,
      newTokens
    })
  } catch (e: any) {
    console.error('Chat error:', e)
    return Response.json({ error: `Failed to process: ${e.message}` })
  }
}
