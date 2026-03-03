import React, { useState, useEffect, useRef } from 'react';

/**
 * Chat 탭
 * - 현재 플랜/페이지 컨텍스트를 활용해서
 *   웹페이지 내부 요소와 용어를 비개발자 친화적으로 설명하는 채팅 UI
 */

export default function Chat({ plan, currentTab }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const bottomRef = useRef(null);

  const disabled = !currentTab?.tabId || !plan || loading;

   // 초기 로드시 이전 채팅 불러오기
  useEffect(() => {
    if (!chrome?.storage?.local) return;
    chrome.storage.local.get(['chatMessages'], (r) => {
      const saved = r.chatMessages;
      if (Array.isArray(saved) && saved.length > 0) {
        setMessages(saved);
      }
    });
  }, []);

  // 메시지 변경 시 저장
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
    const history = messages.map(m => ({
      role: m.role,
      text: m.text,
    }));
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
    const nextMessages = [
      ...messages,
      { id: Date.now(), role: 'user', text },
    ];
    setMessages(nextMessages);
    setLoading(true);

    const history = buildHistoryWithNewUserMessage(text);

    chrome.runtime.sendMessage(
      {
        type: 'GET_PAGE_CHAT_ANSWER',
        tabId: currentTab.tabId,
        history,
        userMessage: text,
      },
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
        setMessages(prev => [
          ...prev,
          { id: Date.now() + 1, role: 'assistant', text: answer },
        ]);
      },
    );
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="chat">
      <div className="chat-messages">
        <div className="chat-empty">
          <p>{chrome.i18n.getMessage('chatIntro')}</p>
          <p>{chrome.i18n.getMessage('chatExample')}</p>
        </div>

        {messages.map(m => (
          <div
            key={m.id}
            className={`chat-message ${m.role === 'assistant' ? 'assistant' : 'user'}`}
          >
            <div className="chat-bubble">
              {m.text}
            </div>
          </div>
        ))}

        {loading && (
          <div className="chat-message assistant">
            <div className="chat-bubble chat-bubble-loading">
              {chrome.i18n.getMessage('chatThinking')}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {error && (
        <div className="chat-error">
          {error}
        </div>
      )}

      <div className="chat-input-wrap">
        <textarea
          className="chat-input"
          placeholder={chrome.i18n.getMessage('chatPlaceholder')}
          value={input}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          rows={2}
          disabled={disabled}
        />
        <button
          type="button"
          className="chat-send-btn"
          onClick={handleSend}
          disabled={disabled || !input.trim()}
        >
          {chrome.i18n.getMessage('chatSend')}
        </button>
      </div>
    </div>
  );
}

