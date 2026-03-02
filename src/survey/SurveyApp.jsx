import React, { useState, useEffect } from 'react';
import { getSurveyTools, getStoredAISettings } from '../data/ai.js';
import { storage, getUniqueServicesFromSelectedTools, buildSurveyPayload } from '../data/planner.js';

const SINGLE_QUESTION = '어떤 웹사이트를 만들고 싶으신가요?';

export default function SurveyApp() {
  const [step, setStep] = useState(0); // 0: 질문 입력, 1: 도구 체크박스, 2: 서비스 요약 + 시작하기
  const [siteGoal, setSiteGoal] = useState('');
  const [aiTools, setAiTools] = useState([]);
  const [selectedToolIds, setSelectedToolIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [plan, setPlan] = useState(null);

  useEffect(() => {
    storage.getPlan().then(saved => {
      if (saved) {
        setPlan(saved);
        setShowResult(true);
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

  function handleOpenGuide() {
    if (typeof chrome !== 'undefined' && chrome.windows && chrome.sidePanel) {
      chrome.windows.getCurrent().then(win => {
        if (win?.id) chrome.sidePanel.open({ windowId: win.id });
      }).catch(() => {
        if (chrome.runtime?.getURL) {
          window.location.href = chrome.runtime.getURL('guide.html');
        }
      });
    } else {
      alert('가이드를 시작하려면 Chrome Extension을 설치해주세요.\n\n설문 결과는 저장되었습니다.');
    }
  }

  if (showResult && plan) {
    return <PlanResult plan={plan} onStart={handleOpenGuide} />;
  }

  const selectedTools = step === 2 ? aiTools.filter(t => selectedToolIds.has(t.id)) : [];
  const uniqueServices = step === 2 ? getUniqueServicesFromSelectedTools(selectedTools) : [];

  return (
    <div className="survey-page">
      <header className="survey-header">
        <div className="logo">
          <span className="logo-icon">⚡</span>
          <span className="logo-text">UserUse</span>
        </div>
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
            <button className="btn-start btn-start-inline" onClick={handleStart}>
              시작하기 🚀
            </button>
          </>
        )}
      </div>

      <div className="survey-footer">
        {step === 0 ? (
          <button
            className="btn-next"
            disabled={!siteGoal.trim() || submitLoading}
            onClick={handleNext}
          >
            {submitLoading ? '추천 받는 중…' : '다음 →'}
          </button>
        ) : step === 1 ? (
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
        ) : (
          <button className="btn-back" onClick={() => setStep(1)}>
            ← 이전
          </button>
        )}
      </div>
    </div>
  );
}

function PlanResult({ plan, onStart }) {
  const mainTool = plan.tools[0];
  const subTools = plan.tools.slice(1);

  return (
    <div className="result-page">
      <header className="survey-header">
        <div className="logo">
          <span className="logo-icon">⚡</span>
          <span className="logo-text">UserUse</span>
        </div>
      </header>

      <div className="result-body">
        <div className="result-hero">
          <div className="result-emoji">🎯</div>
          <h1>딱 맞는 플랜을 찾았어요!</h1>
          <p className="result-subtitle">
            총 <strong>{plan.steps.length}단계</strong>로 진행할게요
          </p>
        </div>

        <div className="result-section">
          <div className="section-label main-label">메인 툴</div>
          <div className="tool-card main-card">
            <div className="tool-logo">{mainTool.logo}</div>
            <div className="tool-info">
              <div className="tool-name">{mainTool.name}</div>
              <div className="tool-role">{mainTool.role}</div>
              <div className="tool-tagline">{mainTool.tagline}</div>
            </div>
            {mainTool.score != null && (
              <div className="tool-score">
                <span className="score-badge">추천 {mainTool.score}점</span>
              </div>
            )}
          </div>
        </div>

        {subTools.length > 0 && (
          <div className="result-section">
            <div className="section-label sub-label">함께 쓰면 좋아요</div>
            <div className="sub-tools-row">
              {subTools.map(tool => (
                <div key={tool.id} className="tool-card sub-card">
                  <div className="tool-logo">{tool.logo}</div>
                  <div className="tool-info">
                    <div className="tool-name">{tool.name}</div>
                    <div className="tool-role">{tool.role}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="result-section">
          <div className="section-label">진행 순서</div>
          <div className="steps-preview">
            {plan.steps.slice(0, 6).map((s, i) => (
              <div key={s.stepId} className="step-preview">
                <span className="step-num">{i + 1}</span>
                <span className="step-tool-icon">{s.toolIcon}</span>
                <span className="step-title">{s.title}</span>
              </div>
            ))}
            {plan.steps.length > 6 && (
              <div className="steps-more">+ {plan.steps.length - 6}단계 더...</div>
            )}
          </div>
        </div>

        <button className="btn-start" onClick={onStart}>
          가이드 시작하기 🚀
        </button>
      </div>
    </div>
  );
}
