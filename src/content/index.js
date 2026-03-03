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

/** 스포트라이트 제거 */
function removeSpotlight() {
  if (_spotlightCleanup) {
    _spotlightCleanup();
    _spotlightCleanup = null;
  }
  if (unwrapSpotlight()) return true;
  const id = 'vibe-guide-spotlight';
  const el = document.getElementById(id);
  if (el) {
    el.remove();
    return true;
  }
  return false;
}

/** 셀렉터로 요소 찾아 wrapper로 감싸기 (vibe-guide-spotlight div 생성 없음) */
function wrapElementBySelector(selector) {
  const el = document.querySelector(selector);
  if (!el) return { ok: false, error: '요소를 찾을 수 없습니다.' };

  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  removeSpotlight();

  const wrapper = document.createElement('div');
  wrapper.id = 'vibe-guide-spotlight-wrapper';
  const display = window.getComputedStyle(el).display;
  wrapper.style.cssText = `display:${display};overflow:visible;pointer-events:none;position:relative;z-index:2147483646;border:3px solid #7c6ff7;border-radius:8px;box-shadow:0 0 0 9999px rgba(0,0,0,0.35);`;
  el.parentNode.insertBefore(wrapper, el);
  wrapper.appendChild(el);

  const clickHandler = () => {
    removeSpotlight();
    document.removeEventListener('click', clickHandler, true);
  };
  document.addEventListener('click', clickHandler, true);
  setTimeout(() => {
    removeSpotlight();
    document.removeEventListener('click', clickHandler, true);
  }, 4000);
  return { ok: true };
}

/** 셀렉터로 요소 찾아 fixed overlay + scroll/resize 시마다 위치 갱신 (backendDOMNodeId → selector 경로용) */
function spotlightBySelector(selector) {
  const el = document.querySelector(selector);
  if (!el) return { ok: false, error: '요소를 찾을 수 없습니다.' };

  removeSpotlight();

  const overlay = document.createElement('div');
  overlay.id = 'vibe-guide-spotlight';
  const updateOverlay = () => {
    const rect = el.getBoundingClientRect();
    overlay.style.position = 'fixed';
    overlay.style.left = rect.left + 'px';
    overlay.style.top = rect.top + 'px';
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';
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

  window.addEventListener('scroll', updateOverlay, true);
  window.addEventListener('resize', updateOverlay);
  _spotlightCleanup = () => {
    window.removeEventListener('scroll', updateOverlay, true);
    window.removeEventListener('resize', updateOverlay);
    if (el && el.getAttribute('data-vibe-spotlight-id')) el.removeAttribute('data-vibe-spotlight-id');
    _spotlightCleanup = null;
  };

  const clickHandler = () => {
    removeSpotlight();
    document.removeEventListener('click', clickHandler, true);
  };
  document.addEventListener('click', clickHandler, true);
  setTimeout(() => {
    removeSpotlight();
    document.removeEventListener('click', clickHandler, true);
  }, 4000);
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
    removeSpotlight();
    document.removeEventListener('click', clickHandler, true);
  };
  document.addEventListener('click', clickHandler, true);
  setTimeout(() => {
    removeSpotlight();
    document.removeEventListener('click', clickHandler, true);
  }, 4000);
  return { ok: true };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'GET_PAGE_HTML') {
    sendResponse({ html: getPageHtml(), url: location.href });
    return true;
  }
  if (msg.type === 'SPOTLIGHT_ELEMENT' && msg.selector) {
    console.log('[vibe-guide] 스포트라이트: selector 분기 (Content에서 wrap)', msg.selector.slice(0, 60));
    const result = wrapElementBySelector(msg.selector);
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
    console.log('[vibe-guide] 스포트라이트: backendDOMNodeId 분기 (CDP에서 이미 wrap됨, 해제만 등록)');
    const clickHandler = () => {
      removeSpotlight();
      document.removeEventListener('click', clickHandler, true);
    };
    document.addEventListener('click', clickHandler, true);
    setTimeout(() => {
      removeSpotlight();
      document.removeEventListener('click', clickHandler, true);
    }, 4000);
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
