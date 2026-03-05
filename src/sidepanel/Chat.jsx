import React, { useState, useEffect, useRef } from 'react';
import { Button } from '../components/ui/button.jsx';
import { Card, CardContent } from '../components/ui/card.jsx';
import { cn } from '../lib/utils.js';

export default function Chat({ plan, currentTab }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [segmentIndexMap, setSegmentIndexMap] = useState({});
  const bottomRef = useRef(null);

  function renderInlineFormatting(text) {
    const safe = String(text ?? '');
    const nodes = [];
    const regex = /\*\*(.+?)\*\*/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(safe)) !== null) {
      if (match.index > lastIndex) {
        nodes.push(safe.slice(lastIndex, match.index));
      }
      nodes.push(<strong key={`b-${lastIndex}`}>{match[1]}</strong>);
      lastIndex = regex.lastIndex;
    }

    if (lastIndex < safe.length) {
      nodes.push(safe.slice(lastIndex));
    }

    return nodes.length > 0 ? nodes : safe;
  }

  function splitAnswerSegments(text) {
    const safe = String(text ?? '');
    // AI가 넣어주는 "<page>" 마커 기준으로 페이징
    const parts = safe
      .split(/<page>/gi)
      .map(p => p.trim())
      .filter(Boolean);
    return parts.length > 0 ? parts : [safe.trim()];
  }

  function renderTextWithLineBreaks(text) {
    const safe = String(text ?? '')
      .replace(/\r\n/g, '\n')
      .replace(/<br\s*\/?>/gi, '\n');
    const lines = safe.split('\n');
    return lines.map((line, idx) => (
      <React.Fragment key={idx}>
        {renderInlineFormatting(line)}
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
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-y-auto overflow-x-hidden">
        <div className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-4 text-center text-xs text-muted-foreground shrink-0">
          <p className="mb-1">{chrome.i18n.getMessage('chatIntro')}</p>
          <p>{chrome.i18n.getMessage('chatExample')}</p>
        </div>

        {messages.map(m => {
          const isAssistant = m.role === 'assistant';
          const rawText = String(m.text ?? '');
          const segments = isAssistant ? splitAnswerSegments(rawText) : [rawText];
          const totalSegments = segments.length;
          const currentIndexRaw = segmentIndexMap[m.id] ?? 0;
          const currentIndex = Math.min(Math.max(currentIndexRaw, 0), totalSegments - 1);
          const activeText = segments[currentIndex] ?? '';

          const showPager = isAssistant && totalSegments > 1;

          const goToPrev = () => {
            if (!showPager || currentIndex === 0) return;
            setSegmentIndexMap(prev => ({
              ...prev,
              [m.id]: currentIndex - 1,
            }));
          };

          const goToNext = () => {
            if (!showPager || currentIndex >= totalSegments - 1) return;
            setSegmentIndexMap(prev => ({
              ...prev,
              [m.id]: currentIndex + 1,
            }));
          };

          return (
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
                  {showPager && (
                    <div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>
                        {currentIndex + 1} / {totalSegments}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={goToPrev}
                          disabled={currentIndex === 0}
                          className={cn(
                            'rounded px-1 py-0.5 transition-colors',
                            currentIndex === 0
                              ? 'cursor-not-allowed opacity-40'
                              : 'hover:bg-muted'
                          )}
                          aria-label="이전 구간"
                        >
                          ‹
                        </button>
                        <button
                          type="button"
                          onClick={goToNext}
                          disabled={currentIndex >= totalSegments - 1}
                          className={cn(
                            'rounded px-1 py-0.5 transition-colors',
                            currentIndex >= totalSegments - 1
                              ? 'cursor-not-allowed opacity-40'
                              : 'hover:bg-muted'
                          )}
                          aria-label="다음 구간"
                        >
                          ›
                        </button>
                      </div>
                    </div>
                  )}
                  {renderTextWithLineBreaks(activeText)}
                </CardContent>
              </Card>
            </div>
          );
        })}

        {loading && (
          <div className="flex flex-col items-start">
            <Card className="bg-muted/50">
              <CardContent className="px-3 py-2 text-xs text-muted-foreground">
                {chrome.i18n.getMessage('chatThinking')}
              </CardContent>
            </Card>
          </div>
        )}

        <div ref={bottomRef} className="shrink-0" />
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      <div className="flex shrink-0 items-end gap-2 pt-1">
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
