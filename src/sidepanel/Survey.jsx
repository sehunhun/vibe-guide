import React, { useState } from 'react';
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
      const res = await getSurveyTools(backendUrl, text);
      const tools = res.tools || [];
      if (tools.length === 0) {
        setError('추천 도구를 찾지 못했어요. 조금 더 구체적으로 적어주시겠어요?');
        return;
      }
      setAiTools(tools);
      setSelectedToolIds(new Set(tools.map(t => t.id)));
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
    if (firstUrl && chrome.tabs) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) chrome.tabs.update(tabs[0].id, { url: firstUrl });
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
            <h2 className="question-title">{SINGLE_QUESTION}</h2>
            <p className="question-hint">예: 랜딩페이지, 쇼핑몰, 블로그, 회원제 서비스 등</p>
          </div>
          <div className="survey-text-wrap">
            <textarea
              className="survey-textarea"
              placeholder="원하는 웹사이트를 자유롭게 적어주세요."
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
            <h2 className="question-title">필요한 기능을 선택해주세요</h2>
            <p className="question-hint">해당되는 것 모두 선택</p>
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
                    {tool.requirements?.length > 0 && (
                      <span className="option-desc">{tool.requirements.join(', ')}</span>
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
          <div className="survey-question">
            <div className="question-emoji">✅</div>
            <h2 className="question-title">선택한 서비스</h2>
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
          <button className="btn-primary btn-start-inline" onClick={handleGuideStart}>
            가이드 시작하기 🚀
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
            {submitLoading ? '추천 받는 중…' : '다음 →'}
          </button>
        ) : step === 1 ? (
          <>
            <button className="btn-secondary" onClick={() => setStep(0)}>← 이전</button>
            <button
              className="btn-primary"
              disabled={selectedToolIds.size === 0}
              onClick={handleNextFromCheckboxes}
            >
              다음 →
            </button>
          </>
        ) : (
          <button className="btn-secondary" onClick={() => setStep(1)}>← 이전</button>
        )}
      </div>
    </div>
  );
}
