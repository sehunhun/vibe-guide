/**
 * Content Script - 모든 페이지에서 실행
 *
 * - URL 변경 감지 → background에 알림
 * - GET_PAGE_HTML: 페이지 HTML 수집 (간소화)
 * - SPOTLIGHT_ELEMENT: 지정 선택자 요소로 스크롤 + 하이라이트
 */

const MAX_HTML_LEN = 35000;

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

/** 스포트라이트 제거 */
function removeSpotlight() {
  const id = 'vibe-guide-spotlight';
  const overlay = document.getElementById(id);
  if (overlay) {
    overlay.remove();
    return true;
  }
  return false;
}

/** 요소에 스포트라이트(하이라이트) 오버레이 후 스크롤 */
function spotlightElement(selector) {
  const el = document.querySelector(selector);
  if (!el) return { ok: false, error: '요소를 찾을 수 없습니다.' };

  el.scrollIntoView({ behavior: 'smooth', block: 'center' });

  const id = 'vibe-guide-spotlight';
  removeSpotlight();

  const rect = el.getBoundingClientRect();
  const overlay = document.createElement('div');
  overlay.id = id;
  overlay.style.cssText = `
    position: fixed;
    left: ${rect.left}px;
    top: ${rect.top}px;
    width: ${rect.width}px;
    height: ${rect.height}px;
    box-sizing: border-box;
    border: 3px solid #7c6ff7;
    border-radius: 8px;
    pointer-events: none;
    z-index: 2147483646;
    box-shadow: 0 0 0 9999px rgba(0,0,0,0.35);
    transition: box-shadow 0.2s;
  `;
  document.body.appendChild(overlay);

  // click 이벤트 리스너 추가 (한 번만 실행)
  const clickHandler = (e) => {
    removeSpotlight();
    document.removeEventListener('click', clickHandler, true);
  };
  document.addEventListener('click', clickHandler, true);

  setTimeout(() => {
    overlay.remove();
    document.removeEventListener('click', clickHandler, true);
  }, 4000);
  return { ok: true };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'GET_PAGE_HTML') {
    sendResponse({ html: getPageHtml(), url: location.href });
    return true;
  }
  if (msg.type === 'SPOTLIGHT_ELEMENT') {
    const result = spotlightElement(msg.selector);
    sendResponse(result);
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
