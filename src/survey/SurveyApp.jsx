import React, { useState, useEffect } from 'react';
import { getSurveyTools, getStoredAISettings, getUILocale } from '../data/ai.js';
import {
  storage,
  setPlannerLocale,
  getUniqueServicesFromSelectedTools,
  buildSurveyPayload,
  buildRequirementObjects,
  REQUIREMENT_TO_SERVICE,
  getPlannerMessages,
} from '../data/planner.js';

// 첫 렌더 전에 브라우저 UI 언어로 planner 로케일 맞춤
if (typeof getUILocale === 'function') setPlannerLocale(getUILocale());

export default function SurveyApp() {
  const [step, setStep] = useState(0);
  const [siteGoal, setSiteGoal] = useState('');
  const [aiTools, setAiTools] = useState([]);
  const [selectedToolIds, setSelectedToolIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expandedServiceId, setExpandedServiceId] = useState(null);

  // 브라우저 UI 언어에 맞춰 planner(서비스 설명 등) 로케일 동기화
  useEffect(() => {
    setPlannerLocale(getUILocale());
  }, []);

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
      const res = await getSurveyTools(backendUrl, text, getUILocale());
      const tools = res.tools || [];
      if (tools.length === 0) {
        setError(chrome.i18n.getMessage('surveyErrorNoTools'));
        return;
      }
      setAiTools(tools);
      setSelectedToolIds(new Set());
      setStep(1);
    } catch (e) {
      setError(e.message || chrome.i18n.getMessage('surveyErrorLoad'));
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
    const aiStudioUrl = 'https://aistudio.google.com/apps';
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) chrome.tabs.update(tabs[0].id, { url: aiStudioUrl });
      });
    }
    if (typeof chrome !== 'undefined' && chrome.windows && chrome.sidePanel) {
      chrome.windows.getCurrent().then(win => {
        if (win?.id) chrome.sidePanel.open({ windowId: win.id });
      }).catch(() => {
        if (chrome.runtime?.getURL) window.location.href = chrome.runtime.getURL('guide.html');
      });
    } else {
      window.location.href = aiStudioUrl;
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
              <h1 className="question-title">{chrome.i18n.getMessage('surveyQuestion1')}</h1>
              <p className="question-hint">{chrome.i18n.getMessage('surveyHint1')}</p>
            </div>
            <div className="survey-text-wrap">
              <textarea
                className="survey-textarea"
                placeholder={chrome.i18n.getMessage('surveyPlaceholder')}
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
              <h1 className="question-title">{chrome.i18n.getMessage('surveyTitleFeatures')}</h1>
              <p className="question-hint">{chrome.i18n.getMessage('surveyHintFeatures')}</p>
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
              <h1 className="question-title">{chrome.i18n.getMessage('surveyTitleServices')}</h1>
              <p className="question-hint">{chrome.i18n.getMessage('surveyHintServices')}</p>
            </div>
            <div className="services-summary-list">
              {uniqueServices.map(s => {
                const isOpen = expandedServiceId === s.id;
                const desc = getPlannerMessages().serviceDescriptions[s.id];
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
                            <strong>{chrome.i18n.getMessage('surveyReasonLabel')}</strong> {[...new Set(descriptions)].join(', ')}
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
              ← {chrome.i18n.getMessage('surveyBtnPrev')}
            </button>
            <button
              className="btn-next"
              disabled={!siteGoal.trim() || submitLoading}
              onClick={handleNext}
            >
              {submitLoading ? chrome.i18n.getMessage('surveyBtnLoading') : chrome.i18n.getMessage('surveyBtnNext') + ' →'}
            </button>
          </>
        )}
        {step === 1 && (
          <>
            <button className="btn-back" onClick={() => setStep(0)}>
              ← {chrome.i18n.getMessage('surveyBtnPrev')}
            </button>
            <button
              className="btn-next"
              disabled={selectedToolIds.size === 0}
              onClick={handleNextFromCheckboxes}
            >
              {chrome.i18n.getMessage('surveyBtnNext')} →
            </button>
          </>
        )}
        {step === 2 && (
          <>
            <button className="btn-back" onClick={() => setStep(1)}>
              ← {chrome.i18n.getMessage('surveyBtnPrev')}
            </button>
            <button className="btn-next" onClick={handleGuideStart}>
              {chrome.i18n.getMessage('surveyBtnStart')} →
            </button>
          </>
        )}
      </div>
    </div>
  );
}
