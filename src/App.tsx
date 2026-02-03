import { useState, useRef, useEffect } from 'react'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  data?: {
    emails?: Email[]
    events?: CalendarEvent[]
  }
}

interface Email {
  id: string
  from: string
  subject: string
  snippet: string
  date: string
  unread?: boolean
}

interface CalendarEvent {
  id: string
  summary: string
  start: string
  end: string
  attendees?: string[]
  location?: string
}

interface AuthState {
  isAuthenticated: boolean
  user?: {
    email: string
    name: string
    picture: string
  }
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: `👋 Hi! I'm your Email & Calendar AI Assistant. I can help you:

📧 **Email**
- Read and search your inbox
- Send emails and reply to threads
- Summarize email conversations

📅 **Calendar**
- View upcoming events
- Create and modify meetings
- Check your availability

🔗 **Cross-functionality**
- Schedule meetings with email contacts
- Send meeting invites
- Find meeting history with specific people

**Get started by connecting your Google account, then ask me anything!**`,
      timestamp: new Date()
    }
  ])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [auth, setAuth] = useState<AuthState>({ isAuthenticated: false })
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    // Check auth status on load
    checkAuth()
    
    // Handle OAuth callback
    const urlParams = new URLSearchParams(window.location.search)
    const code = urlParams.get('code')
    if (code) {
      handleOAuthCallback(code)
    }
  }, [])

  const checkAuth = async () => {
    try {
      const res = await fetch('/api/auth/status')
      const data = await res.json()
      setAuth(data)
    } catch (e) {
      console.log('Auth check failed')
    }
  }

  const handleOAuthCallback = async (code: string) => {
    try {
      const res = await fetch('/api/auth/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      })
      const data = await res.json()
      if (data.success) {
        setAuth({ isAuthenticated: true, user: data.user })
        window.history.replaceState({}, '', '/')
        addMessage('assistant', '✅ Successfully connected! You can now ask me to read emails, check your calendar, send messages, and more.')
      }
    } catch (e) {
      addMessage('assistant', '❌ Failed to connect your account. Please try again.')
    }
  }

  const handleConnect = async () => {
    try {
      const res = await fetch('/api/auth/url')
      const data = await res.json()
      window.location.href = data.url
    } catch (e) {
      addMessage('assistant', '❌ Could not initiate Google sign-in. Please try again.')
    }
  }

  const handleDisconnect = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
      setAuth({ isAuthenticated: false })
      addMessage('assistant', '👋 Disconnected. Connect again anytime!')
    } catch (e) {
      console.log('Logout failed')
    }
  }

  const addMessage = (role: 'user' | 'assistant', content: string, data?: Message['data']) => {
    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      role,
      content,
      timestamp: new Date(),
      data
    }])
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    const userMessage = input.trim()
    setInput('')
    addMessage('user', userMessage)
    setIsLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: userMessage,
          history: messages.slice(-10)
        })
      })

      const data = await res.json()
      
      if (data.error) {
        addMessage('assistant', `❌ ${data.error}`)
      } else {
        addMessage('assistant', data.response, data.data)
      }
    } catch (e) {
      addMessage('assistant', '❌ Something went wrong. Please try again.')
    } finally {
      setIsLoading(false)
      inputRef.current?.focus()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  const quickActions = [
    { label: '📥 Show inbox', action: 'Show me my latest emails' },
    { label: '📅 Today\'s schedule', action: 'What\'s on my calendar today?' },
    { label: '📆 This week', action: 'Show my schedule for this week' },
    { label: '🔍 Search emails', action: 'Search for emails from ' },
  ]

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-white/10 bg-black/20 backdrop-blur-xl">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-3xl">📬</span>
            <div>
              <h1 className="text-xl font-bold text-white">Mail Cal AI</h1>
              <p className="text-xs text-purple-300">Email & Calendar Assistant</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {auth.isAuthenticated ? (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  {auth.user?.picture && (
                    <img src={auth.user.picture} alt="" className="w-8 h-8 rounded-full" />
                  )}
                  <span className="text-sm text-white/80">{auth.user?.email}</span>
                </div>
                <button
                  onClick={handleDisconnect}
                  className="px-3 py-1.5 text-sm bg-white/10 hover:bg-white/20 text-white rounded-lg transition"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <button
                onClick={handleConnect}
                className="flex items-center gap-2 px-4 py-2 bg-white text-gray-800 rounded-lg hover:bg-gray-100 transition font-medium"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Connect Google
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`message-enter flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                  message.role === 'user'
                    ? 'bg-purple-600 text-white'
                    : 'bg-white/10 text-white/90 backdrop-blur'
                }`}
              >
                <div className="whitespace-pre-wrap">{message.content}</div>
                
                {/* Render email results */}
                {message.data?.emails && message.data.emails.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {message.data.emails.map((email) => (
                      <div key={email.id} className="bg-black/20 rounded-lg p-3">
                        <div className="flex items-start justify-between">
                          <div className="font-medium text-purple-300">{email.from}</div>
                          <div className="text-xs text-white/50">{email.date}</div>
                        </div>
                        <div className="font-medium mt-1">{email.subject}</div>
                        <div className="text-sm text-white/70 mt-1">{email.snippet}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Render calendar events */}
                {message.data?.events && message.data.events.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {message.data.events.map((event) => (
                      <div key={event.id} className="bg-black/20 rounded-lg p-3">
                        <div className="font-medium text-purple-300">{event.summary}</div>
                        <div className="text-sm text-white/70 mt-1">
                          📅 {event.start} - {event.end}
                        </div>
                        {event.location && (
                          <div className="text-sm text-white/70">📍 {event.location}</div>
                        )}
                        {event.attendees && event.attendees.length > 0 && (
                          <div className="text-sm text-white/70">
                            👥 {event.attendees.join(', ')}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                
                <div className="text-xs text-white/40 mt-2">
                  {message.timestamp.toLocaleTimeString()}
                </div>
              </div>
            </div>
          ))}
          
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-white/10 backdrop-blur rounded-2xl px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                    <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                    <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                  </div>
                  <span className="text-white/60 text-sm">Thinking...</span>
                </div>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Quick Actions */}
      {auth.isAuthenticated && (
        <div className="flex-shrink-0 px-4 py-2">
          <div className="max-w-4xl mx-auto flex flex-wrap gap-2 justify-center">
            {quickActions.map((action, i) => (
              <button
                key={i}
                onClick={() => {
                  setInput(action.action)
                  inputRef.current?.focus()
                }}
                className="px-3 py-1.5 text-sm bg-white/10 hover:bg-white/20 text-white/80 rounded-full transition"
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="flex-shrink-0 border-t border-white/10 bg-black/20 backdrop-blur-xl">
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex gap-3">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={auth.isAuthenticated ? "Ask about your emails or calendar..." : "Connect your Google account to get started..."}
              disabled={!auth.isAuthenticated}
              rows={1}
              className="flex-1 bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading || !auth.isAuthenticated}
              className="px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-600/50 text-white rounded-xl font-medium transition"
            >
              Send
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
