import React, { useState, useEffect } from 'react';
import { QUESTIONS } from '../data/tools.js';
import { buildPlan, storage } from '../data/planner.js';

export default function SurveyApp() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({});
  const [showResult, setShowResult] = useState(false);
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);

  // 이미 플랜이 있으면 '가이드 열기' 안내 화면 (사이드패널로 열림)
  useEffect(() => {
    storage.getPlan().then(saved => {
      if (saved) {
        setPlan(saved);
        setShowResult(true); // 플랜 결과 화면으로 (가이드 시작 버튼 → 사이드패널)
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

  const question = QUESTIONS[step];
  const totalSteps = QUESTIONS.length;
  const isLast = step === totalSteps - 1;

  function toggle(qId, optId, type) {
    if (type === 'single') {
      setAnswers(prev => ({ ...prev, [qId]: optId }));
    } else {
      setAnswers(prev => {
        const cur = prev[qId] || [];
        return {
          ...prev,
          [qId]: cur.includes(optId) ? cur.filter(x => x !== optId) : [...cur, optId],
        };
      });
    }
  }

  function isSelected(qId, optId, type) {
    if (type === 'single') return answers[qId] === optId;
    return (answers[qId] || []).includes(optId);
  }

  function canNext() {
    const val = answers[question.id];
    if (question.type === 'single') return !!val;
    return Array.isArray(val) && val.length > 0;
  }

  async function handleFinish() {
    const newPlan = buildPlan(answers);
    await storage.savePlan(newPlan);
    await storage.saveAnswers(answers);
    setPlan(newPlan);
    setShowResult(true);
  }

  function handleStart() {
    // 클릭이 사용자 제스처이므로 같은 스택에서 사이드패널 열기 시도
    chrome.windows.getCurrent().then(win => {
      if (win?.id) chrome.sidePanel.open({ windowId: win.id });
    }).catch(() => {
      // 제스처 인정 안 되면 가이드 탭으로 이동
      window.location.href = chrome.runtime.getURL('guide.html');
    });
  }

  if (showResult && plan) {
    return <PlanResult plan={plan} onStart={handleStart} />;
  }

  return (
    <div className="survey-page">
      <header className="survey-header">
        <div className="logo">
          <span className="logo-icon">⚡</span>
          <span className="logo-text">UserUse</span>
        </div>
        <span className="step-badge">{step + 1} / {totalSteps}</span>
      </header>

      <div className="survey-body">
        {/* 진행바 */}
        <div className="progress-wrap">
          <div className="progress-track">
            <div
              className="progress-fill"
              style={{ width: `${((step + 1) / totalSteps) * 100}%` }}
            />
          </div>
        </div>

        {/* 질문 */}
        <div className="question-section">
          <div className="question-emoji">{question.emoji}</div>
          <h1 className="question-title">{question.title}</h1>
          {question.type === 'multi' && (
            <p className="question-hint">해당되는 것 모두 선택하세요</p>
          )}
        </div>

        {/* 옵션 */}
        <div className="options-grid">
          {question.options.map(opt => {
            const sel = isSelected(question.id, opt.id, question.type);
            const isDisabled = !!opt.disabled;
            return (
              <button
                key={opt.id}
                type="button"
                className={`option-card ${sel ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}`}
                onClick={() => !isDisabled && toggle(question.id, opt.id, question.type)}
                disabled={isDisabled}
              >
                <div className="option-marker">
                  {question.type === 'single' ? (
                    <span className={`radio-dot ${sel ? 'on' : ''}`} />
                  ) : (
                    <span className={`check-box ${sel ? 'on' : ''}`}>{sel ? '✓' : ''}</span>
                  )}
                </div>
                <div className="option-text">
                  <span className="option-label">{opt.label}</span>
                  {opt.desc && <span className="option-desc">{opt.desc}</span>}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 하단 네비게이션 */}
      <div className="survey-footer">
        {step > 0 ? (
          <button className="btn-back" onClick={() => setStep(s => s - 1)}>
            ← 이전
          </button>
        ) : (
          <div />
        )}
        {!isLast ? (
          <button
            className="btn-next"
            disabled={!canNext()}
            onClick={() => setStep(s => s + 1)}
          >
            다음 →
          </button>
        ) : (
          <button
            className="btn-finish"
            disabled={!canNext()}
            onClick={handleFinish}
          >
            추천 받기 ✨
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

        {/* 메인 툴 */}
        <div className="result-section">
          <div className="section-label main-label">메인 툴</div>
          <div className="tool-card main-card">
            <div className="tool-logo">{mainTool.logo}</div>
            <div className="tool-info">
              <div className="tool-name">{mainTool.name}</div>
              <div className="tool-role">{mainTool.role}</div>
              <div className="tool-tagline">{mainTool.tagline}</div>
            </div>
            <div className="tool-score">
              <span className="score-badge">추천 {mainTool.score}점</span>
            </div>
          </div>
        </div>

        {/* 보조 툴 */}
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

        {/* 단계 미리보기 */}
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
