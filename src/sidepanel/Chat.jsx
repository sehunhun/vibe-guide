import React, { useState, useEffect, useRef } from 'react';
import { Button } from '../components/ui/button.jsx';
import { Card, CardContent } from '../components/ui/card.jsx';
import { cn } from '../lib/utils.js';

export default function Chat({ plan, currentTab }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const bottomRef = useRef(null);

  function renderTextWithLineBreaks(text) {
    const safe = String(text ?? '');
    const lines = safe.split('\n');
    return lines.map((line, idx) => (
      <React.Fragment key={idx}>
        {line}
        {idx < lines.length - 1 && <br />}
      </React.Fragment>
    ));
  }

  const disabled = !currentTab?.tabId || !plan || loading;

  useEffect(() => {
    if (!chrome?.storage?.local) return;
    chrome.storage.local.get(['chatMessages'], (r) => {
      const saved = r.chatMessages;
      if (Array.isArray(saved) && saved.length > 0) setMessages(saved);
    });
  }, []);

  useEffect(() => {
    if (!chrome?.storage?.local) return;
    chrome.storage.local.set({ chatMessages: messages });
  }, [messages]);

  useEffect(() => {
    if (!bottomRef.current) return;
    bottomRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, loading]);

  function handleChange(e) {
    setInput(e.target.value);
  }

  function buildHistoryWithNewUserMessage(userText) {
    const history = messages.map(m => ({ role: m.role, text: m.text }));
    history.push({ role: 'user', text: userText });
    return history;
  }

  function handleSend() {
    const text = (input || '').trim();
    if (!text || disabled) return;
    if (!currentTab?.tabId) {
      setError(chrome.i18n.getMessage('chatErrorTab'));
      return;
    }
    setError(null);
    setInput('');
    const nextMessages = [...messages, { id: Date.now(), role: 'user', text }];
    setMessages(nextMessages);
    setLoading(true);
    const history = buildHistoryWithNewUserMessage(text);

    chrome.runtime.sendMessage(
      { type: 'GET_PAGE_CHAT_ANSWER', tabId: currentTab.tabId, history, userMessage: text },
      (res) => {
        setLoading(false);
        if (!res || res.error) {
          setError(res?.error || chrome.i18n.getMessage('chatErrorLoad'));
          return;
        }
        const answer = (res.text || '').trim();
        if (!answer) {
          setError(chrome.i18n.getMessage('chatErrorEmpty'));
          return;
        }
        setMessages(prev => [...prev, { id: Date.now() + 1, role: 'assistant', text: answer }]);
      }
    );
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        <div className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-4 text-center text-xs text-muted-foreground">
          <p className="mb-1">{chrome.i18n.getMessage('chatIntro')}</p>
          <p>{chrome.i18n.getMessage('chatExample')}</p>
        </div>

        {messages.map(m => (
          <div
            key={m.id}
            className={cn(
              'flex flex-col',
              m.role === 'user' ? 'items-end' : 'items-start'
            )}
          >
            <Card
              className={cn(
                'max-w-[90%]',
                m.role === 'user'
                  ? 'border-primary/30 bg-primary/10'
                  : 'bg-muted/50'
              )}
            >
              <CardContent className="px-3 py-2 text-xs leading-relaxed">
                {renderTextWithLineBreaks(m.text)}
              </CardContent>
            </Card>
          </div>
        ))}

        {loading && (
          <div className="flex flex-col items-start">
            <Card className="bg-muted/50">
              <CardContent className="px-3 py-2 text-xs text-muted-foreground">
                {chrome.i18n.getMessage('chatThinking')}
              </CardContent>
            </Card>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      <div className="flex shrink-0 items-end gap-2">
        <textarea
          className="min-h-[44px] w-full flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50"
          placeholder={chrome.i18n.getMessage('chatPlaceholder')}
          value={input}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          rows={2}
          disabled={disabled}
        />
        <Button
          size="default"
          onClick={handleSend}
          disabled={disabled || !input.trim()}
          className="shrink-0"
        >
          {chrome.i18n.getMessage('chatSend')}
        </Button>
      </div>
    </div>
  );
}
