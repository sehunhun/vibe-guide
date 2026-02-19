import React, { useState, useEffect, useCallback } from 'react';
import { storage } from '../data/planner.js';

/**
 * Guide - Step2 메인 화면
 * - plan의 steps를 툴별로 그룹화해서 보여줌
 * - currentTab.url을 보고 현재 어떤 툴 사이트에 있는지 감지
 * - 해당 스텝을 자동으로 하이라이트
 * - 스텝 완료 버튼으로 진행 상황 업데이트
 */

// 툴 공식 도메인 매핑
const TOOL_DOMAINS = {
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

// plan의 steps를 툴별로 그룹화
function groupStepsByTool(steps) {
  const groups = [];
  let current = null;
  for (const step of steps) {
    if (!current || current.toolId !== step.toolId) {
      current = { toolId: step.toolId, toolName: step.toolName, toolIcon: step.toolIcon, steps: [] };
      groups.push(current);
    }
    current.steps.push(step);
  }
  return groups;
}

export default function Guide({ plan, currentTab, onPlanUpdate, onReset }) {
  const [activeToolId, setActiveToolId] = useState(null); // 현재 열린 툴 섹션
  const [detectedToolId, setDetectedToolId] = useState(null); // URL로 감지된 툴
  const [completingStep, setCompletingStep] = useState(null);

  // URL 변경 시 현재 어떤 툴 사이트인지 감지
  useEffect(() => {
    if (currentTab?.hostname) {
      const detected = detectCurrentTool(currentTab.hostname);
      setDetectedToolId(detected);
      // 감지된 툴 섹션 자동 열기
      if (detected) {
        setActiveToolId(detected);
      }
    }
  }, [currentTab]);

  // 초기 활성 툴 = plan의 currentStep 기준
  useEffect(() => {
    if (!plan) return;
    const currentStep = plan.steps.find(s => s.stepId === plan.currentStepId);
    if (currentStep) {
      setActiveToolId(currentStep.toolId);
    } else if (plan.tools[0]) {
      setActiveToolId(plan.tools[0].id);
    }
  }, [plan?.currentStepId]);

  const handleStepDone = useCallback(async (stepId) => {
    setCompletingStep(stepId);
    const updated = await storage.updateStepStatus(stepId, 'done');
    if (updated) onPlanUpdate(updated);
    setCompletingStep(null);
  }, [onPlanUpdate]);

  const handleStepUndo = useCallback(async (stepId) => {
    const updated = await storage.updateStepStatus(stepId, 'pending');
    if (updated) onPlanUpdate(updated);
  }, [onPlanUpdate]);

  const handleOpenTool = (url) => {
    chrome.tabs.create({ url });
  };

  if (!plan) return null;

  const toolGroups = groupStepsByTool(plan.steps);
  const totalSteps = plan.steps.length;
  const doneSteps = plan.steps.filter(s => s.status === 'done').length;
  const progressPct = totalSteps > 0 ? Math.round((doneSteps / totalSteps) * 100) : 0;
  const isAllDone = doneSteps === totalSteps;

  return (
    <div className="guide">
      {/* 현재 위치 배너 (툴 사이트 감지됐을 때) */}
      {detectedToolId && (
        <div className="detected-banner">
          <span className="detected-icon">📍</span>
          <span>
            지금 <strong>{plan.tools.find(t => t.id === detectedToolId)?.name || detectedToolId}</strong>에 있어요
          </span>
        </div>
      )}

      {/* 전체 진행률 */}
      <div className="guide-progress">
        <div className="progress-info">
          <span className="progress-label">전체 진행률</span>
          <span className="progress-count">{doneSteps}/{totalSteps} 완료</span>
        </div>
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      {/* 완료 상태 */}
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

      {/* 툴 그룹별 스텝 */}
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
              className={`tool-group ${isActive ? 'active' : ''} ${isDetected ? 'detected' : ''} ${isGroupDone ? 'done' : ''}`}
            >
              {/* 툴 헤더 */}
              <button
                className="tool-group-header"
                onClick={() => setActiveToolId(isActive ? null : group.toolId)}
              >
                <div className="tool-group-left">
                  <span className="tool-order">{gIdx + 1}</span>
                  <span className="tool-icon">{group.toolIcon}</span>
                  <div className="tool-group-info">
                    <span className="tool-group-name">{group.toolName}</span>
                    {toolInfo && (
                      <span className="tool-group-role">{toolInfo.role}</span>
                    )}
                  </div>
                </div>
                <div className="tool-group-right">
                  {isDetected && <span className="here-badge">여기!</span>}
                  <span className="group-count">
                    {isGroupDone ? '✅' : `${groupDone}/${groupTotal}`}
                  </span>
                  <span className="chevron">{isActive ? '▲' : '▼'}</span>
                </div>
              </button>

              {/* 스텝 목록 */}
              {isActive && (
                <div className="tool-group-steps">
                  {/* 툴 바로가기 버튼 */}
                  {toolInfo?.url && (
                    <button
                      className="tool-goto-btn"
                      onClick={() => handleOpenTool(toolInfo.url)}
                    >
                      <span>🔗</span>
                      <span>{toolInfo.name} 열기</span>
                    </button>
                  )}

                  {group.steps.map((step, sIdx) => {
                    const isCurrentStep = step.stepId === plan.currentStepId;
                    const isDone = step.status === 'done';
                    const isCompleting = completingStep === step.stepId;

                    return (
                      <div
                        key={step.stepId}
                        className={`step-item ${isDone ? 'done' : ''} ${isCurrentStep ? 'current' : ''}`}
                      >
                        <div className="step-indicator">
                          {isDone ? (
                            <span className="step-check">✓</span>
                          ) : isCurrentStep ? (
                            <span className="step-dot current" />
                          ) : (
                            <span className="step-dot" />
                          )}
                          {sIdx < group.steps.length - 1 && (
                            <span className="step-line" />
                          )}
                        </div>
                        <div className="step-content">
                          <div className="step-header">
                            <span className="step-title">{step.title}</span>
                            {isCurrentStep && !isDone && (
                              <span className="current-badge">지금</span>
                            )}
                          </div>
                          <p className="step-desc">{step.desc}</p>
                          <div className="step-actions">
                            {!isDone ? (
                              <button
                                className={`btn-done ${isCompleting ? 'loading' : ''}`}
                                onClick={() => handleStepDone(step.stepId)}
                                disabled={isCompleting}
                              >
                                {isCompleting ? '저장 중...' : '완료 ✓'}
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
              )}
            </div>
          );
        })}
      </div>

      {/* 설문 다시 하기 */}
      <div className="guide-footer">
        <button className="btn-text" onClick={onReset}>
          🔄 처음부터 다시 설정
        </button>
      </div>
    </div>
  );
}
