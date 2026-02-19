/**
 * Content Script - 모든 페이지에서 실행
 *
 * background가 tabs.onActivated / onUpdated로 URL을 감지하므로
 * content script는 별도 처리 없이도 동작한다.
 * 단, SPA처럼 pushState로 URL이 바뀌는 경우를 대비해
 * history 변경도 감지해서 background에 알린다.
 */

function reportUrl() {
  chrome.runtime.sendMessage({
    type: 'URL_CHANGED',
    url: location.href,
    hostname: location.hostname,
  }).catch(() => {});
}

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
