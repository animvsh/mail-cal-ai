interface Env {
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  TOKENS: KVNamespace
}

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo'

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { code } = await context.request.json() as { code: string }
  const clientId = context.env.GOOGLE_CLIENT_ID
  const clientSecret = context.env.GOOGLE_CLIENT_SECRET
  
  if (!clientId || !clientSecret) {
    return Response.json({ error: 'OAuth not configured' }, { status: 500 })
  }
  
  const url = new URL(context.request.url)
  const redirectUri = `${url.origin}`
  
  try {
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
      return Response.json({ error: tokens.error_description || tokens.error }, { status: 400 })
    }
    
    const userRes = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
    const user = await userRes.json() as any
    
    // Store tokens in KV (or cookie for simplicity)
    const tokenData = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: Date.now() + (tokens.expires_in * 1000),
      user: { email: user.email, name: user.name, picture: user.picture },
    }
    
    // For production, store in KV:
    // await context.env.TOKENS.put('demo-session', JSON.stringify(tokenData), { expirationTtl: 604800 })
    
    // For now, return tokens to client to store in localStorage
    const response = Response.json({ success: true, user: tokenData.user, tokens: tokenData })
    
    return response
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
