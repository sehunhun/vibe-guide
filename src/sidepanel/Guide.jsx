import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '../components/ui/button.jsx';
import { Card, CardContent, CardHeader } from '../components/ui/card.jsx';
import { Progress } from '../components/ui/progress.jsx';
import { Badge } from '../components/ui/badge.jsx';
import { cn } from '../lib/utils.js';

/**
 * Guide - Step2 메인 화면
 * - plan의 steps를 툴별로 그룹화해서 보여줌
 * - currentTab.url을 보고 현재 어떤 툴 사이트에 있는지 감지
 * - 해당 스텝을 자동으로 하이라이트
 * - 스텝 완료 버튼으로 진행 상황 업데이트
 */

// 툴 공식 도메인 매핑 (manifest content_scripts.matches / host_permissions와 동기화)
const TOOL_DOMAINS = {
  n8n: ['n8n.io'],
  manus: ['manus.ai'],
  'google-stitch': ['stitch.withgoogle.com'],
  'google-ai-studio': ['aistudio.google.com'],
  supabase: ['supabase.com'],
  firebase: ['firebase.google.com'],
  stripe: ['stripe.com'],
  paypal: ['paypal.com', 'www.paypal.com'],
  tosspayments: ['tosspayments.com', 'www.tosspayments.com'],
  clerk: ['clerk.com'],
  'aws-s3': ['aws.amazon.com'],
  vercel: ['vercel.com'],
  railway: ['railway.app'],
  render: ['render.com'],
  ga4: ['analytics.google.com'],
  posthog: ['posthog.com'],
  resend: ['resend.com'],
  sentry: ['sentry.io'],
  sanity: ['sanity.io', 'www.sanity.io'],
  strapi: ['strapi.io'],
  github: ['github.com'],
};

function detectCurrentTool(hostname) {
  if (!hostname) return null;
  for (const [toolId, domains] of Object.entries(TOOL_DOMAINS)) {
    if (domains.some(d => hostname.endsWith(d) || hostname === d)) {
      return toolId;
    }
  }
  return null;
}

function getToolIdForUrl(url) {
  try {
    return detectCurrentTool(new URL(url).hostname);
  } catch {
    return null;
  }
}

/** URL에서 도메인 추출 (프로토콜 제외) */
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

/** 같은 툴(사이트)인지 확인: 툴 ID 기준 우선, 없으면 도메인 비교 */
function isSameSite(url1, url2) {
  const tool1 = getToolIdForUrl(url1);
  const tool2 = getToolIdForUrl(url2);
  if (tool1 && tool2) return tool1 === tool2;
  return isSameDomain(url1, url2);
}

/** URL이 플랜 단계 사이트(progress-site-links) 또는 그 하위 페이지인지 */
function isPlanSiteOrSubpage(url, plan) {
  if (!url || !plan?.steps?.length) return false;
  let currentHost;
  try {
    currentHost = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  for (const step of plan.steps) {
    const stepUrl = step.url || plan.tools?.find(t => t.id === step.toolId)?.url;
    if (!stepUrl) continue;
    try {
      const stepHost = new URL(stepUrl).hostname.toLowerCase();
      if (currentHost === stepHost || currentHost.endsWith('.' + stepHost)) return true;
    } catch {}
  }
  return false;
}

/** AI 단계 완료 데이터로 전체 진행률 계산: 도메인별 완료 여부 + 전체 퍼센트 */
function computeProgressFromAiSteps(plan, pageStepCompletions, pageGuidanceCache, domainCompletions = {}) {
  if (!plan?.steps?.length) {
    return { progressPct: 0, stepDoneByToolId: {}, totalDomains: 0, doneDomains: 0 };
  }
  
  // 플랜의 각 step에 대해 도메인 추출 및 완료 여부 확인
  const domainCompletionMap = new Map(); // 도메인 -> 완료 여부
  const stepDoneByToolId = {};
  
  for (const step of plan.steps) {
    const tid = step.toolId;
    if (stepDoneByToolId[tid] !== undefined) continue;
    
    // step의 URL 또는 tool의 URL에서 도메인 추출
    const stepUrl = step.url || plan.tools?.find(t => t.id === tid)?.url;
    if (!stepUrl) {
      stepDoneByToolId[tid] = false;
      continue;
    }
    
    let stepDomain;
    try {
      stepDomain = new URL(stepUrl).hostname.toLowerCase();
    } catch {
      stepDoneByToolId[tid] = false;
      continue;
    }
    
    // 이미 확인한 도메인이면 건너뛰기
    if (domainCompletionMap.has(stepDomain)) {
      stepDoneByToolId[tid] = domainCompletionMap.get(stepDomain);
      continue;
    }
    
    // 해당 도메인의 모든 단계가 완료되었는지 확인
    let domainCompleted = false;
    
    // pageGuidanceCache와 pageStepCompletions에서 해당 도메인의 모든 단계 확인
    const domainUrls = [];
    for (const [url, guidance] of Object.entries(pageGuidanceCache || {})) {
      if (guidance?.steps?.length) {
        try {
          const urlDomain = new URL(url).hostname.toLowerCase();
          if (urlDomain === stepDomain || urlDomain.endsWith('.' + stepDomain) || stepDomain.endsWith('.' + urlDomain)) {
            domainUrls.push(url);
          }
        } catch {}
      }
    }
    
    if (domainUrls.length > 0) {
      // 해당 도메인의 모든 URL의 모든 단계가 완료되었는지 확인
      const allStepsCompleted = domainUrls.every(url => {
        const completions = pageStepCompletions[url] || [];
        const guidance = pageGuidanceCache[url];
        if (!guidance?.steps?.length) return false;
        // 모든 단계가 완료되었는지 확인
        return guidance.steps.every((_, idx) => completions[idx] === true);
      });
      
      // 모든 단계가 완료되었고, 도메인 완료 플래그가 설정된 경우에만 완료로 간주
      // (모든 단계 완료 후 "다음 단계 받기"를 눌렀을 때 AI가 새로운 단계를 생성하지 못한 경우)
      domainCompleted = allStepsCompleted && domainCompletions[stepDomain] === true;
    }
    
    domainCompletionMap.set(stepDomain, domainCompleted);
    stepDoneByToolId[tid] = domainCompleted;
  }
  
  // 완료된 도메인 수와 전체 도메인 수 계산
  const totalDomains = domainCompletionMap.size;
  const doneDomains = Array.from(domainCompletionMap.values()).filter(Boolean).length;
  const progressPct = totalDomains > 0 ? Math.round((doneDomains / totalDomains) * 100) : 0;
  
  return { progressPct, stepDoneByToolId, totalDomains, doneDomains };
}

export default function Guide({ plan, currentTab, onPlanUpdate, onReset }) {
  const [detectedToolId, setDetectedToolId] = useState(null);
  // URL별 AI 안내 캐시 (페이지가 바뀌어도 유지)
  const [guidanceByUrl, setGuidanceByUrl] = useState({});
  const [loadingGuideUrl, setLoadingGuideUrl] = useState(null); // 요청 중인 URL
  const [pageStepCompletions, setPageStepCompletions] = useState({});
  const [domainCompletions, setDomainCompletions] = useState({}); // 도메인별 완료 상태
  const [incompleteStepMessage, setIncompleteStepMessage] = useState(null); // 완료되지 않은 단계 메시지
  const [selectedDomainUrl, setSelectedDomainUrl] = useState(null); // 선택된 도메인의 URL (링크 클릭 시)
  const previousDomainRef = useRef(null); // 이전 도메인 추적
  const pageGuidanceSectionRef = useRef(null); // "이 페이지에서 할 일" 섹션 ref
  const pendingAutoCompleteRef = useRef(null); // 마지막 스포트라이트 단계 (자동 완료용)
  const [systemPromptCopied, setSystemPromptCopied] = useState(false);

  const pageUrl = currentTab?.url || '';
  const isPlanSite = plan && isPlanSiteOrSubpage(pageUrl, plan);

  // 저장된 캐시 + 페이지 단계 완료 불러오기
  useEffect(() => {
    chrome.storage.local.get(['pageGuidanceCache', 'pageStepCompletions', 'domainCompletions'], (r) => {
      if (r.pageGuidanceCache) setGuidanceByUrl(r.pageGuidanceCache);
      if (r.pageStepCompletions) setPageStepCompletions(r.pageStepCompletions);
      if (r.domainCompletions) setDomainCompletions(r.domainCompletions);
    });
  }, []);

  // URL 변경 시: 툴 감지 및 도메인 변경 시 자동 AI 안내 요청
  useEffect(() => {
    if (currentTab?.hostname) {
      const detected = detectCurrentTool(currentTab.hostname);
      setDetectedToolId(detected);
    }
    const url = currentTab?.url;
    if (!url || !currentTab?.tabId || url.startsWith('chrome://') || url.startsWith('chrome-extension://')) {
      previousDomainRef.current = null;
      setSelectedDomainUrl(null); // 선택 해제
      return;
    }
    
  const currentDomain = getDomainFromUrl(url);
  const previousDomain = previousDomainRef.current;
    
    // 현재 페이지가 선택된 도메인과 같은 도메인이면 선택 해제 (자동으로 현재 페이지 표시)
    if (selectedDomainUrl && isSameSite(url, selectedDomainUrl)) {
      setSelectedDomainUrl(null);
    }
    
    // 도메인이 변경되었는지 확인
    const domainChanged = previousDomain !== null && currentDomain !== previousDomain;
    
    // 캐시된 데이터 불러오기
    chrome.storage.local.get('pageGuidanceCache', (r) => {
      const cache = r.pageGuidanceCache || {};
      const cached = cache[url];
      if (cached) {
        setGuidanceByUrl(prev => ({ ...prev, [url]: cached }));
      }
      
      // 도메인이 변경되었고, 캐시된 데이터가 없으면 자동으로 AI 안내 요청
      if (domainChanged && !cached?.steps?.length && !cached?.error) {
        // 플랜 사이트인지 확인
        if (plan && isPlanSiteOrSubpage(url, plan)) {
          setLoadingGuideUrl(url);
          chrome.runtime.sendMessage({ type: 'GET_PAGE_GUIDANCE', tabId: currentTab.tabId }, (res) => {
            setLoadingGuideUrl(null);
            if (res?.error) {
              const next = { ...cache, [url]: { error: res.error } };
              setGuidanceByUrl(prev => ({ ...prev, [url]: { error: res.error } }));
              chrome.storage.local.set({ pageGuidanceCache: next });
            } else if (res?.steps?.length) {
              const now = Date.now();
              const stampedSteps = res.steps.map(step => ({
                ...step,
                createdAt: typeof step.createdAt === 'number' ? step.createdAt : now,
              }));
              const next = { ...cache, [url]: { steps: stampedSteps } };
              setGuidanceByUrl(prev => ({ ...prev, [url]: { steps: stampedSteps } }));
              chrome.storage.local.set({ pageGuidanceCache: next });
            } else if (res?.text) {
              const now = Date.now();
              const steps = [{ text: res.text, selector: res.selector || null, createdAt: now }];
              const next = { ...cache, [url]: { steps } };
              setGuidanceByUrl(prev => ({ ...prev, [url]: { steps } }));
              chrome.storage.local.set({ pageGuidanceCache: next });
            }
          });
        }
      }
    });
    
    // 현재 도메인을 이전 도메인으로 저장
    previousDomainRef.current = currentDomain;
  }, [currentTab?.hostname, currentTab?.url, currentTab?.tabId, plan, selectedDomainUrl]);

  const handleOpenTool = (url) => {
    // 이미 같은 도메인의 탭이 열려 있으면 그 탭으로 이동, 없으면 새 탭 생성
    try {
      chrome.tabs.query({}, (tabs) => {
        if (!Array.isArray(tabs)) {
          chrome.tabs.create({ url });
          return;
        }

        const existing = tabs.find((tab) => tab.url && isSameSite(tab.url, url));
        if (existing && existing.id != null) {
          chrome.tabs.update(existing.id, { active: true });
          if (existing.windowId != null) {
            chrome.windows.update(existing.windowId, { focused: true });
          }
        } else {
          chrome.tabs.create({ url });
        }
      });
    } catch {
      // query 사용이 불가능한 환경이면 기존 동작 유지
      chrome.tabs.create({ url });
    }
  };

  const handleCopySystemPrompt = useCallback(() => {
    const prompt = plan?.systemPrompt;
    if (!prompt) return;

    const markCopied = () => {
      setSystemPromptCopied(true);
      setTimeout(() => setSystemPromptCopied(false), 1500);
    };

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(prompt).then(markCopied).catch(() => {});
      return;
    }

    try {
      const textarea = document.createElement('textarea');
      textarea.value = prompt;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      markCopied();
    } catch {
      // ignore
    }
  }, [plan?.systemPrompt]);

  /** 해당 도메인의 "이 페이지에서 할 일" 표시 */
  const handleSwitchToDomain = useCallback((url) => {
    setSelectedDomainUrl(url);
    // 스크롤을 "이 페이지에서 할 일" 섹션으로 이동
    setTimeout(() => {
      if (pageGuidanceSectionRef.current) {
        pageGuidanceSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  }, []);

  /** 완료되지 않은 첫 번째 단계 찾기 (같은 도메인 내) */
  const findFirstIncompleteStep = useCallback(() => {
    if (!pageUrl) return null;
    
    const currentDomain = getDomainFromUrl(pageUrl);
    if (!currentDomain) {
      // 도메인 추출 실패 시 현재 URL만 확인
      const cache = guidanceByUrl[pageUrl];
      if (!cache?.steps?.length) return null;
      const completions = pageStepCompletions[pageUrl] || [];
      const incompleteIndex = completions.findIndex((done, idx) => !done && idx < cache.steps.length);
      if (incompleteIndex >= 0) {
        return {
          step: cache.steps[incompleteIndex],
          sourceUrl: pageUrl,
          sourceIndex: incompleteIndex,
          globalIndex: incompleteIndex,
        };
      }
      return null;
    }
    
    // 같은 도메인의 모든 단계 확인
    const allSteps = [];
    for (const [url, guidance] of Object.entries(guidanceByUrl)) {
      if (guidance?.steps?.length && isSameSite(url, pageUrl)) {
        const completions = pageStepCompletions[url] || [];
        guidance.steps.forEach((step, idx) => {
          const isCompleted = completions[idx] === true;
          allSteps.push({
            step,
            sourceUrl: url,
            sourceIndex: idx,
            globalIndex: allSteps.length,
            isCompleted,
          });
        });
      }
    }
    
    // 완료되지 않은 첫 번째 단계 찾기
    const incomplete = allSteps.find(item => !item.isCompleted);
    return incomplete ? {
      step: incomplete.step,
      sourceUrl: incomplete.sourceUrl,
      sourceIndex: incomplete.sourceIndex,
      globalIndex: incomplete.globalIndex,
    } : null;
  }, [pageUrl, guidanceByUrl, pageStepCompletions]);

  /** 현재 탭에 대한 AI 안내 다시 요청 (이전 단계 유지하면서 다음 단계 추가) */
  const handleRequestPageGuidance = useCallback(() => {
    if (!currentTab?.tabId || !pageUrl) return;
    if (!plan || !isPlanSiteOrSubpage(pageUrl, plan)) return;
    
    // 최신 완료 상태를 직접 가져와서 확인
    chrome.storage.local.get(['pageGuidanceCache', 'pageStepCompletions'], (r) => {
      const cache = r.pageGuidanceCache || {};
      const completions = r.pageStepCompletions || {};
      
      // 완료되지 않은 단계가 있는지 확인 (최신 상태 사용)
      const currentDomain = getDomainFromUrl(pageUrl);
      let incompleteStep = null;
      
      if (currentDomain) {
        // 같은 도메인의 모든 단계 확인
        const allSteps = [];
        for (const [url, guidance] of Object.entries(cache)) {
          if (guidance?.steps?.length && isSameSite(url, pageUrl)) {
            const urlCompletions = completions[url] || [];
            guidance.steps.forEach((step, idx) => {
              const isCompleted = urlCompletions[idx] === true;
              if (!isCompleted && !incompleteStep) {
                incompleteStep = {
                  step,
                  sourceUrl: url,
                  sourceIndex: idx,
                };
              }
            });
          }
        }
      } else {
        // 도메인 추출 실패 시 현재 URL만 확인
        const currentGuidance = cache[pageUrl];
        if (currentGuidance?.steps?.length) {
          const currentCompletions = completions[pageUrl] || [];
          const incompleteIndex = currentCompletions.findIndex((done, idx) => !done && idx < currentGuidance.steps.length);
          if (incompleteIndex >= 0) {
            incompleteStep = {
              step: currentGuidance.steps[incompleteIndex],
              sourceUrl: pageUrl,
              sourceIndex: incompleteIndex,
            };
          }
        }
      }
      
      if (incompleteStep) {
        // 완료되지 않은 단계가 있으면 해당 페이지로 이동하고 메시지 표시
        if (incompleteStep.sourceUrl !== pageUrl) {
          // 다른 페이지에 있는 단계면 해당 페이지로 이동
          chrome.tabs.update(currentTab.tabId, { url: incompleteStep.sourceUrl });
        }
        // 메시지 표시
        setIncompleteStepMessage({
          text: incompleteStep.step.text,
          sourceUrl: incompleteStep.sourceUrl,
        });
        // 5초 후 메시지 자동 숨김
        setTimeout(() => setIncompleteStepMessage(null), 5000);
        return;
      }
      
      // 메시지 초기화
      setIncompleteStepMessage(null);
      
      // AI 안내 요청
      setLoadingGuideUrl(pageUrl);
      const existingSteps = cache[pageUrl]?.steps || [];
      const existingCompleted = completions[pageUrl] || [];
      
      chrome.runtime.sendMessage({ type: 'GET_PAGE_GUIDANCE', tabId: currentTab.tabId }, (res) => {
        setLoadingGuideUrl(null);
        if (res?.error) {
          const next = { ...cache, [pageUrl]: { error: res.error } };
          setGuidanceByUrl(prev => ({ ...prev, [pageUrl]: { error: res.error } }));
          chrome.storage.local.set({ pageGuidanceCache: next });
        } else if (res?.steps?.length) {
          // 모든 단계가 완료된 상태에서 AI가 새로운 단계를 생성하지 못한 경우를 추적
          // (현재는 단계가 생성되면 계속 진행)
          // AI가 한 번에 하나의 단계만 반환하므로, 이전 단계에 새 단계 하나를 추가
          const now = Date.now();
          const newSteps = res.steps.map(step => ({
            ...step,
            createdAt: typeof step.createdAt === 'number' ? step.createdAt : now,
          }));

          let mergedSteps;
          let mergedCompleted;
          
          if (existingSteps.length > 0) {
            // 이전 단계가 있으면 새 단계 하나를 추가
            const completed = existingCompleted || [];
            const lastIncompleteIndex = completed.findIndex((done, idx) => !done && idx < existingSteps.length);
            
            if (lastIncompleteIndex >= 0) {
              // 완료되지 않은 단계가 있으면 그 이후부터 새 단계로 교체 (하지만 AI는 하나만 반환하므로 추가)
              // 이전 단계는 유지하고 새 단계 하나 추가
              mergedSteps = [...existingSteps, ...newSteps];
              mergedCompleted = [...existingCompleted];
              while (mergedCompleted.length < mergedSteps.length) {
                mergedCompleted.push(false);
              }
            } else {
              // 모두 완료되었으면 새 단계 하나를 추가
              mergedSteps = [...existingSteps, ...newSteps];
              mergedCompleted = [...existingCompleted];
              while (mergedCompleted.length < mergedSteps.length) {
                mergedCompleted.push(false);
              }
            }
          } else {
            // 이전 단계가 없으면 새 단계 하나만 사용
            mergedSteps = newSteps;
            mergedCompleted = new Array(mergedSteps.length).fill(false);
          }
          
          const next = { ...cache, [pageUrl]: { steps: mergedSteps } };
          setGuidanceByUrl(prev => ({ ...prev, [pageUrl]: { steps: mergedSteps } }));
          chrome.storage.local.set({ pageGuidanceCache: next });
          
          // 완료 상태 저장
          const nextCompletions = { ...completions, [pageUrl]: mergedCompleted };
          chrome.storage.local.set({ pageStepCompletions: nextCompletions });
          setPageStepCompletions(nextCompletions);
        } else if (Array.isArray(res?.steps) && res.steps.length === 0) {
          // AI가 빈 배열을 반환한 경우 (더 이상 단계가 없음)
          // 완료 메시지를 steps에 추가 (기존 단계 유지)
          const completionMessage = {
            text: '🎉 ' + chrome.i18n.getMessage('guideCompletionMessage'),
            selector: null,
            isCompletionMessage: true,
            // 생성 시점 기준 정렬을 위해 타임스탬프 부여 (항상 맨 아래로 오도록 최신 시간 사용)
            createdAt: Date.now(),
          };
          
          // 기존 단계들을 유지하면서 완료 메시지만 추가
          const mergedSteps = [...existingSteps, completionMessage];
          const next = { ...cache, [pageUrl]: { steps: mergedSteps } };
          setGuidanceByUrl(prev => ({ ...prev, [pageUrl]: { steps: mergedSteps } }));
          chrome.storage.local.set({ pageGuidanceCache: next });
          
          // 완료 상태 저장 (기존 완료 상태 유지 + 완료 메시지는 자동으로 완료된 것으로 표시)
          const mergedCompleted = [...existingCompleted, true];
          const nextCompletions = { ...completions, [pageUrl]: mergedCompleted };
          chrome.storage.local.set({ pageStepCompletions: nextCompletions });
          setPageStepCompletions(nextCompletions);
          
          // 도메인 완료 플래그 설정
          const currentDomain = getDomainFromUrl(pageUrl);
          if (currentDomain) {
            chrome.storage.local.get('domainCompletions', (r) => {
              const domainCompletions = r.domainCompletions || {};
              domainCompletions[currentDomain] = true;
              chrome.storage.local.set({ domainCompletions }, () => {
                setDomainCompletions(domainCompletions);
                // 사이드탭 스크롤 맨 위로 이동
                setTimeout(() => {
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }, 100);
              });
            });
          } else {
            // 도메인 추출 실패 시에도 스크롤 이동
            setTimeout(() => {
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }, 100);
          }
        } else if (res?.text) {
          const now = Date.now();
          const steps = [{ text: res.text, selector: res.selector || null, createdAt: now }];
          // 이전 단계가 있으면 유지하고 새 단계 추가
          const mergedSteps = existingSteps.length > 0 ? [...existingSteps, ...steps] : steps;
          const next = { ...cache, [pageUrl]: { steps: mergedSteps } };
          setGuidanceByUrl(prev => ({ ...prev, [pageUrl]: { steps: mergedSteps } }));
          chrome.storage.local.set({ pageGuidanceCache: next });
        }
      });
    });
  }, [currentTab?.tabId, pageUrl]);

  /** 해당 단계 요소로 스포트라이트 (selector 또는 backendDOMNodeId) */
  const handleSpotlight = useCallback((step) => {
    if (!currentTab?.tabId) return;
    const sourceUrl = step?.sourceUrl || pageUrl;
    const sourceIndex = step?.sourceIndex !== undefined ? step.sourceIndex : null;
    const selector = step?.selector ?? null;
    const backendDOMNodeId = step?.backendDOMNodeId ?? null;
    const hasBackendId = backendDOMNodeId != null && Number.isFinite(Number(backendDOMNodeId));
    if (!selector && !hasBackendId) return;

    if (sourceUrl && sourceIndex != null) {
      pendingAutoCompleteRef.current = {
        sourceUrl,
        sourceIndex,
        timestamp: Date.now(),
      };
    } else {
      pendingAutoCompleteRef.current = null;
    }

    chrome.runtime.sendMessage(
      { type: 'SPOTLIGHT_ELEMENT', tabId: currentTab.tabId, selector, backendDOMNodeId },
      () => {},
    );
  }, [currentTab?.tabId, pageUrl]);

  // 콘텐츠 스크립트에서 스포트라이트 대상 요소 클릭 시 자동으로 해당 단계를 완료 처리
  useEffect(() => {
    const handler = (msg) => {
      if (!msg || msg.type !== 'SPOTLIGHT_TARGET_CLICKED') return;
      const pending = pendingAutoCompleteRef.current;
      if (!pending) return;

      const { sourceUrl, sourceIndex } = pending;
      // 클릭과 동시에 해당 단계를 완료 처리
      savePageStepCompletion(sourceUrl, sourceIndex, true);
      // 한 번 처리 후에는 초기화
      if (pendingAutoCompleteRef.current === pending) {
        pendingAutoCompleteRef.current = null;
      }
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, [savePageStepCompletion]);

  /** 단계 제거 */
  const removeStep = useCallback((sourceUrl, stepIndex) => {
    chrome.storage.local.get(['pageGuidanceCache', 'pageStepCompletions'], (r) => {
      const cache = r.pageGuidanceCache || {};
      const completions = r.pageStepCompletions || {};
      
      // 해당 URL의 단계 제거
      if (cache[sourceUrl]?.steps?.length) {
        const newSteps = cache[sourceUrl].steps.filter((_, idx) => idx !== stepIndex);
        const newCache = { ...cache };
        
        if (newSteps.length === 0) {
          // 모든 단계가 제거되면 해당 URL 항목 삭제
          delete newCache[sourceUrl];
        } else {
          newCache[sourceUrl] = { ...cache[sourceUrl], steps: newSteps };
        }
        
        // 완료 상태도 제거
        const newCompletions = { ...completions };
        if (newCompletions[sourceUrl]) {
          const newCompleted = newCompletions[sourceUrl].filter((_, idx) => idx !== stepIndex);
          if (newCompleted.length === 0) {
            delete newCompletions[sourceUrl];
          } else {
            newCompletions[sourceUrl] = newCompleted;
          }
        }
        
        chrome.storage.local.set({ 
          pageGuidanceCache: newCache,
          pageStepCompletions: newCompletions 
        }, () => {
          setGuidanceByUrl(newCache);
          setPageStepCompletions(newCompletions);
        });
      }
    });
  }, []);

  /** UI 단계 완료 토글 저장 (같은 도메인 내에서 sourceUrl 기반으로 관리) */
  const savePageStepCompletion = useCallback((sourceUrl, stepIndex, done) => {
    chrome.storage.local.get(['pageStepCompletions', 'pageGuidanceCache'], (r) => {
      const all = r.pageStepCompletions || {};
      const cache = r.pageGuidanceCache || {};
      const arr = all[sourceUrl] ? [...all[sourceUrl]] : [];
      while (arr.length <= stepIndex) arr.push(false);
      arr[stepIndex] = done;
      const next = { ...all, [sourceUrl]: arr };
      chrome.storage.local.set({ pageStepCompletions: next }, () => {
        setPageStepCompletions(next);
        
        // 완료 버튼을 눌렀을 때 (done === true) 모든 단계가 완료되었는지 확인
        if (done && pageUrl) {
          // 같은 도메인의 모든 단계 확인
          const currentDomain = getDomainFromUrl(pageUrl);
          if (currentDomain) {
            // 같은 도메인의 모든 단계 수집
            const allSteps = [];
            for (const [url, guidance] of Object.entries(cache)) {
              if (guidance?.steps?.length && isSameSite(url, pageUrl)) {
                const urlCompletions = url === sourceUrl ? next[url] : (all[url] || []);
                guidance.steps.forEach((step, idx) => {
                  allSteps.push({
                    step,
                    sourceUrl: url,
                    sourceIndex: idx,
                    completed: urlCompletions[idx] === true,
                  });
                });
              }
            }
            
            // 모든 단계가 완료되었는지 확인
            const allCompleted = allSteps.length > 0 && allSteps.every(item => item.completed);
            
            if (allCompleted) {
              // 모든 단계가 완료되었을 때만 자동으로 다음 단계 요청 (페이지 전환 대기 시간을 위해 짧게 딜레이)
              setTimeout(() => {
                handleRequestPageGuidance();
              }, 1000);
            }
          } else {
            // 도메인 추출 실패 시 현재 URL만 확인
            const currentGuidance = cache[pageUrl];
            if (currentGuidance?.steps?.length) {
              const currentCompletions = pageUrl === sourceUrl ? next[pageUrl] : (all[pageUrl] || []);
              const allCompleted = currentGuidance.steps.every((_, idx) => currentCompletions[idx] === true);
              
              if (allCompleted) {
                setTimeout(() => {
                  handleRequestPageGuidance();
                }, 1000);
              }
            }
          }
        }
      });
    });
  }, [handleRequestPageGuidance, pageUrl, isPlanSite]);

  // AI가 새 단계를 생성해 제공했을 때(또는 다음 미완료 단계가 생겼을 때) 자동으로 "위치로 이동" 실행
  const lastAutoSpotlightRef = useRef({ key: null, index: null });

  useEffect(() => {
    if (!currentTab?.tabId) return;
    if (!pageUrl) return;
    // 아직 AI 안내를 불러오는 중이면 대기
    if (loadingGuideUrl) return;

    const nextIncomplete = findFirstIncompleteStep();
    if (!nextIncomplete || !nextIncomplete.step) return;

    const domainKey = getDomainFromUrl(pageUrl) || pageUrl || 'unknown';
    const last = lastAutoSpotlightRef.current;

    // 같은 도메인/URL에서 이미 스포트라이트한 단계라면 다시 실행하지 않음
    if (last.key === domainKey && last.index === nextIncomplete.globalIndex) {
      return;
    }

    // 실제로 이동 가능한 단계만 자동 실행 (selector 또는 backendDOMNodeId가 있는 경우)
    const step = nextIncomplete.step;
    const hasSelector = !!step.selector;
    const hasBackendId = step.backendDOMNodeId != null && Number.isFinite(Number(step.backendDOMNodeId));
    if (!hasSelector && !hasBackendId) return;

    handleSpotlight(step);
    lastAutoSpotlightRef.current = { key: domainKey, index: nextIncomplete.globalIndex };
  }, [
    currentTab?.tabId,
    pageUrl,
    loadingGuideUrl,
    guidanceByUrl,
    pageStepCompletions,
    findFirstIncompleteStep,
    handleSpotlight,
  ]);

  if (!plan) return null;

  // 같은 도메인의 모든 단계를 합쳐서 표시 (생성 시점 순서로 정렬)
  const getMergedGuidanceForDomain = useCallback((targetUrl) => {
    // 선택된 도메인 URL이 있으면 해당 도메인의 guidance 표시
    const displayUrl = targetUrl || pageUrl;
    if (!displayUrl) return null;
    
    // 같은 도메인의 모든 URL에서 단계 수집
    const allSteps = [];
    
    for (const [url, guidance] of Object.entries(guidanceByUrl)) {
      if (guidance?.steps?.length && isSameSite(url, displayUrl)) {
        // 각 단계에 출처 URL 정보 추가
        guidance.steps.forEach((step, idx) => {
          // 잘못된 단계 필터링: {"steps": []} 같은 JSON 문자열이 텍스트로 저장된 경우 제외
          if (step.text && (
            step.text.trim().startsWith('{"steps"') || 
            (step.text.trim().startsWith('{"') && step.text.includes('"steps"'))
          )) {
            return; // 잘못된 단계는 건너뛰기
          }
          allSteps.push({
            ...step,
            sourceUrl: url,
            sourceIndex: idx,
          });
        });
      }
    }
    
    if (allSteps.length === 0) return null;

    // createdAt 기준으로 정렬 (없으면 오래된 것으로 간주)
    allSteps.sort((a, b) => {
      const aTime = typeof a.createdAt === 'number' ? a.createdAt : 0;
      const bTime = typeof b.createdAt === 'number' ? b.createdAt : 0;
      return aTime - bTime;
    });
    
    return { steps: allSteps };
  }, [pageUrl, guidanceByUrl]);

  // 선택된 도메인이 있으면 해당 도메인의 guidance, 없으면 현재 페이지의 guidance
  const mergedGuidance = getMergedGuidanceForDomain(selectedDomainUrl);
  const pageGuidance = mergedGuidance || (pageUrl ? guidanceByUrl[pageUrl] : null);
  // 로딩 상태도 "현재 표시 중인 사이트(툴)" 기준으로 표시
  const displayUrlForGuidance = selectedDomainUrl || pageUrl;
  const loadingGuide = displayUrlForGuidance && loadingGuideUrl && isSameSite(loadingGuideUrl, displayUrlForGuidance);
  const { progressPct, stepDoneByToolId, totalDomains, doneDomains } = computeProgressFromAiSteps(plan, pageStepCompletions, guidanceByUrl, domainCompletions);
  const isAllDone = totalDomains > 0 && doneDomains === totalDomains;

  // 현재 표시 중인 도메인의 이름 가져오기
  const getDomainNameForTitle = useCallback((targetUrl) => {
    const displayUrl = targetUrl || pageUrl;
    if (!displayUrl) return null;
    
    // plan.steps에서 해당 URL과 매칭되는 step 찾기
    const matchingStep = plan.steps?.find(step => {
      const stepUrl = step.url || plan.tools?.find(t => t.id === step.toolId)?.url;
      if (!stepUrl) return false;
      return isSameDomain(stepUrl, displayUrl);
    });
    
    if (matchingStep) {
      return matchingStep.toolName || matchingStep.name || plan.tools?.find(t => t.id === matchingStep.toolId)?.name;
    }
    
    // 플랜에 없는 도메인은 제목에 별도 이름을 표시하지 않음
    return null;
  }, [pageUrl, plan]);

  const currentDomainName = getDomainNameForTitle(selectedDomainUrl);
  const pageGuidanceTitle = currentDomainName
    ? chrome.i18n.getMessage('guidePageTitleDomain', [currentDomainName])
    : chrome.i18n.getMessage('guidePageTitle');

  return (
    <div className="flex flex-col gap-3">
      {detectedToolId && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
          <span className="text-amber-500">●</span>
          <span>
            {chrome.i18n.getMessage('guideYouAreOn')} <strong>{plan.tools.find(t => t.id === detectedToolId)?.name || detectedToolId}</strong>{chrome.i18n.getMessage('guideYouAreOnSuffix')}
          </span>
        </div>
      )}

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">{chrome.i18n.getMessage('guideProgressLabel')}</span>
            <span className="text-xs font-semibold text-foreground">{doneDomains}/{totalDomains} {chrome.i18n.getMessage('guideDomainsDone')}</span>
          </div>
          <Progress value={progressPct} className="h-1.5" />
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          <div className="flex flex-wrap items-center justify-between gap-1 text-muted-foreground/50">
            {(plan.steps || []).map((step) => {
              const done = stepDoneByToolId[step.toolId] === true;
              const icon = step.toolIcon || plan.tools?.find(t => t.id === step.toolId)?.logo || '•';
              return (
                <span
                  key={step.stepId}
                  className={cn('text-base transition-opacity', done && 'opacity-100')}
                  title={step.title}
                >
                  {done ? '✓' : icon}
                </span>
              );
            })}
          </div>
          <div className="flex flex-col gap-1 border-t border-border pt-2">
            {(plan.steps || []).map((step, idx) => {
              const icon = step.toolIcon || plan.tools?.find(t => t.id === step.toolId)?.logo || '•';
              const url = step.url || plan.tools?.find(t => t.id === step.toolId)?.url;
              const name = step.toolName || plan.tools?.find(t => t.id === step.toolId)?.name || step.title;
              if (!url) return null;
              const isSelected = selectedDomainUrl && isSameDomain(url, selectedDomainUrl);
              return (
                <div key={step.stepId} className="flex items-center gap-1">
                  <a
                    className={cn(
                      'flex flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
                      isSelected ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                    )}
                    href={url}
                    onClick={(e) => { e.preventDefault(); handleSwitchToDomain(url); }}
                  >
                    <span className="w-4 shrink-0 text-right text-muted-foreground">{idx + 1}.</span>
                    <span>{icon}</span>
                    <span>{name}</span>
                  </a>
                  <Button
                    variant="ghost"
                    size="iconSm"
                    className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleOpenTool(url); }}
                    title={chrome.i18n.getMessage('guideOpenNewTab')}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
                  </Button>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {currentTab?.tabId && (
        <Card ref={pageGuidanceSectionRef}>
          <CardHeader className="pb-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{pageGuidanceTitle}</h3>
          </CardHeader>
          <CardContent className="space-y-3">
          {incompleteStepMessage && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-amber-700 dark:text-amber-400">
              <div className="mb-2 font-semibold text-xs">
                {chrome.i18n.getMessage('guideIncompleteTitle')}
              </div>
              <div className="mb-2 text-xs">"{incompleteStepMessage.text}"</div>
              <div className="mb-2 text-xs opacity-90">{chrome.i18n.getMessage('guideIncompleteHint')}</div>
              <Button variant="secondary" size="sm" onClick={() => setIncompleteStepMessage(null)}>
                {chrome.i18n.getMessage('guideClose')}
              </Button>
            </div>
          )}
          {!loadingGuide && isPlanSite && (
            <Button className="w-full" onClick={handleRequestPageGuidance}>
              {pageGuidance?.steps?.length ? chrome.i18n.getMessage('guideNextStep') : chrome.i18n.getMessage('guideGetGuidance')}
            </Button>
          )}
          {loadingGuide && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
              {chrome.i18n.getMessage('guideAnalyzing')}
            </div>
          )}
          {pageGuidance?.error && (
            <div className="space-y-2 text-xs text-destructive">
              <p>{pageGuidance.error}</p>
              <Button variant="secondary" size="sm" onClick={handleRequestPageGuidance}>
                {chrome.i18n.getMessage('guideRetry')}
              </Button>
            </div>
          )}
          {pageGuidance?.steps && pageGuidance.steps.length > 0 && (
            <div className="space-y-2">
              {pageGuidance.steps
                .filter((step) => {
                  if (!step.text) return false;
                  const text = step.text.trim();
                  if (text.startsWith('{"steps"') || (text.startsWith('{"') && text.includes('"steps"'))) return false;
                  return true;
                })
                .map((step, idx) => {
                  const sourceUrl = step.sourceUrl || pageUrl;
                  const sourceIndex = step.sourceIndex !== undefined ? step.sourceIndex : idx;
                  const completed = (pageStepCompletions[sourceUrl] && pageStepCompletions[sourceUrl][sourceIndex]) === true;
                  const isCompletionMessage = step.isCompletionMessage === true;
                  return (
                    <div
                      key={`${sourceUrl}-${sourceIndex}`}
                      className={cn(
                        'rounded-md border border-border bg-muted/50 p-2.5',
                        (completed || isCompletionMessage) && 'opacity-75'
                      )}
                    >
                      <div className="flex gap-2">
                        {!isCompletionMessage && (
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[10px] font-semibold text-primary">
                            {idx + 1}
                          </span>
                        )}
                        <span className="flex-1 text-xs leading-relaxed text-foreground">{step.text}</span>
                      </div>
                      {!isCompletionMessage && (
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          {(step.selector || (step.backendDOMNodeId != null && Number.isFinite(Number(step.backendDOMNodeId)))) && (
                            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleSpotlight({ ...step, sourceUrl, sourceIndex })}>
                              {chrome.i18n.getMessage('guideSpotlight')}
                            </Button>
                          )}
                          {step.action === 'copy_system_prompt' && plan?.systemPrompt && (
                            <>
                              <Button variant="secondary" size="sm" className="h-7 text-xs" onClick={handleCopySystemPrompt} title={chrome.i18n.getMessage('guideCopyPrompt')}>
                                {systemPromptCopied ? chrome.i18n.getMessage('guideCopied') : '복사'}
                              </Button>
                            </>
                          )}
                          <Button
                            variant={completed ? 'ghost' : 'secondary'}
                            size="sm"
                            className={cn('h-7 text-xs', !completed && 'border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400')}
                            onClick={() => savePageStepCompletion(sourceUrl, sourceIndex, !completed)}
                          >
                            {completed ? chrome.i18n.getMessage('guideUndo') : chrome.i18n.getMessage('guideDone')}
                          </Button>
                          <Button
                            variant="ghost"
                            size="iconSm"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => { if (confirm(chrome.i18n.getMessage('guideConfirmRemove'))) removeStep(sourceUrl, sourceIndex); }}
                            title={chrome.i18n.getMessage('guideRemoveStep')}
                          >
                            ×
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              <p className="text-[11px] text-muted-foreground">
                {pageGuidance.steps.filter((s, i) => {
                  const u = s.sourceUrl || pageUrl;
                  const i2 = s.sourceIndex !== undefined ? s.sourceIndex : i;
                  return (pageStepCompletions[u] && pageStepCompletions[u][i2]) === true;
                }).length}/{pageGuidance.steps.length} {chrome.i18n.getMessage('guideCompleteCount')}
              </p>
            </div>
          )}
          </CardContent>
        </Card>
      )}

      {isAllDone && (
        <Card className="border-emerald-500/30 bg-emerald-500/10">
          <CardContent className="py-5 text-center">
            <p className="mb-1 text-sm font-semibold text-emerald-600 dark:text-emerald-400">모든 단계를 완료했어요</p>
            <p className="mb-3 text-xs text-muted-foreground">사이트가 완성됐습니다.</p>
            <Button variant="secondary" onClick={onReset}>처음부터 다시 시작</Button>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-center pt-2">
        <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" onClick={onReset}>
          {chrome.i18n.getMessage('resetPlanButton')}
        </Button>
      </div>
    </div>
  );
}
