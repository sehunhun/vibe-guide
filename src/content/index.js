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

// 활성 단계 감시를 위한 변수
let activeStepWatcher = null;
let currentActiveStep = null;

/** 활성 단계 감시 시작 */
function startWatchingActiveStep(activeStep) {
  // 기존 감시 중지
  stopWatchingActiveStep();
  
  if (!activeStep || !activeStep.selector) return;
  
  currentActiveStep = activeStep;
  const element = document.querySelector(activeStep.selector);
  if (!element) return;
  
  // 요소가 DOM에 나타날 때까지 대기
  const observer = new MutationObserver(() => {
    const el = document.querySelector(activeStep.selector);
    if (el && !activeStepWatcher) {
      setupWatcher(el, activeStep);
    }
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
  
  // 즉시 확인
  if (element) {
    setupWatcher(element, activeStep);
  }
  
  activeStepWatcher = observer;
}

/** 감시 중지 */
function stopWatchingActiveStep() {
  if (activeStepWatcher) {
    activeStepWatcher.disconnect();
    activeStepWatcher = null;
  }
  currentActiveStep = null;
}

/** 요소에 대한 액션 감지 설정 */
function setupWatcher(element, activeStep) {
  // 이미 감시 중이면 중복 방지
  if (element.dataset.vibeGuideWatched === 'true') return;
  element.dataset.vibeGuideWatched = 'true';
  
  // 클릭 감지
  const clickHandler = (e) => {
    // 같은 탭이고 같은 URL인지 확인
    if (activeStep.url === location.href) {
      chrome.runtime.sendMessage({
        type: 'STEP_ACTION_DETECTED',
        sourceUrl: activeStep.sourceUrl,
        sourceIndex: activeStep.sourceIndex,
        action: 'click',
        url: location.href, // 현재 페이지 URL 포함
      }).catch(() => {});
    }
  };
  
  // 입력 감지 (input, textarea, select 등)
  const inputHandler = (e) => {
    if (activeStep.url === location.href && e.target.value) {
      chrome.runtime.sendMessage({
        type: 'STEP_ACTION_DETECTED',
        sourceUrl: activeStep.sourceUrl,
        sourceIndex: activeStep.sourceIndex,
        action: 'input',
        url: location.href, // 현재 페이지 URL 포함
      }).catch(() => {});
    }
  };
  
  // 변경 감지 (체크박스, 라디오 등)
  const changeHandler = (e) => {
    if (activeStep.url === location.href) {
      chrome.runtime.sendMessage({
        type: 'STEP_ACTION_DETECTED',
        sourceUrl: activeStep.sourceUrl,
        sourceIndex: activeStep.sourceIndex,
        action: 'change',
        url: location.href, // 현재 페이지 URL 포함
      }).catch(() => {});
    }
  };
  
  // 이벤트 리스너 추가
  element.addEventListener('click', clickHandler, true);
  element.addEventListener('input', inputHandler, true);
  element.addEventListener('change', changeHandler, true);
  
  // 요소가 제거되면 리스너도 제거
  const removeObserver = new MutationObserver((mutations) => {
    if (!document.contains(element)) {
      element.removeEventListener('click', clickHandler, true);
      element.removeEventListener('input', inputHandler, true);
      element.removeEventListener('change', changeHandler, true);
      removeObserver.disconnect();
      delete element.dataset.vibeGuideWatched;
    }
  });
  removeObserver.observe(document.body, { childList: true, subtree: true });
}

// Storage 변경 감지하여 활성 단계 업데이트
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.activeStepForAutoComplete) {
    const newValue = changes.activeStepForAutoComplete.newValue;
    if (newValue && newValue.url === location.href) {
      startWatchingActiveStep(newValue);
    } else {
      stopWatchingActiveStep();
    }
  }
});

// 페이지 로드 시 활성 단계 확인
chrome.storage.local.get('activeStepForAutoComplete', (result) => {
  const activeStep = result.activeStepForAutoComplete;
  if (activeStep && activeStep.url === location.href) {
    startWatchingActiveStep(activeStep);
  }
});

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
