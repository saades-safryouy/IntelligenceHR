import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Bot, Send, ShieldCheck, Sparkles } from 'lucide-react'
import './AskIntelligencePage.css'

type Role = 'assistant' | 'user'

interface ChatMessage {
  id: number
  role: Role
  content: string
  time: Date
}

const WELCOME_MESSAGE =
  'Hello! I am your IntelligenceHR AI Assistant. How can I help you analyze workforce analytics, check leave policies, or generate employee insights today?'

const SUGGESTED_PROMPTS = [
  'What is our current engineering turnover rate?',
  'Show pending leave approvals exceeding 3 days',
  'Summarize Q3 department headcount growth',
  'Explain remote work compliance guidelines',
]

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
})

// Placeholder reply. Replace with a call to your assistant API.
function buildMockReply(query: string) {
  return `I've analyzed your query regarding "${query}". Based on current active RBAC permissions and HR datasets, all compliance checks are verified. Is there anything specific about departmental headcounts or leave approval trends you would like to drill down into?`
}

export function AskIntelligencePage() {
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    { id: 0, role: 'assistant', content: WELCOME_MESSAGE, time: new Date() },
  ])
  const [input, setInput] = useState('')
  const [isThinking, setIsThinking] = useState(false)

  const nextId = useRef(1)
  const logRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const replyTimer = useRef<number | null>(null)

  // Keep the newest message in view
  useEffect(() => {
    const log = logRef.current
    if (!log) return
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    log.scrollTo({ top: log.scrollHeight, behavior: reduceMotion ? 'auto' : 'smooth' })
  }, [messages, isThinking])

  // Clear any pending reply when leaving the page
  useEffect(() => {
    return () => {
      if (replyTimer.current !== null) window.clearTimeout(replyTimer.current)
    }
  }, [])

  const addMessage = (role: Role, content: string) => {
    setMessages((prev) => [
      ...prev,
      { id: nextId.current++, role, content, time: new Date() },
    ])
  }

  const handleSend = (e: FormEvent) => {
    e.preventDefault()
    const query = input.trim()
    if (!query || isThinking) return

    addMessage('user', query)
    setInput('')
    setIsThinking(true)

    replyTimer.current = window.setTimeout(() => {
      addMessage('assistant', buildMockReply(query))
      setIsThinking(false)
      replyTimer.current = null
      inputRef.current?.focus()
    }, 800)
  }

  const applyPrompt = (prompt: string) => {
    setInput(prompt)
    inputRef.current?.focus()
  }

  return (
    <div className="ask-page">
      <header className="ask-header">
        <div>
          <h1 className="ask-title">
            <Bot size={26} aria-hidden="true" />
            Ask Intelligence
          </h1>
          <p className="ask-subtitle">
            Conversational workforce analytics and policy intelligence powered by secure LLM
            embeddings.
          </p>
        </div>
        <span className="ask-badge">
          <ShieldCheck size={16} aria-hidden="true" />
          RBAC and PII masking
        </span>
      </header>

      <div className="ask-layout">
        <aside className="ask-card ask-prompts" aria-labelledby="ask-prompts-title">
          <h2 id="ask-prompts-title">
            <Sparkles size={16} aria-hidden="true" />
            Suggested prompts
          </h2>
          <ul className="ask-prompt-list">
            {SUGGESTED_PROMPTS.map((prompt) => (
              <li key={prompt}>
                <button
                  type="button"
                  className="ask-prompt"
                  onClick={() => applyPrompt(prompt)}
                  disabled={isThinking}
                >
                  {prompt}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section className="ask-card ask-chat" aria-label="Conversation">
          <div
            ref={logRef}
            className="ask-log"
            role="log"
            aria-live="polite"
            aria-relevant="additions"
          >
            {messages.map((m) => (
              <div key={m.id} className={`ask-message ask-message--${m.role}`}>
                {m.role === 'assistant' && (
                  <div className="ask-avatar" aria-hidden="true">
                    <Bot size={16} />
                  </div>
                )}
                <div className="ask-bubble-wrap">
                  <p className="ask-bubble">
                    <span className="ask-sr">
                      {m.role === 'assistant' ? 'Assistant: ' : 'You: '}
                    </span>
                    {m.content}
                  </p>
                  <time className="ask-time" dateTime={m.time.toISOString()}>
                    {timeFormatter.format(m.time)}
                  </time>
                </div>
              </div>
            ))}

            {isThinking && (
              <div className="ask-message ask-message--assistant">
                <div className="ask-avatar" aria-hidden="true">
                  <Bot size={16} />
                </div>
                <div className="ask-typing" role="status">
                  <span className="ask-sr">Assistant is typing</span>
                  <span aria-hidden="true" />
                  <span aria-hidden="true" />
                  <span aria-hidden="true" />
                </div>
              </div>
            )}
          </div>

          <form className="ask-composer" onSubmit={handleSend}>
            <input
              ref={inputRef}
              type="text"
              className="table-search"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask anything about employees, policies, or analytics..."
              aria-label="Message"
              autoComplete="off"
            />
            <button
              type="submit"
              className="button primary ask-send"
              disabled={!input.trim() || isThinking}
            >
              <Send size={16} aria-hidden="true" />
              <span>Send</span>
            </button>
          </form>
        </section>
      </div>
    </div>
  )
}