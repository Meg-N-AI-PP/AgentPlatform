import { useState, useRef, useEffect, useCallback, type FormEvent } from 'react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  traceId?: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const API_BASE = '/api/agents';

function uid(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function App() {
  /* --- settings --- */
  const [agentId, setAgentId] = useState(() => localStorage.getItem('agentId') ?? '');
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('apiKey') ?? '');
  const [tenantId, setTenantId] = useState(() => localStorage.getItem('tenantId') ?? '');
  const [settingsOpen, setSettingsOpen] = useState(true);

  /* --- chat state --- */
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  /* persist settings */
  useEffect(() => { localStorage.setItem('agentId', agentId); }, [agentId]);
  useEffect(() => { localStorage.setItem('apiKey', apiKey); }, [apiKey]);
  useEffect(() => { localStorage.setItem('tenantId', tenantId); }, [tenantId]);

  /* auto-scroll */
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  /* close settings once all are filled */
  useEffect(() => {
    if (agentId && apiKey && tenantId) setSettingsOpen(false);
  }, []);

  /* ---------------------------------------------------------------- */
  /*  Send message with streaming                                      */
  /* ---------------------------------------------------------------- */

  const send = useCallback(async (e?: FormEvent) => {
    e?.preventDefault();
    const text = input.trim();
    if (!text || streaming) return;
    if (!agentId || !apiKey || !tenantId) {
      setSettingsOpen(true);
      return;
    }

    const userMsg: ChatMessage = { id: uid(), role: 'user', content: text };
    const assistantMsg: ChatMessage = { id: uid(), role: 'assistant', content: '' };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput('');
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`${API_BASE}/${agentId}/invoke-stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'x-tenant-id': tenantId,
        },
        body: JSON.stringify({ input: text }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`HTTP ${res.status}: ${errBody}`);
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) throw new Error('No readable stream');

      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (!payload) continue;

          try {
            const parsed = JSON.parse(payload);

            if (parsed.type === 'chunk') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsg.id
                    ? { ...m, content: m.content + parsed.text }
                    : m
                )
              );
            }

            if (parsed.type === 'done') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsg.id ? { ...m, traceId: parsed.traceId } : m
                )
              );
            }

            if (parsed.type === 'error') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsg.id
                    ? { ...m, content: m.content + `\n\n⚠ Error: ${parsed.message}` }
                    : m
                )
              );
            }
          } catch {
            /* skip malformed JSON */
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id
              ? { ...m, content: m.content || `⚠ ${err.message}` }
              : m
          )
        );
      }
    } finally {
      abortRef.current = null;
      setStreaming(false);
    }
  }, [input, streaming, agentId, apiKey, tenantId]);

  const stop = () => {
    abortRef.current?.abort();
  };

  const clearChat = () => {
    setMessages([]);
  };

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <div className="app">
      {/* ---- Header ---- */}
      <header className="header">
        <div className="header-left">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a4 4 0 0 1 4 4v1h1a3 3 0 0 1 3 3v1a3 3 0 0 1-3 3h-1v4a4 4 0 0 1-8 0v-4H7a3 3 0 0 1-3-3v-1a3 3 0 0 1 3-3h1V6a4 4 0 0 1 4-4z"/>
            <circle cx="9" cy="10" r="1" fill="currentColor"/>
            <circle cx="15" cy="10" r="1" fill="currentColor"/>
          </svg>
          <h1>Agent Test App</h1>
        </div>
        <div className="header-actions">
          <button className="btn-icon" onClick={clearChat} title="Clear chat">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14H7L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
            </svg>
          </button>
          <button
            className={`btn-icon ${settingsOpen ? 'active' : ''}`}
            onClick={() => setSettingsOpen(!settingsOpen)}
            title="Settings"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
        </div>
      </header>

      {/* ---- Settings panel ---- */}
      {settingsOpen && (
        <div className="settings-panel">
          <div className="settings-grid">
            <label>
              <span>Agent ID</span>
              <input
                type="text"
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                spellCheck={false}
              />
            </label>
            <label>
              <span>API Key</span>
              <input
                type="password"
                placeholder="Your Dataverse API key"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                spellCheck={false}
              />
            </label>
            <label>
              <span>Tenant ID</span>
              <input
                type="text"
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
                spellCheck={false}
              />
            </label>
          </div>
          {(!agentId || !apiKey || !tenantId) && (
            <p className="settings-hint">Fill in all fields to start chatting.</p>
          )}
        </div>
      )}

      {/* ---- Messages area ---- */}
      <div className="messages" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="empty-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.4">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            <p>Send a message to begin</p>
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`message ${msg.role}`}>
            <div className="message-avatar">
              {msg.role === 'user' ? 'You' : 'AI'}
            </div>
            <div className="message-body">
              <div className="message-content">
                {msg.content || (msg.role === 'assistant' && streaming ? (
                  <span className="typing-indicator">
                    <span /><span /><span />
                  </span>
                ) : null)}
              </div>
              {msg.traceId && (
                <div className="message-meta">trace: {msg.traceId}</div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ---- Input bar ---- */}
      <form className="input-bar" onSubmit={send}>
        <input
          type="text"
          className="chat-input"
          placeholder="Type your message…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={streaming}
          autoFocus
        />
        {streaming ? (
          <button type="button" className="btn-send stop" onClick={stop} title="Stop">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="2"/>
            </svg>
          </button>
        ) : (
          <button type="submit" className="btn-send" disabled={!input.trim()} title="Send">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        )}
      </form>
    </div>
  );
}
