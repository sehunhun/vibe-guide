import React, { useState, useEffect, useCallback } from 'react';
import { storage } from '../data/planner.js';

// 툴 공식 도메인 매핑
const TOOL_DOMAINS = {
  framer:    ['framer.com'],
  webflow:   ['webflow.com', 'webflow.io'],
  bubble:    ['bubble.io'],
  bolt:      ['bolt.new', 'stackblitz.com'],
  cursor:    ['cursor.sh', 'cursor.com'],
  lovable:   ['lovable.dev', 'gptengineer.app'],
  softr:     ['softr.io'],
  carrd:     ['carrd.co'],
  teachable: ['teachable.com'],
  notion:    ['notion.so', 'notion.site', 'super.so'],
  replit:    ['replit.com'],
};

function detectTool(hostname) {
  if (!hostname) return null;
  for (const [id, domains] of Object.entries(TOOL_DOMAINS)) {
    if (domains.some(d => hostname === d || hostname.endsWith('.' + d))) return id;
  }
  return null;
}

function groupStepsByTool(steps) {
  const groups = [];
  let cur = null;
  for (const s of steps) {
    if (!cur || cur.toolId !== s.toolId) {
      cur = { toolId: s.toolId, toolName: s.toolName, toolIcon: s.toolIcon, steps: [] };
      groups.push(cur);
    }
    cur.steps.push(s);
  }
  return groups;
}

export default function GuideApp() {
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeToolId, setActiveToolId] = useState(null);
  const [detectedToolId, setDetectedToolId] = useState(null);
  // 현재 탭 context: { tabId, url, hostname }
  const [currentTab, setCurrentTab] = useState(null);
  const [completing, setCompleting] = useState(null);

  // 플랜 로드
  useEffect(() => {
    storage.getPlan().then(saved => {
      if (!saved) {
        // 플랜 없으면 설문으로 이동
        window.location.href = chrome.runtime.getURL('survey.html');
        return;
      }
      setPlan(saved);
      // 현재 스텝의 툴을 기본 열기
      const cur = saved.steps.find(s => s.stepId === saved.currentStepId);
      setActiveToolId(cur?.toolId || saved.tools[0]?.id || null);
      setLoading(false);
    });
  }, []);

  // background로부터 탭 변경 메시지 수신
  // guide.html은 별도 탭이므로 chrome.runtime.onMessage로 직접 수신
  useEffect(() => {
    const handler = (msg) => {
      if (msg.type === 'TAB_CHANGED') {
        setCurrentTab({ tabId: msg.tabId, url: msg.url, hostname: msg.hostname });
        const detected = detectTool(msg.hostname);
        setDetectedToolId(detected);
        if (detected) setActiveToolId(detected);
      }
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, []);

  // 현재 활성 탭 초기값 (guide.html 자신이 아닌 다른 탭)
  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      // guide.html 탭 자신은 제외
      const tab = tabs.find(t => t.url && !t.url.startsWith('chrome-extension://'));
      if (tab?.url) {
        try {
          const hostname = new URL(tab.url).hostname;
          setCurrentTab({ tabId: tab.id, url: tab.url, hostname });
          const detected = detectTool(hostname);
          setDetectedToolId(detected);
          if (detected) setActiveToolId(detected);
        } catch {}
      }
    });
  }, []);

  const handleStepDone = useCallback(async (stepId) => {
    setCompleting(stepId);
    const updated = await storage.updateStepStatus(stepId, 'done');
    if (updated) setPlan(updated);
    setCompleting(null);
  }, []);

  const handleStepUndo = useCallback(async (stepId) => {
    const updated = await storage.updateStepStatus(stepId, 'pending');
    if (updated) setPlan(updated);
  }, []);

  const handleOpenTool = (url) => {
    chrome.tabs.create({ url });
  };

  const handleReset = async () => {
    await storage.clearAll();
    window.location.href = chrome.runtime.getURL('survey.html');
  };

  if (loading) {
    return (
      <div className="page-loading">
        <div className="spinner" />
      </div>
    );
  }

  if (!plan) return null;

  const toolGroups = groupStepsByTool(plan.steps);
  const doneCount = plan.steps.filter(s => s.status === 'done').length;
  const totalCount = plan.steps.length;
  const pct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
  const isAllDone = doneCount === totalCount;

  return (
    <div className="guide-page">
      {/* 헤더 */}
      <header className="guide-header">
        <div className="logo">
          <span className="logo-icon">⚡</span>
          <span className="logo-text">VibeGuide</span>
        </div>
        <div className="header-right">
          <span className="progress-badge">{pct}%</span>
          <button className="btn-reset" onClick={handleReset} title="처음부터 다시">
            🔄
          </button>
        </div>
      </header>

      {/* 현재 탭 감지 배너 */}
      {detectedToolId && currentTab && (
        <div className="detected-banner">
          <span>📍</span>
          <span>
            지금 <strong>{plan.tools.find(t => t.id === detectedToolId)?.name || detectedToolId}</strong>에 있어요
          </span>
          <span className="detected-url">{currentTab.hostname}</span>
        </div>
      )}

      {/* 전체 진행률 */}
      <div className="guide-progress-section">
        <div className="progress-info">
          <span className="progress-label">전체 진행률</span>
          <span className="progress-count">{doneCount} / {totalCount} 완료</span>
        </div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* 완료 배너 */}
      {isAllDone && (
        <div className="all-done-banner">
          <div className="all-done-emoji">🎉</div>
          <h3>모든 단계를 완료했어요!</h3>
          <p>사이트가 완성됐습니다. 축하해요!</p>
          <button className="btn-secondary" onClick={handleReset}>처음부터 다시</button>
        </div>
      )}

      {/* 플랜 개요 */}
      <div className="plan-overview">
        <div className="plan-tools-row">
          {plan.tools.map((t, i) => (
            <div key={t.id} className={`plan-tool-chip ${activeToolId === t.id ? 'active' : ''}`}
              onClick={() => setActiveToolId(t.id)}>
              <span>{t.logo}</span>
              <span className="chip-name">{t.name}</span>
              <span className="chip-order">{i + 1}순위</span>
            </div>
          ))}
        </div>
        {plan.tools[0] && (
          <div className="plan-desc">
            <strong>{plan.tools[0].name}</strong>으로 시작해서{' '}
            {plan.tools.slice(1).map(t => t.name).join(' → ')} 순서로 진행해요.
          </div>
        )}
      </div>

      {/* 툴 그룹 아코디언 */}
      <div className="tool-groups">
        {toolGroups.map((group, gIdx) => {
          const isActive = activeToolId === group.toolId;
          const isDetected = detectedToolId === group.toolId;
          const groupDone = group.steps.filter(s => s.status === 'done').length;
          const groupTotal = group.steps.length;
          const isGroupDone = groupDone === groupTotal;
          const toolInfo = plan.tools.find(t => t.id === group.toolId);

          return (
            <div
              key={group.toolId}
              className={`tool-group ${isActive ? 'active' : ''} ${isDetected ? 'detected' : ''} ${isGroupDone ? 'all-done' : ''}`}
            >
              <button
                className="tool-group-header"
                onClick={() => setActiveToolId(isActive ? null : group.toolId)}
              >
                <div className="group-left">
                  <span className="group-order">{gIdx + 1}</span>
                  <span className="group-icon">{group.toolIcon}</span>
                  <div className="group-info">
                    <span className="group-name">{group.toolName}</span>
                    {toolInfo?.role && <span className="group-role">{toolInfo.role}</span>}
                  </div>
                </div>
                <div className="group-right">
                  {isDetected && <span className="here-tag">여기!</span>}
                  <span className="group-count">
                    {isGroupDone ? '✅' : `${groupDone}/${groupTotal}`}
                  </span>
                  <span className="chevron">{isActive ? '▲' : '▼'}</span>
                </div>
              </button>

              {isActive && (
                <div className="tool-group-body">
                  {/* 툴 바로가기 */}
                  {toolInfo?.url && (
                    <button
                      className="tool-open-btn"
                      onClick={() => handleOpenTool(toolInfo.url)}
                    >
                      <span>🔗</span>
                      <span>{toolInfo.name} 열기</span>
                      <span className="open-arrow">↗</span>
                    </button>
                  )}

                  {/* 스텝 목록 */}
                  <div className="steps-list">
                    {group.steps.map((step, sIdx) => {
                      const isCurrent = step.stepId === plan.currentStepId;
                      const isDone = step.status === 'done';
                      const isComp = completing === step.stepId;

                      return (
                        <div
                          key={step.stepId}
                          className={`step-item ${isDone ? 'done' : ''} ${isCurrent ? 'current' : ''}`}
                        >
                          <div className="step-left">
                            <div className="step-icon">
                              {isDone ? <span className="icon-done">✓</span>
                                : isCurrent ? <span className="icon-current" />
                                : <span className="icon-pending">{sIdx + 1}</span>}
                            </div>
                            {sIdx < group.steps.length - 1 && <div className="step-line" />}
                          </div>
                          <div className="step-body">
                            <div className="step-head">
                              <span className="step-title">{step.title}</span>
                              {isCurrent && !isDone && <span className="now-badge">지금</span>}
                            </div>
                            <p className="step-desc">{step.desc}</p>
                            <div className="step-actions">
                              {!isDone ? (
                                <button
                                  className={`btn-done ${isComp ? 'loading' : ''}`}
                                  onClick={() => handleStepDone(step.stepId)}
                                  disabled={isComp}
                                >
                                  {isComp ? '저장 중...' : '완료 ✓'}
                                </button>
                              ) : (
                                <button
                                  className="btn-undo"
                                  onClick={() => handleStepUndo(step.stepId)}
                                >
                                  되돌리기
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="guide-footer">
        <button className="btn-text" onClick={handleReset}>
          🔄 처음부터 다시 설정하기
        </button>
      </div>
    </div>
  );
}
