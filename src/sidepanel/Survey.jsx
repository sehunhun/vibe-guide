import React, { useState } from 'react';
import { getSurveyTools, getStoredAISettings } from '../data/ai.js';
import { storage, getUniqueServicesFromSelectedTools, buildSurveyPayload } from '../data/planner.js';

const SINGLE_QUESTION = '어떤 웹사이트를 만들고 싶으신가요?';

export default function Survey({ onComplete }) {
  const [step, setStep] = useState(0);
  const [siteGoal, setSiteGoal] = useState('');
  const [aiTools, setAiTools] = useState([]);
  const [selectedToolIds, setSelectedToolIds] = useState(new Set());
  const [submitLoading, setSubmitLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [plan, setPlan] = useState(null);

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

  async function handleStart() {
    const selected = aiTools.filter(t => selectedToolIds.has(t.id));
    const payload = buildSurveyPayload({
      siteGoal: siteGoal.trim(),
      selectedTools: selected,
    });
    await storage.savePlan(payload);
    setPlan(payload);
    setShowResult(true);
  }

  async function handleOpenGuide() {
    const firstStep = plan?.steps?.[0];
    const targetUrl = firstStep?.url || plan?.tools?.find(t => t.id === firstStep?.toolId)?.url;
    if (targetUrl) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs[0];
        if (activeTab?.id) chrome.tabs.update(activeTab.id, { url: targetUrl });
      });
    }
    onComplete(plan);
  }

  if (showResult && plan) {
    return <PlanResult plan={plan} onStart={handleOpenGuide} />;
  }

  const selectedTools = step === 2 ? aiTools.filter(t => selectedToolIds.has(t.id)) : [];
  const uniqueServices = step === 2 ? getUniqueServicesFromSelectedTools(selectedTools) : [];

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
            <p className="question-hint">아래 서비스들로 시작할 수 있어요</p>
          </div>
          <div className="services-summary-list">
            {uniqueServices.map(s => (
              <div key={s.id} className="service-summary-item">
                <span className="service-summary-icon">{s.icon}</span>
                <span className="service-summary-name">{s.name}</span>
              </div>
            ))}
          </div>
          <button className="btn-primary btn-start-inline" onClick={handleStart}>
            시작하기 🚀
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

function PlanResult({ plan, onStart }) {
  const mainTool = plan.tools?.[0];
  const subTools = (plan.tools || []).slice(1);

  return (
    <div className="plan-result">
      <div className="result-header">
        <div className="result-emoji">🎯</div>
        <h2>딱 맞는 플랜을 찾았어요!</h2>
        <p className="result-desc">총 <strong>{plan.steps?.length ?? 0}단계</strong>로 진행할게요</p>
      </div>
      {mainTool && (
        <div className="result-main-tool">
          <span className="tool-badge main">메인 툴</span>
          <div className="tool-card featured">
            <span className="tool-logo">{mainTool.logo}</span>
            <div className="tool-info">
              <strong className="tool-name">{mainTool.name}</strong>
              <span className="tool-role">{mainTool.role}</span>
              {mainTool.tagline && <p className="tool-desc">{mainTool.tagline}</p>}
            </div>
          </div>
        </div>
      )}
      {subTools.length > 0 && (
        <div className="result-sub-tools">
          <span className="tool-badge sub">보조 툴</span>
          <div className="sub-tools-list">
            {subTools.map(tool => (
              <div key={tool.id} className="tool-card small">
                <span className="tool-logo">{tool.logo}</span>
                <div className="tool-info">
                  <strong className="tool-name">{tool.name}</strong>
                  <span className="tool-role">{tool.role}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {plan.steps?.length > 0 && (
        <div className="result-steps-preview">
          <h3>진행 순서</h3>
          <div className="steps-preview-list">
            {plan.steps.slice(0, 5).map((s, i) => (
              <div key={s.stepId} className="step-preview-item">
                <span className="step-num">{i + 1}</span>
                <div>
                  <span className="step-tool-icon">{s.toolIcon}</span>
                  <span className="step-title">{s.title}</span>
                </div>
              </div>
            ))}
            {plan.steps.length > 5 && <p className="steps-more">+ {plan.steps.length - 5}단계 더...</p>}
          </div>
        </div>
      )}
      <button className="btn-primary btn-start" onClick={onStart}>시작하기 🚀</button>
    </div>
  );
}
