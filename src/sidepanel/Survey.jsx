import React, { useState } from 'react';
import { getSurveyTools, getStoredAISettings, getUILocale } from '../data/ai.js';
import {
  storage,
  getUniqueServicesFromSelectedTools,
  buildSurveyPayload,
  buildRequirementObjects,
  REQUIREMENT_TO_SERVICE,
  getPlannerMessages,
} from '../data/planner.js';

export default function Survey({ onComplete }) {
  const [step, setStep] = useState(0);
  const [siteGoal, setSiteGoal] = useState('');
  const [aiTools, setAiTools] = useState([]);
  const [selectedToolIds, setSelectedToolIds] = useState(new Set());
  const [submitLoading, setSubmitLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expandedServiceId, setExpandedServiceId] = useState(null);

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
      // 기본값으로 모두 선택하지 않고, 사용자가 직접 선택하도록 비워둠
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
    if (chrome.tabs) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) chrome.tabs.update(tabs[0].id, { url: aiStudioUrl });
      });
    }
    onComplete(payload);
  }

  const selectedTools = step === 2 ? aiTools.filter(t => selectedToolIds.has(t.id)) : [];
  const uniqueServices = step === 2 ? getUniqueServicesFromSelectedTools(selectedTools) : [];
  const requirementObjects = step === 2 ? buildRequirementObjects(selectedTools) : [];

  return (
    <div className="survey">
      <div className="survey-progress">
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${((step + 1) / 3) * 100}%` }} />
        </div>
        <span className="progress-text">{step + 1} / 3</span>
      </div>

      {step === 0 && (
        <>
          <div className="survey-question">
            <div className="question-emoji">🌐</div>
            <h2 className="question-title">{chrome.i18n.getMessage('surveyQuestion1')}</h2>
            <p className="question-hint">{chrome.i18n.getMessage('surveyHint1')}</p>
          </div>
          <div className="survey-text-wrap">
            <textarea
              className="survey-textarea"
              placeholder={chrome.i18n.getMessage('surveyPlaceholder')}
              value={siteGoal}
              onChange={e => setSiteGoal(e.target.value)}
              rows={3}
              disabled={submitLoading}
            />
          </div>
          {error && <p className="survey-error">{error}</p>}
        </>
      )}

      {step === 1 && (
        <>
          <div className="survey-question">
            <div className="question-emoji">⚙️</div>
            <h2 className="question-title">{chrome.i18n.getMessage('surveyTitleFeatures')}</h2>
            <p className="question-hint">{chrome.i18n.getMessage('surveyHintFeatures')}</p>
          </div>
          <div className="survey-options">
            {aiTools.map(tool => {
              const selected = selectedToolIds.has(tool.id);
              return (
                <button
                  key={tool.id}
                  type="button"
                  className={`option-btn ${selected ? 'selected' : ''}`}
                  onClick={() => toggleTool(tool.id)}
                >
                  <div className="option-check">
                    <span className={`checkbox ${selected ? 'active' : ''}`}>{selected && '✓'}</span>
                  </div>
                  <div className="option-content">
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
          <div className="survey-question">
            <div className="question-emoji">✅</div>
            <h2 className="question-title">{chrome.i18n.getMessage('surveyTitleServices')}</h2>
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
          <button className="btn-primary btn-start-inline" onClick={handleGuideStart}>
            {chrome.i18n.getMessage('surveyBtnStart')} 🚀
          </button>
        </>
      )}

      <div className="survey-nav">
        {step === 0 ? (
          <button
            className="btn-primary"
            disabled={!siteGoal.trim() || submitLoading}
            onClick={handleNext}
          >
            {submitLoading ? chrome.i18n.getMessage('surveyBtnLoading') : chrome.i18n.getMessage('surveyBtnNext') + ' →'}
          </button>
        ) : step === 1 ? (
          <>
            <button className="btn-secondary" onClick={() => setStep(0)}>← {chrome.i18n.getMessage('surveyBtnPrev')}</button>
            <button
              className="btn-primary"
              disabled={selectedToolIds.size === 0}
              onClick={handleNextFromCheckboxes}
            >
              {chrome.i18n.getMessage('surveyBtnNext')} →
            </button>
          </>
        ) : (
          <button className="btn-secondary" onClick={() => setStep(1)}>← {chrome.i18n.getMessage('surveyBtnPrev')}</button>
        )}
      </div>
    </div>
  );
}
