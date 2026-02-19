/**
 * Background Service Worker
 *
 * - 아이콘 클릭 → plan 없으면 survey.html 전체화면 탭, 있으면 사이드패널(Step2) 열기
 * - 탭 URL 변경 시 사이드패널에 TAB_CHANGED 메시지 전달 (chrome.runtime.sendMessage)
 */

const SURVEY_URL = chrome.runtime.getURL('survey.html');

// 아이콘 클릭: plan 없으면 설문 탭(전체화면), 있으면 사이드패널 열기
chrome.action.onClicked.addListener(async () => {
  const { plan } = await chrome.storage.local.get('plan');
  if (plan) {
    const win = await chrome.windows.getLastFocused();
    if (win?.id) {
      await chrome.sidePanel.open({ windowId: win.id });
    }
  } else {
    await openOrFocusSurveyTab();
  }
});

/** 설문 탭이 이미 있으면 포커스, 없으면 새 탭으로 열기 */
async function openOrFocusSurveyTab() {
  const tabs = await chrome.tabs.query({});
  const existing = tabs.find(t => t.url && t.url.startsWith(SURVEY_URL));
  if (existing) {
    await chrome.tabs.update(existing.id, { active: true });
    await chrome.windows.update(existing.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url: SURVEY_URL });
  }
}

/** 탭 변경 이벤트 → 사이드패널 등 확장 페이지에 브로드캐스트 */
async function notifyTabChange(tabId, url) {
  if (!url || url.startsWith('chrome://') || url.startsWith('chrome-extension://')) return;

  let hostname;
  try { hostname = new URL(url).hostname; } catch { return; }

  chrome.runtime.sendMessage({
    type: 'TAB_CHANGED',
    tabId,
    url,
    hostname,
  }).catch(() => {}); // 수신자가 없을 수 있음 (사이드패널 미오픈 등)
}

// Content script → background: SPA URL 변경 처리
chrome.runtime.onMessage.addListener(async (msg, sender) => {
  if (msg.type === 'URL_CHANGED' && sender.tab?.id) {
    notifyTabChange(sender.tab.id, msg.url);
  }
  if (msg.type === 'OPEN_SURVEY_TAB') {
    openOrFocusSurveyTab();
  }
  if (msg.type === 'OPEN_SIDE_PANEL') {
    const windowId = sender.tab?.windowId ?? (await chrome.windows.getLastFocused())?.id;
    if (windowId) chrome.sidePanel.open({ windowId });
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
