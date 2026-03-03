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
      setError('현재 탭 정보를 불러올 수 없습니다. 일반 웹페이지에서 다시 시도해 주세요.');
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
          setError(res?.error || '채팅 응답을 가져오지 못했어요. 잠시 후 다시 시도해 주세요.');
          return;
        }
        const answer = (res.text || '').trim();
        if (!answer) {
          setError('빈 응답을 받았어요. 잠시 후 다시 시도해 주세요.');
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
        {messages.length === 0 && !loading && (
          <div className="chat-empty">
            <p>현재 보고 있는 페이지의 버튼, 메뉴, 설정 용어가 헷갈리면 편하게 물어보세요.</p>
            <p>예: "이 페이지에서 <strong>프로젝트</strong>는 무슨 뜻이에요?", "오른쪽 위 톱니바퀴 아이콘이 뭔가요?"</p>
          </div>
        )}

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
              생각 중이에요…
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
          placeholder="이 페이지의 버튼/메뉴/설정이 궁금한 점을 적어주세요."
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
          보내기
        </button>
      </div>
    </div>
  );
}

