/**
 * Content Script - 모든 페이지에서 실행
 *
 * - URL 변경 감지 → background에 알림
 * - GET_PAGE_HTML: 페이지 HTML 수집 (간소화)
 * - SPOTLIGHT_ELEMENT: 지정 선택자 요소로 스크롤 + 하이라이트
 * - SPOTLIGHT_BY_RECT: 뷰포트 좌표(rect)로 문서에 고정 div 하이라이트 (스크롤해도 요소에 고정)
- SPOTLIGHT_BY_SELECTOR: 셀렉터로 요소 찾아 fixed overlay + scroll/resize 시마다 위치 갱신
 */

const MAX_HTML_LEN = 35000;

/** 스포트라이트 제거 시 추가 정리(리스너 해제, data 속성 제거 등) */
let _spotlightCleanup = null;

/** 4초 자동 제거 타이머 ID (clearTimeout용) */
let _spotlightTimeoutId = null;

/** wrapper 생성 중복 방지: 한 번에 하나만 감싸기 */
let _spotlightWrapLock = false;

/** 스포트라이트가 꺼진 뒤에도 잠시 동안 같은 요소 클릭을 감지하기 위한 selector 캐시 */
let _pendingClickSelector = null;

/** 단계 설명 팝업 및 히스토리 관리용 전역 상태 */
let _spotlightExplainPopup = null;
let _spotlightExplainState = null; // { stepKey, explain }
const _stepExplainHistoryByKey = {};
let _spotlightExplainLoading = false;

const POPUP_ROOT_ID = 'vibe-guide-popup-root';

function removeExplainPopup() {
  if (_spotlightExplainPopup && _spotlightExplainPopup.parentNode) {
    const parent = _spotlightExplainPopup.parentNode;
    parent.removeChild(_spotlightExplainPopup);
    if (parent.id === POPUP_ROOT_ID && parent.parentNode) {
      parent.parentNode.removeChild(parent);
    }
  }
  _spotlightExplainPopup = null;
  _spotlightExplainState = null;
  _spotlightExplainLoading = false;
}

function getStepHistory(stepKey) {
  if (!stepKey) return [];
  if (!_stepExplainHistoryByKey[stepKey]) {
    _stepExplainHistoryByKey[stepKey] = [];
  }
  return _stepExplainHistoryByKey[stepKey];
}

function reportUrl() {
  chrome.runtime.sendMessage({
    type: 'URL_CHANGED',
    url: location.href,
    hostname: location.hostname,
  }).catch(() => {});
}

/** body 내부 HTML 간소화 (script/style 제거, 길이 제한) */
function getPageHtml() {
  try {
    const clone = document.body.cloneNode(true);
    clone.querySelectorAll('script, style, noscript, iframe').forEach(el => el.remove());
    let html = clone.innerHTML
      .replace(/\s+/g, ' ')
      .replace(/>\s+</g, '><')
      .trim();
    if (html.length > MAX_HTML_LEN) html = html.slice(0, MAX_HTML_LEN) + '...';
    return html;
  } catch (e) {
    return '';
  }
}

/** wrapper 방식 스포트라이트 해제: wrapper 찾아서 자식 다시 원위치 후 wrapper 제거 */
function unwrapSpotlight() {
  const wrapper = document.getElementById('vibe-guide-spotlight-wrapper');
  if (!wrapper || !wrapper.parentNode) return false;
  const child = wrapper.firstElementChild;
  if (child) {
    wrapper.parentNode.insertBefore(child, wrapper);
  }
  wrapper.remove();
  return true;
}

/** 스포트라이트 제거 (wrapper가 여러 개 쌓여 있어도 전부 제거) */
function removeSpotlight() {
  _spotlightWrapLock = false;
  if (_spotlightTimeoutId != null) {
    clearTimeout(_spotlightTimeoutId);
    _spotlightTimeoutId = null;
  }
  if (_spotlightCleanup) {
    _spotlightCleanup();
    _spotlightCleanup = null;
  }
  document.getElementById('vibe-guide-spotlight-dim-overlay')?.remove();
  document.getElementById('vibe-guide-spotlight-click-catcher')?.remove();
  // 단계 설명 팝업도 함께 제거
  removeExplainPopup();
  let removed = false;
  while (unwrapSpotlight()) removed = true;
  const id = 'vibe-guide-spotlight';
  const el = document.getElementById(id);
  if (el) {
    el.remove();
    removed = true;
  }
  return removed;
}

/** 클릭 좌표가 요소의 화면 영역(rect) 안에 들어오는지 좌표 기준으로 판정 */
function isClickInsideElement(event, el) {
  if (!event || !el) return false;
  const rect = el.getBoundingClientRect();
  const x = event.clientX;
  const y = event.clientY;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  if (rect.width === 0 && rect.height === 0) return false;
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

// 스포트라이트가 이미 사라진 이후에도, 잠시 동안은 같은 요소(selector 기준)를 클릭하면
// SPOTLIGHT_TARGET_CLICKED를 보내기 위한 전역 캡처 리스너
document.addEventListener('click', (event) => {
  try {
    if (!_pendingClickSelector) return;
    const el = document.querySelector(_pendingClickSelector);
    if (!el) {
      _pendingClickSelector = null;
      return;
    }
    const target = event?.target;
    const byContains = el.contains(target);
    const byPath = event.composedPath && event.composedPath().includes(el);
    const byRect = isClickInsideElement(event, el);
    const matched = byContains || byPath || byRect;
    console.log('[vibe-guide] content: global pendingSelector 클릭', { selector: _pendingClickSelector, tag: target?.tagName, byContains, byPath, byRect, matched });
    if (matched) {
      chrome.runtime.sendMessage({ type: 'SPOTLIGHT_TARGET_CLICKED' }).catch(() => {});
      _pendingClickSelector = null;
    }
  } catch (e) {
    console.warn('[vibe-guide] content: global pendingSelector 클릭 예외', e);
  }
}, true);

/** 셀렉터로 요소 찾아 wrapper로 감싸기 (스크롤해도 요소와 함께 움직임, wrapper 1개만 유지) */
function wrapElementBySelector(selector) {
  const el = document.querySelector(selector);
  console.log('[vibe-guide] content: wrapElementBySelector', { selector: selector?.slice(0, 60), found: !!el });
  if (!el) return { ok: false, error: chrome.i18n.getMessage('errorElementNotFound') };

  // 스포트라이트가 사라진 뒤에도 잠시 동안 같은 요소 클릭을 감지할 수 있도록 selector를 캐시
  _pendingClickSelector = selector;

  // 이미 같은 스포트라이트 wrapper 안에 있으면 추가로 감싸지 않고 스크롤만
  if (el.closest('#vibe-guide-spotlight-wrapper')) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return { ok: true };
  }

  // 연속 클릭 시 중복 wrapper 방지: 이미 다른 요소를 감싸는 중이면 스크롤만
  if (_spotlightWrapLock) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return { ok: true };
  }
  _spotlightWrapLock = true;

  // 기존 스포트라이트 전부 제거 (중복 wrapper 정리)
  while (document.getElementById('vibe-guide-spotlight-wrapper')) {
    unwrapSpotlight();
  }
  if (_spotlightCleanup) {
    _spotlightCleanup();
    _spotlightCleanup = null;
  }
  const existingOverlay = document.getElementById('vibe-guide-spotlight');
  if (existingOverlay) existingOverlay.remove();

  el.scrollIntoView({ behavior: 'smooth', block: 'center' });

  const wrapper = document.createElement('div');
  wrapper.id = 'vibe-guide-spotlight-wrapper';
  const display = window.getComputedStyle(el).display;
  wrapper.style.cssText = `display:${display};overflow:visible;pointer-events:none;position:relative;z-index:2147483646;border:3px solid #7c6ff7;border-radius:8px;box-shadow:0 0 0 9999px rgba(0,0,0,0.35);`;
  el.parentNode.insertBefore(wrapper, el);
  wrapper.appendChild(el);

  const clickHandler = (event) => {
    let elementToClick = null;
    try {
      const target = event?.target;
      if (wrapper && target) {
        const byContains = wrapper.contains(target);
        const byPath = event.composedPath && event.composedPath().includes(wrapper);
        const byRect = isClickInsideElement(event, wrapper);
        if (byContains || byPath || byRect) {
          chrome.runtime.sendMessage({ type: 'SPOTLIGHT_TARGET_CLICKED' }).catch(() => {});
          elementToClick = el;
        }
      }
    } catch (e) {
      console.warn('[vibe-guide] content: wrap 클릭 처리 예외', e);
    }
    document.removeEventListener('click', clickHandler, true);
    setTimeout(() => {
      removeSpotlight();
      if (elementToClick?.isConnected) elementToClick.click();
    }, 0);
  };
  document.addEventListener('click', clickHandler, true);
  return { ok: true };
}

/** 셀렉터로 요소 찾아 fixed overlay + scroll/resize 시마다 위치 갱신 (backendDOMNodeId → selector 경로용) */
function updateExplainPopupPositionForRect(rect) {
  if (!_spotlightExplainPopup) return;
  const margin = 8;
  const popup = _spotlightExplainPopup;
  const vw = window.innerWidth || document.documentElement.clientWidth || 0;
  const vh = window.innerHeight || document.documentElement.clientHeight || 0;

  let top = rect.bottom + margin;
  let left = rect.left + rect.width / 2;

  const popupRect = popup.getBoundingClientRect();
  const popupWidth = popupRect.width || 280;
  const popupHeight = popupRect.height || 80;

  let finalLeft = left - popupWidth / 2;
  if (finalLeft < 8) finalLeft = 8;
  if (finalLeft + popupWidth > vw - 8) finalLeft = Math.max(8, vw - popupWidth - 8);

  let finalTop = top;
  if (finalTop + popupHeight > vh - 8) {
    finalTop = rect.top - margin - popupHeight;
    if (finalTop < 8) finalTop = Math.max(8, rect.top + margin);
  }

  popup.style.left = `${finalLeft}px`;
  popup.style.top = `${finalTop}px`;
}

function createExplainPopup(explain, stepKey) {
  if (!explain) {
    removeExplainPopup();
    return null;
  }

  removeExplainPopup();

  const popupRoot = document.createElement('div');
  popupRoot.id = POPUP_ROOT_ID;
  popupRoot.style.cssText = `
    position: fixed;
    inset: 0;
    z-index: 2147483647;
    pointer-events: none;
    isolation: isolate;
  `;

  const popup = document.createElement('div');
  popup.id = 'vibe-guide-spotlight-popup';
  popup.style.cssText = `
    position: fixed;
    max-width: 320px;
    min-width: 220px;
    background: #ffffff;
    color: #111827;
    font-size: 12px;
    line-height: 1.5;
    border-radius: 10px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.35);
    padding: 8px 10px 10px;
    pointer-events: auto;
  `;

  const title = document.createElement('div');
  title.style.cssText = 'font-weight: 600; font-size: 11px; margin-bottom: 4px; color:#4b5563;';
  title.textContent = chrome.i18n?.getMessage('stepExplainTitle') || '이 버튼이 하는 일은 무엇인가요?';

  const textEl = document.createElement('div');
  textEl.style.cssText = 'font-size: 11px; color:#111827; white-space: pre-wrap;';
  textEl.textContent = explain;

  const actions = document.createElement('div');
  actions.style.cssText =
    'margin-top: 6px; display:flex; align-items:center; justify-content:flex-end; gap:6px; flex-wrap:wrap;';

  const askButton = document.createElement('button');
  askButton.type = 'button';
  askButton.textContent = '💬';
  askButton.setAttribute(
    'aria-label',
    chrome.i18n?.getMessage('stepExplainAsk') || '이 단계 더 물어보기',
  );
  askButton.style.cssText = `
    width: 22px;
    height: 22px;
    border-radius: 999px;
    border: 1px solid #e5e7eb;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    background: #f9fafb;
    color: #4f46e5;
    cursor: pointer;
    transition: background-color 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
  `;

  askButton.addEventListener('mouseenter', () => {
    askButton.style.backgroundColor = '#eef2ff';
    askButton.style.borderColor = '#c7d2fe';
    askButton.style.boxShadow = '0 1px 2px rgba(15,23,42,0.18)';
  });
  askButton.addEventListener('mouseleave', () => {
    askButton.style.backgroundColor = '#f9fafb';
    askButton.style.borderColor = '#e5e7eb';
    askButton.style.boxShadow = 'none';
  });

  const statusEl = document.createElement('div');
  statusEl.style.cssText = 'margin-top:4px; font-size:10px; color:#6b7280;';

  const qaContainer = document.createElement('div');
  qaContainer.style.cssText = 'margin-top:6px; display:none; flex-direction:column; gap:2px;';

  const inputWrap = document.createElement('div');
  inputWrap.style.cssText = 'position:relative; display:flex; align-items:flex-end;';

  const textarea = document.createElement('textarea');
  textarea.rows = 2;
  textarea.placeholder =
    chrome.i18n?.getMessage('stepExplainPlaceholder') || '이 단계에서 추가로 궁금한 점을 적어주세요.';
  textarea.style.cssText = `
    width: 100%;
    resize: none;
    border-radius: 8px;
    border: 1px solid #e5e7eb;
    padding: 6px 26px 6px 8px;
    font-size: 11px;
    box-sizing: border-box;
    line-height: 1.4;
    min-height: 24px;
    max-height: 96px;
    overflow-y: auto;
  `;
  inputWrap.appendChild(textarea);

  const sendButton = document.createElement('button');
  sendButton.type = 'button';
  sendButton.textContent = '➤';
  sendButton.setAttribute(
    'aria-label',
    chrome.i18n?.getMessage('stepExplainSend') || (chrome.i18n?.getMessage('chatSend') || '보내기'),
  );
  sendButton.style.cssText = `
    position: absolute;
    right: 4px;
    bottom: 4px;
    width: 18px;
    height: 18px;
    border-radius: 999px;
    border: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    background: #4f46e5;
    color: #ffffff;
    cursor: pointer;
    box-shadow: 0 1px 2px rgba(15,23,42,0.18);
    transition: background-color 0.15s ease, box-shadow 0.15s ease, transform 0.1s ease;
  `;
  inputWrap.appendChild(sendButton);

  sendButton.addEventListener('mouseenter', () => {
    sendButton.style.backgroundColor = '#4338ca';
    sendButton.style.boxShadow = '0 2px 6px rgba(15,23,42,0.22)';
  });
  sendButton.addEventListener('mouseleave', () => {
    sendButton.style.backgroundColor = '#4f46e5';
    sendButton.style.boxShadow = '0 1px 2px rgba(15,23,42,0.18)';
    sendButton.style.transform = 'translateY(0)';
  });
  sendButton.addEventListener('mousedown', () => {
    sendButton.style.transform = 'translateY(1px)';
  });
  sendButton.addEventListener('mouseup', () => {
    sendButton.style.transform = 'translateY(0)';
  });

  const historyContainer = document.createElement('div');
  historyContainer.style.cssText = 'margin-top:6px; max-height:140px; overflow-y:auto;';

  /** 채팅 탭과 동일: 줄바꿈 + **...** 볼드. DOM 노드만 사용해 XSS 방지. */
  function formatMessageText(text) {
    const fragment = document.createDocumentFragment();
    const safe = String(text ?? '')
      .replace(/\r\n/g, '\n')
      .replace(/<br\s*\/?>/gi, '\n');
    const lines = safe.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (i > 0) fragment.appendChild(document.createElement('br'));
      const line = lines[i];
      const re = /\*\*(.+?)\*\*/g;
      let lastEnd = 0;
      let match;
      while ((match = re.exec(line)) !== null) {
        if (match.index > lastEnd) {
          fragment.appendChild(document.createTextNode(line.slice(lastEnd, match.index)));
        }
        const strong = document.createElement('strong');
        strong.textContent = match[1];
        fragment.appendChild(strong);
        lastEnd = re.lastIndex;
      }
      if (lastEnd < line.length) {
        fragment.appendChild(document.createTextNode(line.slice(lastEnd)));
      }
    }
    return fragment;
  }

  function renderHistory() {
    historyContainer.innerHTML = '';
    const history = getStepHistory(stepKey);
    if (!history.length) return;
    history.forEach((m) => {
      const row = document.createElement('div');
      row.style.cssText =
        'font-size:10px; margin-bottom:6px; padding:4px 6px; border-radius:6px; background:#f9fafb; display:flex; align-items:flex-start; gap:6px;';
      const icon = document.createElement('span');
      icon.style.cssText = 'font-size:14px; line-height:1; flex-shrink:0;';
      icon.textContent = m.role === 'assistant' ? '🤖' : '👤';
      icon.setAttribute('aria-hidden', 'true');
      const body = document.createElement('div');
      body.style.cssText = 'flex:1; min-width:0; word-break:break-word; line-height:1.4;';
      body.appendChild(formatMessageText(m.text || ''));
      row.appendChild(icon);
      row.appendChild(body);
      historyContainer.appendChild(row);
    });
  }

  function sendQuestion() {
    const question = (textarea.value || '').trim();
    if (!question || _spotlightExplainLoading) return;
    const key = stepKey || 'default';
    const history = getStepHistory(key).slice();
    history.push({ role: 'user', text: question });
    _stepExplainHistoryByKey[key] = history;

    _spotlightExplainLoading = true;
    sendButton.disabled = true;
    textarea.disabled = true;
    statusEl.textContent =
      chrome.i18n?.getMessage('stepExplainLoading') || '이 단계를 설명하는 중이에요…';

    chrome.runtime.sendMessage(
      {
        type: 'GET_PAGE_CHAT_ANSWER',
        history,
        userMessage: question,
        explainFollowUp: true,
      },
      (res) => {
        _spotlightExplainLoading = false;
        sendButton.disabled = false;
        textarea.disabled = false;

        if (!res || res.error) {
          statusEl.textContent =
            res?.error ||
            chrome.i18n?.getMessage('chatErrorLoad') ||
            '답변을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.';
          return;
        }

        const answer = (res.text || '').trim();
        if (!answer) {
          statusEl.textContent =
            chrome.i18n?.getMessage('chatErrorEmpty') ||
            '빈 응답을 받았어요. 잠시 후 다시 시도해 주세요.';
          return;
        }

        const finalKey = key;
        const current = getStepHistory(finalKey).slice();
        current.push({ role: 'assistant', text: answer });
        _stepExplainHistoryByKey[finalKey] = current;
        textarea.value = '';
        statusEl.textContent = '';
        renderHistory();
      },
    );
  }

  askButton.addEventListener('click', (e) => {
    e.preventDefault();
    if (qaContainer.style.display === 'none') {
      qaContainer.style.display = 'flex';
      textarea.focus();
    } else {
      qaContainer.style.display = 'none';
    }
  });

  sendButton.addEventListener('click', (e) => {
    e.preventDefault();
    sendQuestion();
  });

  textarea.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
      e.preventDefault();
      sendQuestion();
    }
  });

  function autoResizeTextarea() {
    textarea.style.height = 'auto';
    const maxHeight = 96;
    const newHeight = Math.min(maxHeight, textarea.scrollHeight || 0);
    if (newHeight) textarea.style.height = `${newHeight}px`;
  }
  textarea.addEventListener('input', autoResizeTextarea);
  autoResizeTextarea();

  qaContainer.appendChild(inputWrap);
  qaContainer.appendChild(statusEl);
  qaContainer.appendChild(historyContainer);

  actions.appendChild(askButton);

  popup.appendChild(title);
  popup.appendChild(textEl);
  popup.appendChild(actions);
  popup.appendChild(qaContainer);

  _spotlightExplainPopup = popup;
  _spotlightExplainState = { stepKey: stepKey || 'default', explain };

  renderHistory();
  popupRoot.appendChild(popup);
  document.body.appendChild(popupRoot);

  return popup;
}

function spotlightBySelector(selector, explain, stepKey) {
  const el = document.querySelector(selector);
  if (!el) return { ok: false, error: chrome.i18n.getMessage('errorElementNotFound') };

  removeSpotlight();

  // backendDOMNodeId → selector 경로에서도 동일하게 selector를 캐시
  _pendingClickSelector = selector;

  const overlay = document.createElement('div');
  overlay.id = 'vibe-guide-spotlight';
  const popup = createExplainPopup(explain, stepKey);
  const updateOverlay = () => {
    const rect = el.getBoundingClientRect();
    overlay.style.position = 'fixed';
    overlay.style.left = rect.left + 'px';
    overlay.style.top = rect.top + 'px';
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';
    if (popup) {
      updateExplainPopupPositionForRect(rect);
    }
  };
  updateOverlay();
  overlay.style.cssText += `
    box-sizing: border-box;
    border: 3px solid #7c6ff7;
    border-radius: 8px;
    pointer-events: none;
    z-index: 2147483646;
    box-shadow: 0 0 0 9999px rgba(0,0,0,0.35);
  `;
  document.body.appendChild(overlay);

  const clickHandler = (event) => {
    let elementToClick = null;
    try {
      const target = event?.target;
      if (_spotlightExplainPopup && target && (_spotlightExplainPopup.contains(target) || (event.composedPath && event.composedPath().includes(_spotlightExplainPopup)))) return;
      if (el && target) {
        const byContains = el.contains(target);
        const byPath = event.composedPath && event.composedPath().includes(el);
        const byRect = isClickInsideElement(event, el);
        if (byContains || byPath || byRect) {
          chrome.runtime.sendMessage({ type: 'SPOTLIGHT_TARGET_CLICKED' }).catch(() => {});
          elementToClick = el;
        }
      }
    } catch (e) {
      console.warn('[vibe-guide] content: overlay 클릭 처리 예외', e);
    }
    document.removeEventListener('click', clickHandler, true);
    setTimeout(() => {
      removeSpotlight();
      if (elementToClick?.isConnected) elementToClick.click();
    }, 0);
  };
  document.addEventListener('click', clickHandler, true);

  window.addEventListener('scroll', updateOverlay, true);
  window.addEventListener('resize', updateOverlay);
  _spotlightCleanup = () => {
    window.removeEventListener('scroll', updateOverlay, true);
    window.removeEventListener('resize', updateOverlay);
    if (el && el.getAttribute('data-vibe-spotlight-id')) el.removeAttribute('data-vibe-spotlight-id');
    _spotlightCleanup = null;
  };

  return { ok: true };
}

/** 뷰포트 좌표(rect)로 하이라이트 — DOM 흐름에 넣어 스크롤 시 박스가 문서와 함께 움직임 */
function spotlightByRect(rect) {
  removeSpotlight();
  const docX = rect.left + window.scrollX;
  const docY = rect.top + window.scrollY;
  const wrapper = document.createElement('div');
  wrapper.id = 'vibe-guide-spotlight';
  wrapper.style.cssText = `
    position: relative;
    left: 0;
    top: 0;
    width: 0;
    height: 0;
    overflow: visible;
    pointer-events: none;
    z-index: 2147483646;
  `;
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: absolute;
    width: ${rect.width}px;
    height: ${rect.height}px;
    box-sizing: border-box;
    border: 3px solid #7c6ff7;
    border-radius: 8px;
    pointer-events: none;
    box-shadow: 0 0 0 9999px rgba(0,0,0,0.35);
    transition: box-shadow 0.2s;
  `;
  wrapper.appendChild(overlay);
  document.body.insertBefore(wrapper, document.body.firstChild);
  // body margin 등으로 wrapper가 문서 (0,0)이 아닐 수 있으므로 보정
  const wr = wrapper.getBoundingClientRect();
  const wrapDocX = wr.left + window.scrollX;
  const wrapDocY = wr.top + window.scrollY;
  overlay.style.left = `${docX - wrapDocX}px`;
  overlay.style.top = `${docY - wrapDocY}px`;

  const clickHandler = () => {
    document.removeEventListener('click', clickHandler, true);
    setTimeout(() => removeSpotlight(), 0);
  };
  document.addEventListener('click', clickHandler, true);
  return { ok: true };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'GET_PAGE_HTML') {
    sendResponse({ html: getPageHtml(), url: location.href });
    return true;
  }
  if (msg.type === 'SPOTLIGHT_ELEMENT' && msg.selector) {
    console.log('[vibe-guide] 스포트라이트: selector 분기 (Content에서 fixed overlay)', msg.selector.slice(0, 60));
    const result = spotlightBySelector(msg.selector, msg.explain, msg.stepKey);
    sendResponse(result);
    return true;
  }
  if (msg.type === 'SPOTLIGHT_BY_RECT' && msg.rect) {
    const result = spotlightByRect(msg.rect);
    sendResponse(result);
    return true;
  }
  if (msg.type === 'SPOTLIGHT_BY_SELECTOR' && msg.selector) {
    const result = spotlightBySelector(msg.selector);
    sendResponse(result);
    return true;
  }
  if (msg.type === 'SPOTLIGHT_WRAP_DONE') {
    console.log('[vibe-guide] content: SPOTLIGHT_WRAP_DONE (CDP wrap 완료, 클릭 리스너 등록)');
    if (_spotlightTimeoutId != null) {
      clearTimeout(_spotlightTimeoutId);
      _spotlightTimeoutId = null;
    }
    const wrapper = document.getElementById('vibe-guide-spotlight-wrapper');
    if (wrapper) {
      wrapper.style.boxShadow = 'none';
      const dimOverlay = document.createElement('div');
      dimOverlay.id = 'vibe-guide-spotlight-dim-overlay';
      dimOverlay.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483645;';
      const hole = document.createElement('div');
      hole.style.boxShadow = '0 0 0 9999px rgba(0,0,0,0.35)';
      const updateDimOverlay = () => {
        const w = document.getElementById('vibe-guide-spotlight-wrapper');
        if (!w) return;
        const r = w.getBoundingClientRect();
        hole.style.position = 'absolute';
        hole.style.left = r.left + 'px';
        hole.style.top = r.top + 'px';
        hole.style.width = r.width + 'px';
        hole.style.height = r.height + 'px';
      };
      updateDimOverlay();
      dimOverlay.appendChild(hole);
      document.body.appendChild(dimOverlay);
      window.addEventListener('scroll', updateDimOverlay, true);
      window.addEventListener('resize', updateDimOverlay);
      const prevCleanup = _spotlightCleanup;
      _spotlightCleanup = () => {
        window.removeEventListener('scroll', updateDimOverlay, true);
        window.removeEventListener('resize', updateDimOverlay);
        dimOverlay.remove();
        _spotlightCleanup = prevCleanup || null;
      };
    }
    const clickHandler = (event) => {
      let elementToClick = null;
      try {
        const wrapperEl = document.getElementById('vibe-guide-spotlight-wrapper');
        const target = event?.target;
        if (_spotlightExplainPopup && target && (_spotlightExplainPopup.contains(target) || (event.composedPath && event.composedPath().includes(_spotlightExplainPopup)))) return;
        if (wrapperEl && target) {
          const byContains = wrapperEl.contains(target);
          const byPath = event.composedPath && event.composedPath().includes(wrapperEl);
          const byRect = isClickInsideElement(event, wrapperEl);
          if (byContains || byPath || byRect) {
            chrome.runtime.sendMessage({ type: 'SPOTLIGHT_TARGET_CLICKED' }).catch(() => {});
            elementToClick = wrapperEl.firstElementChild;
          }
        }
      } catch (e) {
        console.warn('[vibe-guide] content: SPOTLIGHT_WRAP_DONE 클릭 예외', e);
      }
      document.removeEventListener('click', clickHandler, true);
      setTimeout(() => {
        removeSpotlight();
        if (elementToClick?.isConnected) elementToClick.click();
      }, 0);
    };
    document.addEventListener('click', clickHandler, true);

    // backendDOMNodeId 기반 CDP wrap의 경우에도, 스포트라이트가 꺼진 뒤
    // 같은 요소 클릭을 감지할 수 있도록 data-attribute 기반 selector를 캐시
    try {
      const wrapperForCache = document.getElementById('vibe-guide-spotlight-wrapper');
      const targetEl = wrapperForCache?.firstElementChild;
      const backendId = msg.backendDOMNodeId;
      if (targetEl && backendId != null) {
        const idStr = String(backendId);
        targetEl.setAttribute('data-vibe-spotlight-target', idStr);
        _pendingClickSelector = `[data-vibe-spotlight-target="${idStr}"]`;
        if (msg.explain) {
          createExplainPopup(msg.explain, msg.stepKey);
          const rect = targetEl.getBoundingClientRect();
          updateExplainPopupPositionForRect(rect);
        }
      }
    } catch (e) {
      console.warn('[vibe-guide] content: SPOTLIGHT_WRAP_DONE target 캐시 실패', e);
    }
    sendResponse({ ok: true });
    return true;
  }
  if (msg.type === 'REMOVE_SPOTLIGHT') {
    removeSpotlight();
    sendResponse({ ok: true });
    return true;
  }
});

// popstate (뒤로가기/앞으로가기)
window.addEventListener('popstate', reportUrl);

// pushState / replaceState 인터셉트
const originalPushState = history.pushState.bind(history);
const originalReplaceState = history.replaceState.bind(history);

history.pushState = function (...args) {
  originalPushState(...args);
  reportUrl();
};
history.replaceState = function (...args) {
  originalReplaceState(...args);
  reportUrl();
};
