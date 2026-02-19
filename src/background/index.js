/**
 * Background Service Worker
 *
 * - 아이콘 클릭 → survey.html 또는 guide.html 탭을 열거나 포커스
 * - 모든 탭의 URL 변경을 감지 → guide.html 탭에 TAB_CHANGED 메시지 전달
 */

const SURVEY_URL = chrome.runtime.getURL('survey.html');
const GUIDE_URL  = chrome.runtime.getURL('guide.html');

// 아이콘 클릭: 저장된 plan 있으면 guide.html, 없으면 survey.html
chrome.action.onClicked.addListener(async () => {
  const { plan } = await chrome.storage.local.get('plan');
  const targetUrl = plan ? GUIDE_URL : SURVEY_URL;
  await openOrFocusTab(targetUrl);
});

/** 이미 열려있는 탭이면 포커스, 없으면 새 탭 생성 */
async function openOrFocusTab(url) {
  const tabs = await chrome.tabs.query({});
  const existing = tabs.find(t => t.url && t.url.startsWith(url));
  if (existing) {
    await chrome.tabs.update(existing.id, { active: true });
    await chrome.windows.update(existing.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url });
  }
}

/** guide.html 탭 ID를 찾아 반환 */
async function findGuideTabId() {
  const tabs = await chrome.tabs.query({});
  const guide = tabs.find(t => t.url && t.url.startsWith(GUIDE_URL));
  return guide?.id || null;
}

/** 탭 변경 이벤트 → guide.html 탭에 메시지 전달 */
async function notifyTabChange(tabId, url) {
  // chrome-extension:// URL은 무시
  if (!url || url.startsWith('chrome://') || url.startsWith('chrome-extension://')) return;

  let hostname;
  try { hostname = new URL(url).hostname; } catch { return; }

  const guideTabId = await findGuideTabId();
  if (!guideTabId) return;

  // guide.html 탭 자신의 변경은 무시
  if (tabId === guideTabId) return;

  chrome.tabs.sendMessage(guideTabId, {
    type: 'TAB_CHANGED',
    tabId,
    url,
    hostname,
  }).catch(() => {}); // guide 탭이 아직 로드 안 됐을 수 있음
}

// Content script → background: SPA URL 변경 처리
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === 'URL_CHANGED' && sender.tab?.id) {
    notifyTabChange(sender.tab.id, msg.url);
  }
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError) return;
    if (tab?.url) notifyTabChange(tabId, tab.url);
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    notifyTabChange(tabId, tab.url);
  }
});
