/**
 * Background Service Worker
 *
 * - 아이콘 클릭 → plan 없으면 survey.html 전체화면 탭, 있으면 사이드패널(Step2) 열기
 * - 탭 URL 변경 시 사이드패널에 TAB_CHANGED 메시지 전달
 * - GET_PAGE_GUIDANCE: 현재 탭 접근성 트리(slim) 또는 fallback HTML/이미지 → AI 안내
 * - SPOTLIGHT: selector( content script ) 또는 backendDOMNodeId( CDP DOM.highlightNode )
 */

import { getPageGuidance, getPageChatAnswer, getUILocale } from '../data/ai.js';
import { filterAndSlim } from '../data/axtree.js';

const DEBUGGER_VERSION = '1.3';

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

/** URL에서 도메인 추출 */
function getDomainFromUrl(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** 같은 도메인인지 확인 */
function isSameDomain(url1, url2) {
  const domain1 = getDomainFromUrl(url1);
  const domain2 = getDomainFromUrl(url2);
  if (!domain1 || !domain2) return false;
  return domain1 === domain2;
}

/** 현재 탭에서 CDP로 접근성 트리 수집 → filter + slim (스포트라이트용 backendDOMNodeId 유효) */
async function getAxtreeSlim(tabId) {
  const tab = await chrome.tabs.get(tabId);
  if (!tab?.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
    throw new Error(chrome.i18n.getMessage('errorNoPage'));
  }
  return new Promise((resolve, reject) => {
    const detach = () => chrome.debugger.detach({ tabId }, () => {});

    chrome.debugger.attach({ tabId }, DEBUGGER_VERSION, (err) => {
      if (err) {
        reject(new Error(chrome.i18n.getMessage('errorDebugger')));
        return;
      }
      // CDP: chrome.debugger.sendCommand 콜백은 성공 시 (result) 한 개만 인자로 받음. 에러는 chrome.runtime.lastError.
      chrome.debugger.sendCommand({ tabId }, 'Accessibility.enable', {}, () => {
        if (chrome.runtime.lastError) {
          console.warn('[vibe-guide] Accessibility.enable 실패 (무시하고 진행):', chrome.runtime.lastError?.message);
        }
        chrome.debugger.sendCommand({ tabId }, 'Accessibility.getFullAXTree', {}, (result) => {
          if (chrome.runtime.lastError) {
            console.error('[vibe-guide] Accessibility.getFullAXTree 실패:', chrome.runtime.lastError?.message);
            detach();
            reject(new Error(chrome.runtime.lastError.message || chrome.i18n.getMessage('errorAxtree')));
            return;
          }
          const nodes = result?.nodes ?? [];
          const slim = filterAndSlim(nodes);
          console.log('[vibe-guide] 접근성 트리 수집 완료', { tabId, url: tab.url, totalNodes: nodes.length, slimCount: slim.length });
          detach();
          resolve({ type: 'axtree', nodes: slim, url: tab.url });
        });
      });
    });
  });
}

/** 현재 탭에서 HTML 또는 스크린샷 수집 (axtree 실패 시 fallback) */
async function getPageContext(tabId) {
  try {
    const res = await chrome.tabs.sendMessage(tabId, { type: 'GET_PAGE_HTML' });
    if (res?.html != null) {
      return { type: 'html', content: res.html, url: res.url };
    }
  } catch (_) {
    // content script 미주입(확장 페이지 등) 또는 권한 오류
  }

  // fallback: 스크린샷 (해당 탭을 활성화한 뒤 캡처)
  const tab = await chrome.tabs.get(tabId);
  if (!tab?.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
    throw new Error(chrome.i18n.getMessage('errorNoPage'));
  }
  const prevActive = await chrome.tabs.query({ active: true, windowId: tab.windowId }).then(tabs => tabs[0]?.id);
  await chrome.tabs.update(tabId, { active: true });
  let dataUrl;
  try {
    dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
  } finally {
    if (prevActive && prevActive !== tabId) {
      chrome.tabs.update(prevActive, { active: true }).catch(() => {});
    }
  }
  return { type: 'image', content: dataUrl, url: tab.url };
}

// Content script / Sidepanel → background
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'GET_PAGE_GUIDANCE') {
    (async () => {
      try {
        const { tabId } = msg;
        const storage = await chrome.storage.local.get(['plan', 'answers', 'pageGuidanceCache', 'pageStepCompletions', 'webSearchContextByDomain']);
        const plan = storage.plan || null;
        const answers = storage.answers || null;
        if (!plan) {
          return { error: chrome.i18n.getMessage('errorNoPlan') };
        }
        const tab = await chrome.tabs.get(tabId);
        const currentUrlFromTab = tab?.url || '';
        let pageContext;
        try {
          pageContext = await getAxtreeSlim(tabId);
          console.log('[vibe-guide] GET_PAGE_GUIDANCE: axtree 사용 → 단계에 backendDOMNodeId 포함됨');
        } catch (e) {
          const msg = e?.message ?? String(e);
          const stack = e?.stack ? `\n${e.stack}` : '';
          console.warn('[vibe-guide] GET_PAGE_GUIDANCE: axtree 실패 → HTML/이미지 폴백 (단계에 selector만 포함됨). 사유:', msg, stack);
          pageContext = await getPageContext(tabId);
        }
        const cache = storage.pageGuidanceCache || {};
        const completions = storage.pageStepCompletions || {};
        const url = pageContext.url || currentUrlFromTab || '';

        const currentDomain = getDomainFromUrl(url);
        const allPreviousSteps = [];
        const allCompleted = [];

        if (currentDomain) {
          for (const [cachedUrl, guidance] of Object.entries(cache)) {
            if (guidance?.steps?.length && isSameDomain(cachedUrl, url)) {
              const urlCompletions = completions[cachedUrl] || [];
              guidance.steps.forEach((step, idx) => {
                allPreviousSteps.push(step);
                allCompleted.push(urlCompletions[idx] === true);
              });
            }
          }
        } else {
          if (cache[url]?.steps?.length) {
            allPreviousSteps.push(...cache[url].steps);
            const urlCompletions = completions[url] || [];
            cache[url].steps.forEach((_, idx) => {
              allCompleted.push(urlCompletions[idx] === true);
            });
          }
        }

        const previousStepsForUrl = allPreviousSteps.length > 0
          ? { steps: allPreviousSteps, completed: allCompleted }
          : undefined;

        // 해당 도메인에 저장된 단계가 없으면 no_steps_for_domain; 이전 웹 검색 결과는 도메인별로 저장된 값 전달
        const noStepsForDomain = !!currentDomain && allPreviousSteps.length === 0;
        const previousWebSearchResult = (storage.webSearchContextByDomain && currentDomain && storage.webSearchContextByDomain[currentDomain]) || '';

        const locale = getUILocale();
        const result = await getPageGuidance(
          {
            plan,
            answers,
            previousStepsForUrl,
            noStepsForDomain,
            previousWebSearchResult,
          },
          { type: pageContext.type, content: pageContext.content, nodes: pageContext.nodes },
          pageContext.url,
          locale,
        );
        if (currentDomain && result.web_search_context) {
          const byDomain = storage.webSearchContextByDomain || {};
          byDomain[currentDomain] = result.web_search_context;
          await chrome.storage.local.set({ webSearchContextByDomain: byDomain });
        }
        return result;
      } catch (e) {
        return { error: e.message || chrome.i18n.getMessage('errorGuidanceFailed') };
      }
    })().then(sendResponse);
    return true;
  }

  if (msg.type === 'GET_PAGE_CHAT_ANSWER') {
    (async () => {
      try {
        const { history, userMessage } = msg;
        const resolvedTabId = msg.tabId != null ? msg.tabId : sender?.tab?.id;
        if (!resolvedTabId) {
          return { error: chrome.i18n.getMessage('errorChatPage') };
        }
        const storage = await chrome.storage.local.get(['plan', 'answers', 'pageGuidanceCache', 'pageStepCompletions']);
        const plan = storage.plan || null;
        const answers = storage.answers || null;
        if (!plan) {
          return { error: chrome.i18n.getMessage('errorNoPlan') };
        }

        let pageContext;
        try {
          pageContext = await getAxtreeSlim(resolvedTabId);
          console.log('[vibe-guide] GET_PAGE_CHAT_ANSWER: axtree 사용 → slim JSON 포함');
        } catch (e) {
          const msgText = e?.message ?? String(e);
          const stack = e?.stack ? `\n${e.stack}` : '';
          console.warn('[vibe-guide] GET_PAGE_CHAT_ANSWER: axtree 실패 → URL만 사용. 사유:', msgText, stack);
          const tab = await chrome.tabs.get(resolvedTabId);
          if (!tab?.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
            return { error: chrome.i18n.getMessage('errorChatPage') };
          }
          pageContext = { type: 'url', url: tab.url };
        }

        const url = pageContext.url || '';

        const cache = storage.pageGuidanceCache || {};
        const completions = storage.pageStepCompletions || {};

        const currentDomain = getDomainFromUrl(url);
        const allPreviousSteps = [];
        const allCompleted = [];

        if (currentDomain) {
          for (const [cachedUrl, guidance] of Object.entries(cache)) {
            if (guidance?.steps?.length && isSameDomain(cachedUrl, url)) {
              const urlCompletions = completions[cachedUrl] || [];
              guidance.steps.forEach((step, idx) => {
                allPreviousSteps.push(step);
                allCompleted.push(urlCompletions[idx] === true);
              });
            }
          }
        } else if (cache[url]?.steps?.length) {
          allPreviousSteps.push(...cache[url].steps);
          const urlCompletions = completions[url] || [];
          cache[url].steps.forEach((_, idx) => {
            allCompleted.push(urlCompletions[idx] === true);
          });
        }

        const previousStepsForUrl = allPreviousSteps.length > 0
          ? { steps: allPreviousSteps, completed: allCompleted }
          : undefined;

        const locale = getUILocale();
        const explainFollowUp = msg.explainFollowUp === true;
        const result = await getPageChatAnswer(
          { plan, answers, previousStepsForUrl },
          { type: pageContext.type, nodes: pageContext.nodes },
          url,
          Array.isArray(history) ? history : [],
          userMessage || '',
          locale,
          explainFollowUp,
        );

        return { text: result.text };
      } catch (e) {
        return { error: e.message || '메시지를 불러오는 데 실패했습니다.' };
      }
    })().then(sendResponse);
    return true;
  }

  if (msg.type === 'SPOTLIGHT_ELEMENT') {
    const { tabId, selector, backendDOMNodeId, explain, stepKey } = msg;
    // 이전 스포트라이트/래퍼 제거 (컨텐츠 스크립트가 있으면 제거)
    chrome.tabs.sendMessage(tabId, { type: 'REMOVE_SPOTLIGHT' }).catch(() => {});

    const backendId = backendDOMNodeId != null ? Number(backendDOMNodeId) : NaN;
    if (Number.isFinite(backendId)) {
      console.log('[vibe-guide] 스포트라이트 분기: backendDOMNodeId 있음 → CDP wrap, SPOTLIGHT_WRAP_DONE', { backendId, tabId });
      chrome.debugger.attach({ tabId }, DEBUGGER_VERSION, (err) => {
        if (err) {
          sendResponse({ ok: false, error: err.message || '스포트라이트를 사용할 수 없습니다.' });
          return;
        }
        const detach = () => chrome.debugger.detach({ tabId }, () => {});
        chrome.debugger.sendCommand({ tabId }, 'DOM.scrollIntoViewIfNeeded', { backendNodeId: backendId }, () => {
          if (chrome.runtime.lastError) {
            detach();
            sendResponse({ ok: false, error: chrome.runtime.lastError.message || '스크롤 실패' });
            return;
          }
          chrome.debugger.sendCommand({ tabId }, 'DOM.resolveNode', { backendNodeId: backendId }, (resolveResult) => {
            if (chrome.runtime.lastError || !resolveResult?.object?.objectId) {
              detach();
              sendResponse({ ok: false, error: chrome.runtime.lastError?.message || '요소를 찾을 수 없습니다.' });
              return;
            }
            const objectId = resolveResult.object.objectId;
            const wrapFn = 'function() { var w = document.createElement("div"); w.id = "vibe-guide-spotlight-wrapper"; w.style.cssText = "display:" + getComputedStyle(this).display + ";overflow:visible;pointer-events:none;position:relative;z-index:2147483646;border:3px solid #7c6ff7;border-radius:8px;box-shadow:0 0 0 9999px rgba(0,0,0,0.35);"; this.parentNode.insertBefore(w, this); w.appendChild(this); return true; }';
            chrome.debugger.sendCommand({ tabId }, 'Runtime.callFunctionOn', {
              objectId,
              functionDeclaration: wrapFn,
            }, () => {
              detach();
              if (chrome.runtime.lastError) {
                sendResponse({ ok: false, error: chrome.runtime.lastError.message || '요소를 감싸지 못했습니다.' });
                return;
              }
              chrome.tabs.sendMessage(
                tabId,
                { type: 'SPOTLIGHT_WRAP_DONE', backendDOMNodeId: backendId, explain, stepKey },
                (response) => {
                if (chrome.runtime.lastError) {
                  sendResponse({ ok: false, error: chrome.runtime.lastError.message });
                } else {
                  sendResponse(response ?? { ok: true });
                }
                },
              );
            });
          });
        });
      });
    } else if (selector) {
      console.log('[vibe-guide] 스포트라이트 분기: backendDOMNodeId 없음 → selector로 Content에 SPOTLIGHT_ELEMENT', { selector: selector.slice(0, 60), tabId });
      chrome.tabs.sendMessage(tabId, { type: 'SPOTLIGHT_ELEMENT', selector, explain, stepKey })
        .then(res => sendResponse(res ?? { ok: false }))
        .catch(() => sendResponse({ ok: false, error: '페이지와 통신할 수 없습니다.' }));
    } else {
      console.log('[vibe-guide] 스포트라이트 분기: selector/backendDOMNodeId 둘 다 없음');
      sendResponse({ ok: false, error: 'selector 또는 backendDOMNodeId가 필요합니다.' });
    }
    return true;
  }

  if (msg.type === 'URL_CHANGED' && sender.tab?.id) {
    notifyTabChange(sender.tab.id, msg.url);
  }
  if (msg.type === 'OPEN_SURVEY_TAB') {
    openOrFocusSurveyTab();
  }
  if (msg.type === 'OPEN_SIDE_PANEL') {
    // sidePanel.open()은 사용자 제스처(아이콘 클릭)에서만 호출 가능하므로 여기서는 열지 않음.
    // 설문 탭에서는 guide.html로 이동하도록 처리 (SurveyApp에서 처리).
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
