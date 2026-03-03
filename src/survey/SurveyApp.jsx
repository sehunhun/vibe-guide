import React, { useState, useEffect } from 'react';
import { getSurveyTools, getStoredAISettings } from '../data/ai.js';
import {
  storage,
  getUniqueServicesFromSelectedTools,
  buildSurveyPayload,
  buildRequirementObjects,
  REQUIREMENT_TO_SERVICE,
  SERVICE_DESCRIPTIONS,
} from '../data/planner.js';

const SINGLE_QUESTION = '어떤 웹사이트를 만들고 싶으신가요?';

export default function SurveyApp() {
  const [step, setStep] = useState(0);
  const [siteGoal, setSiteGoal] = useState('');
  const [aiTools, setAiTools] = useState([]);
  const [selectedToolIds, setSelectedToolIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expandedServiceId, setExpandedServiceId] = useState(null);

  useEffect(() => {
    storage.getPlan().then(saved => {
      if (saved?.tools?.length) {
        window.location.href = typeof chrome !== 'undefined' && chrome.runtime?.getURL
          ? chrome.runtime.getURL('guide.html')
          : '/guide.html';
        return;
      }
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="page-loading">
        <div className="spinner" />
      </div>
    );
  }

  async function handleNext() {
    const text = (siteGoal || '').trim();
    if (!text) return;
    setError(null);
    setSubmitLoading(true);
    try {
      const { backendUrl } = await getStoredAISettings();
      const res = await getSurveyTools(backendUrl, text);
      const tools = res.tools || [];
      if (tools.length === 0) {
        setError('추천 도구를 찾지 못했어요. 조금 더 구체적으로 적어주시겠어요?');
        return;
      }
      setAiTools(tools);
      // 기본값으로 모두 선택하지 않고, 사용자가 직접 선택하도록 비워둠
      setSelectedToolIds(new Set());
      setStep(1);
    } catch (e) {
      setError(e.message || '도구 추천을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setSubmitLoading(false);
    }
  }

  function toggleTool(id) {
    setSelectedToolIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleNextFromCheckboxes() {
    setStep(2);
  }

  async function handleGuideStart() {
    const selected = aiTools.filter(t => selectedToolIds.has(t.id));
    const payload = buildSurveyPayload({
      siteGoal: siteGoal.trim(),
      selectedTools: selected,
    });
    await storage.savePlan(payload);
    const firstUrl = payload.steps?.[0]?.url || payload.tools?.[0]?.url;
    if (firstUrl && typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) chrome.tabs.update(tabs[0].id, { url: firstUrl });
      });
    }
    if (typeof chrome !== 'undefined' && chrome.windows && chrome.sidePanel) {
      chrome.windows.getCurrent().then(win => {
        if (win?.id) chrome.sidePanel.open({ windowId: win.id });
      }).catch(() => {
        if (chrome.runtime?.getURL) window.location.href = chrome.runtime.getURL('guide.html');
      });
    } else if (firstUrl) {
      window.location.href = firstUrl;
    } else {
      alert('가이드를 시작하려면 Chrome Extension을 설치해주세요.');
    }
  }

  const selectedTools = step === 2 ? aiTools.filter(t => selectedToolIds.has(t.id)) : [];
  const uniqueServices = step === 2 ? getUniqueServicesFromSelectedTools(selectedTools) : [];
  const requirementObjects = step === 2 ? buildRequirementObjects(selectedTools) : [];

  return (
    <div className="survey-page">
      <header className="survey-header">
        <button type="button" className="logo logo-btn" onClick={() => setStep(0)} aria-label="첫 단계로">
          <span className="logo-icon">⚡</span>
          <span className="logo-text">UserUse</span>
        </button>
        <span className="step-badge">{step + 1} / 3</span>
      </header>

      <div className="survey-body">
        <div className="progress-wrap">
          <div className="progress-track">
            <div
              className="progress-fill"
              style={{ width: `${((step + 1) / 3) * 100}%` }}
            />
          </div>
        </div>

        {step === 0 && (
          <>
            <div className="question-section">
              <div className="question-emoji">🌐</div>
              <h1 className="question-title">{SINGLE_QUESTION}</h1>
              <p className="question-hint">예: 랜딩페이지, 쇼핑몰, 블로그, 회원제 서비스 등</p>
            </div>
            <div className="survey-text-wrap">
              <textarea
                className="survey-textarea"
                placeholder="원하는 웹사이트를 자유롭게 적어주세요."
                value={siteGoal}
                onChange={e => setSiteGoal(e.target.value)}
                rows={4}
                disabled={submitLoading}
              />
            </div>
            {error && <p className="survey-error">{error}</p>}
          </>
        )}

        {step === 1 && (
          <>
            <div className="question-section">
              <div className="question-emoji">⚙️</div>
              <h1 className="question-title">필요한 기능을 선택해주세요</h1>
              <p className="question-hint">해당되는 것 모두 선택하세요</p>
            </div>
            <div className="options-grid">
              {aiTools.map(tool => {
                const sel = selectedToolIds.has(tool.id);
                return (
                  <button
                    key={tool.id}
                    type="button"
                    className={`option-card ${sel ? 'selected' : ''}`}
                    onClick={() => toggleTool(tool.id)}
                  >
                    <div className="option-marker">
                      <span className={`check-box ${sel ? 'on' : ''}`}>{sel ? '✓' : ''}</span>
                    </div>
                    <div className="option-text">
                      <span className="option-label">{tool.description}</span>
                      {tool.requirements?.length > 0 && (
                        <span className="option-desc">
                          {tool.requirements.join(', ')}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="question-section">
              <div className="question-emoji">✅</div>
              <h1 className="question-title">선택한 서비스</h1>
              <p className="question-hint">도구를 누르면 설명이 펼쳐져요</p>
            </div>
            <div className="services-summary-list">
              {uniqueServices.map(s => {
                const isOpen = expandedServiceId === s.id;
                const desc = SERVICE_DESCRIPTIONS[s.id];
                const descriptions = requirementObjects
                  .filter(ro => REQUIREMENT_TO_SERVICE[ro.requirement]?.id === s.id)
                  .flatMap(ro => ro.descriptions || []);
                return (
                  <div key={s.id} className="service-summary-item-wrap">
                    <button
                      type="button"
                      className={`service-summary-item ${isOpen ? 'open' : ''}`}
                      onClick={() => setExpandedServiceId(isOpen ? null : s.id)}
                    >
                      <span className="service-summary-icon">{s.icon}</span>
                      <span className="service-summary-name">{s.name}</span>
                      <span className="service-summary-chevron">{isOpen ? '▲' : '▼'}</span>
                    </button>
                    {isOpen && (
                      <div className="service-summary-dropdown">
                        {desc?.summary && (
                          <p className="service-desc-summary">{desc.summary}</p>
                        )}
                        {descriptions.length > 0 && (
                          <p className="service-desc-list">
                            <strong>이번에 쓰는 이유:</strong> {[...new Set(descriptions)].join(', ')}
                          </p>
                        )}
                        {desc?.whyNeeded && (
                          <p className="service-desc-why">{desc.whyNeeded}</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      <div className="survey-footer">
        {step === 0 && (
          <>
            <button className="btn-back" disabled aria-hidden="true">
              ← 이전
            </button>
            <button
              className="btn-next"
              disabled={!siteGoal.trim() || submitLoading}
              onClick={handleNext}
            >
              {submitLoading ? '추천 받는 중…' : '다음 →'}
            </button>
          </>
        )}
        {step === 1 && (
          <>
            <button className="btn-back" onClick={() => setStep(0)}>
              ← 이전
            </button>
            <button
              className="btn-next"
              disabled={selectedToolIds.size === 0}
              onClick={handleNextFromCheckboxes}
            >
              다음 →
            </button>
          </>
        )}
        {step === 2 && (
          <>
            <button className="btn-back" onClick={() => setStep(1)}>
              ← 이전
            </button>
            <button className="btn-next" onClick={handleGuideStart}>
              가이드 시작하기 →
            </button>
          </>
        )}
      </div>
    </div>
  );
}
