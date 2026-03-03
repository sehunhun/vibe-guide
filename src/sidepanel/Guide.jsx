import React, { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Guide - Step2 메인 화면
 * - plan의 steps를 툴별로 그룹화해서 보여줌
 * - currentTab.url을 보고 현재 어떤 툴 사이트에 있는지 감지
 * - 해당 스텝을 자동으로 하이라이트
 * - 스텝 완료 버튼으로 진행 상황 업데이트
 */

// 툴 공식 도메인 매핑
const TOOL_DOMAINS = {
  'google-ai-studio': ['aistudio.google.com'],
  github: ['github.com'],
  framer: ['framer.com'],
  webflow: ['webflow.com', 'webflow.io'],
  bubble: ['bubble.io'],
  bolt: ['bolt.new', 'stackblitz.com'],
  cursor: ['cursor.sh', 'cursor.com'],
  lovable: ['lovable.dev', 'gptengineer.app'],
  softr: ['softr.io'],
  carrd: ['carrd.co'],
  teachable: ['teachable.com'],
  notion: ['notion.so', 'notion.site', 'super.so'],
  replit: ['replit.com'],
  vercel: ['vercel.com'],
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

  const pageUrl = currentTab?.url || '';

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
    if (selectedDomainUrl && isSameDomain(url, selectedDomainUrl)) {
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
              const next = { ...cache, [url]: { steps: res.steps } };
              setGuidanceByUrl(prev => ({ ...prev, [url]: { steps: res.steps } }));
              chrome.storage.local.set({ pageGuidanceCache: next });
            } else if (res?.text) {
              const steps = [{ text: res.text, selector: res.selector || null }];
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
    chrome.tabs.create({ url });
  };

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
      if (guidance?.steps?.length && isSameDomain(url, pageUrl)) {
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
          if (guidance?.steps?.length && isSameDomain(url, pageUrl)) {
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
          let mergedSteps;
          let mergedCompleted;
          
          if (existingSteps.length > 0) {
            // 이전 단계가 있으면 새 단계 하나를 추가
            const completed = existingCompleted || [];
            const lastIncompleteIndex = completed.findIndex((done, idx) => !done && idx < existingSteps.length);
            
            if (lastIncompleteIndex >= 0) {
              // 완료되지 않은 단계가 있으면 그 이후부터 새 단계로 교체 (하지만 AI는 하나만 반환하므로 추가)
              // 이전 단계는 유지하고 새 단계 하나 추가
              mergedSteps = [...existingSteps, ...res.steps];
              mergedCompleted = [...existingCompleted];
              while (mergedCompleted.length < mergedSteps.length) {
                mergedCompleted.push(false);
              }
            } else {
              // 모두 완료되었으면 새 단계 하나를 추가
              mergedSteps = [...existingSteps, ...res.steps];
              mergedCompleted = [...existingCompleted];
              while (mergedCompleted.length < mergedSteps.length) {
                mergedCompleted.push(false);
              }
            }
          } else {
            // 이전 단계가 없으면 새 단계 하나만 사용
            mergedSteps = res.steps;
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
            text: '🎉 이 페이지에서 할 일이 완료 되었습니다!',
            selector: null,
            isCompletionMessage: true, // 완료 메시지 플래그
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
          const steps = [{ text: res.text, selector: res.selector || null }];
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
    const selector = step?.selector ?? null;
    const backendDOMNodeId = step?.backendDOMNodeId ?? null;
    const hasBackendId = backendDOMNodeId != null && Number.isFinite(Number(backendDOMNodeId));
    if (!selector && !hasBackendId) return;
    chrome.runtime.sendMessage(
      { type: 'SPOTLIGHT_ELEMENT', tabId: currentTab.tabId, selector, backendDOMNodeId },
      () => {},
    );
  }, [currentTab?.tabId]);

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
              if (guidance?.steps?.length && isSameDomain(url, pageUrl)) {
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
              // 모든 단계가 완료되었을 때만 자동으로 다음 단계 요청
              setTimeout(() => {
                handleRequestPageGuidance();
              }, 300);
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
                }, 300);
              }
            }
          }
        }
      });
    });
  }, [handleRequestPageGuidance, pageUrl]);

  if (!plan) return null;

  // 같은 도메인의 모든 단계를 합쳐서 표시
  const getMergedGuidanceForDomain = useCallback((targetUrl) => {
    // 선택된 도메인 URL이 있으면 해당 도메인의 guidance 표시
    const displayUrl = targetUrl || pageUrl;
    if (!displayUrl) return null;
    
    const targetDomain = getDomainFromUrl(displayUrl);
    if (!targetDomain) return guidanceByUrl[displayUrl] || null;
    
    // 같은 도메인의 모든 URL에서 단계 수집
    const allSteps = [];
    const urlToSteps = {};
    
    for (const [url, guidance] of Object.entries(guidanceByUrl)) {
      if (guidance?.steps?.length && isSameDomain(url, displayUrl)) {
        urlToSteps[url] = guidance.steps;
        // 각 단계에 출처 URL 정보 추가
        guidance.steps.forEach((step, idx) => {
          // 잘못된 단계 필터링: {"steps": []} 같은 JSON 문자열이 텍스트로 저장된 경우 제외
          if (step.text && (
            step.text.trim().startsWith('{"steps"') || 
            step.text.trim().startsWith('{"') && step.text.includes('"steps"')
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
    
    return {
      steps: allSteps,
      urlToSteps, // URL별 단계 매핑 (완료 상태 관리용)
    };
  }, [pageUrl, guidanceByUrl]);

  // 선택된 도메인이 있으면 해당 도메인의 guidance, 없으면 현재 페이지의 guidance
  const mergedGuidance = getMergedGuidanceForDomain(selectedDomainUrl);
  const pageGuidance = mergedGuidance || (pageUrl ? guidanceByUrl[pageUrl] : null);
  const loadingGuide = pageUrl && loadingGuideUrl === pageUrl;
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
    
    // 매칭되는 step이 없으면 도메인에서 추출
    const domain = getDomainFromUrl(displayUrl);
    if (domain) {
      // 도메인에서 서브도메인 제거 (예: www.github.com -> github.com)
      const parts = domain.split('.');
      if (parts.length > 2) {
        return parts.slice(-2).join('.').split('.')[0]; // github.com -> github
      }
      return parts[0]; // github.com -> github
    }
    
    return null;
  }, [pageUrl, plan]);

  const currentDomainName = getDomainNameForTitle(selectedDomainUrl);
  const pageGuidanceTitle = currentDomainName ? `${currentDomainName}에서 할 일` : '이 페이지에서 할 일';

  return (
    <div className="guide">
      {/* 현재 위치 배너 */}
      {detectedToolId && (
        <div className="detected-banner">
          <span className="detected-icon">📍</span>
          <span>
            지금 <strong>{plan.tools.find(t => t.id === detectedToolId)?.name || detectedToolId}</strong>에 있어요
          </span>
        </div>
      )}

      {/* 전체 진행률: AI 단계 완료 기준 자동 트래킹 + 사이트 링크 (위치: 이 페이지에서 할 일 위) */}
      <div className="guide-progress guide-progress-icons">
        <div className="progress-info">
          <span className="progress-label">전체 진행률</span>
          <span className="progress-count">{doneDomains}/{totalDomains} 도메인 완료</span>
        </div>
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${progressPct}%` }} />
        </div>
        <div className="progress-tool-icons">
          {(plan.steps || []).map((step) => {
            const done = stepDoneByToolId[step.toolId] === true;
            const icon = step.toolIcon || plan.tools?.find(t => t.id === step.toolId)?.logo || '•';
            return (
              <span
                key={step.stepId}
                className={`progress-tool-icon ${done ? 'done' : ''}`}
                title={step.title}
              >
                {done ? '✅' : icon}
              </span>
            );
          })}
        </div>
        <div className="progress-site-links">
          {(plan.steps || []).map((step, idx) => {
            const icon = step.toolIcon || plan.tools?.find(t => t.id === step.toolId)?.logo || '•';
            const url = step.url || plan.tools?.find(t => t.id === step.toolId)?.url;
            const name = step.toolName || plan.tools?.find(t => t.id === step.toolId)?.name || step.title;
            if (!url) return null;
            const isSelected = selectedDomainUrl && isSameDomain(url, selectedDomainUrl);
            return (
              <div key={step.stepId} className="progress-site-link-wrapper">
                <a
                  className={`progress-site-link ${isSelected ? 'active' : ''}`}
                  href={url}
                  onClick={(e) => { 
                    e.preventDefault(); 
                    handleSwitchToDomain(url); 
                  }}
                >
                  <span className="progress-site-link-num">{idx + 1}.</span>
                  <span className="progress-site-link-icon">{icon}</span>
                  <span className="progress-site-link-label"><strong>{name}</strong></span>
                </a>
                <button
                  className="progress-site-link-clip"
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleOpenTool(url);
                  }}
                  title="새 탭에서 열기"
                >
                  📎
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* 이 페이지에서 할 일 (AI 단계별 가이드) - URL별 캐시 유지 */}
      {currentTab?.tabId && (
        <div className="page-guidance-section" ref={pageGuidanceSectionRef}>
          <h3 className="page-guidance-title">{pageGuidanceTitle}</h3>
          {incompleteStepMessage && (
            <div className="page-guidance-warning" style={{
              padding: '12px',
              marginBottom: '12px',
              backgroundColor: '#fff3cd',
              border: '1px solid #ffc107',
              borderRadius: '4px',
              color: '#856404',
            }}>
              <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>
                ⚠️ 먼저 다음 단계를 완료해주세요
              </div>
              <div style={{ marginBottom: '8px' }}>
                "{incompleteStepMessage.text}"
              </div>
              <div style={{ fontSize: '0.9em', color: '#856404' }}>
                해당 단계를 완료한 후 다시 시도해주세요.
              </div>
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => setIncompleteStepMessage(null)}
                style={{ marginTop: '8px' }}
              >
                닫기
              </button>
            </div>
          )}
          {!loadingGuide && (
            <button type="button" className="btn-primary btn-guidance-request" onClick={handleRequestPageGuidance}>
              {pageGuidance?.steps?.length ? '✨ 다음 단계 받기' : '✨ AI 안내 받기'}
            </button>
          )}
          {loadingGuide && (
            <div className="page-guidance-loading">
              <span className="loading-dot" /> 페이지를 분석하고 있어요...
            </div>
          )}
          {pageGuidance?.error && (
            <div className="page-guidance-error">
              <p>{pageGuidance.error}</p>
              <button type="button" className="btn-secondary btn-sm" onClick={handleRequestPageGuidance}>
                다시 시도
              </button>
            </div>
          )}
          {pageGuidance?.steps && pageGuidance.steps.length > 0 && (
            <div className="page-guidance-steps">
              {pageGuidance.steps
                .filter((step) => {
                  // 잘못된 단계 필터링: {"steps": []} 같은 JSON 문자열이 텍스트로 저장된 경우 제외
                  if (!step.text) return false;
                  const text = step.text.trim();
                  if (text.startsWith('{"steps"') || (text.startsWith('{"') && text.includes('"steps"'))) {
                    return false;
                  }
                  return true;
                })
                .map((step, idx) => {
                // mergedGuidance인 경우 sourceUrl과 sourceIndex 사용, 아니면 pageUrl과 idx 사용
                const sourceUrl = step.sourceUrl || pageUrl;
                const sourceIndex = step.sourceIndex !== undefined ? step.sourceIndex : idx;
                const completed = (pageStepCompletions[sourceUrl] && pageStepCompletions[sourceUrl][sourceIndex]) === true;
                const isCompletionMessage = step.isCompletionMessage === true;
                
                return (
                  <div key={`${sourceUrl}-${sourceIndex}`} className={`page-guidance-step ${completed || isCompletionMessage ? 'done' : ''}`}>
                    <div className="page-guidance-step-header">
                      {!isCompletionMessage && <span className="page-guidance-step-num">{idx + 1}</span>}
                      <span className="page-guidance-step-text">{step.text}</span>
                    </div>
                    {!isCompletionMessage && (
                      <div className="page-guidance-step-actions">
                        {(step.selector || (step.backendDOMNodeId != null && Number.isFinite(Number(step.backendDOMNodeId)))) && (
                          <button
                            type="button"
                            className="btn-spotlight"
                            onClick={() => handleSpotlight(step)}
                          >
                            📍 위치로 이동
                          </button>
                        )}
                        <button
                          type="button"
                          className={completed ? 'btn-undo btn-sm' : 'btn-done btn-sm'}
                          onClick={() => savePageStepCompletion(sourceUrl, sourceIndex, !completed)}
                        >
                          {completed ? '되돌리기' : '완료 ✓'}
                        </button>
                        <button
                          type="button"
                          className="btn-text btn-sm"
                          onClick={() => {
                            if (confirm('이 단계를 제거하시겠습니까?')) {
                              removeStep(sourceUrl, sourceIndex);
                            }
                          }}
                          style={{ color: '#999', fontSize: '0.85em' }}
                          title="단계 제거"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
              <div className="page-guidance-progress">
                <span className="page-guidance-progress-text">
                  {pageGuidance.steps.filter((step, idx) => {
                    const sourceUrl = step.sourceUrl || pageUrl;
                    const sourceIndex = step.sourceIndex !== undefined ? step.sourceIndex : idx;
                    return (pageStepCompletions[sourceUrl] && pageStepCompletions[sourceUrl][sourceIndex]) === true;
                  }).length}/{pageGuidance.steps.length} 완료
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {isAllDone && (
        <div className="all-done-banner">
          <div className="all-done-emoji">🎉</div>
          <h3>모든 단계를 완료했어요!</h3>
          <p>사이트가 완성됐습니다. 축하해요!</p>
          <button className="btn-secondary" onClick={onReset}>
            처음부터 다시 시작
          </button>
        </div>
      )}

      <div className="guide-footer">
        <button className="btn-text" onClick={onReset}>
          🔄 처음부터 다시 설정
        </button>
      </div>
    </div>
  );
}
