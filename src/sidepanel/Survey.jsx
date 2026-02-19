import React, { useState } from 'react';
import { QUESTIONS } from '../data/tools.js';
import { buildPlan, storage } from '../data/planner.js';

export default function Survey({ onComplete }) {
  const [step, setStep] = useState(0); // 현재 질문 인덱스
  const [answers, setAnswers] = useState({}); // { skill: 'none', features: ['payment', ...], ... }
  const [showResult, setShowResult] = useState(false);
  const [plan, setPlan] = useState(null);

  const question = QUESTIONS[step];
  const isLast = step === QUESTIONS.length - 1;
  const totalSteps = QUESTIONS.length;

  function toggleAnswer(qId, optId, type) {
    if (type === 'single') {
      setAnswers(prev => ({ ...prev, [qId]: optId }));
    } else {
      // multi
      setAnswers(prev => {
        const current = prev[qId] || [];
        const next = current.includes(optId)
          ? current.filter(x => x !== optId)
          : [...current, optId];
        return { ...prev, [qId]: next };
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

  async function handleStart() {
    onComplete(plan);
  }

  if (showResult && plan) {
    return <PlanResult plan={plan} onStart={handleStart} />;
  }

  return (
    <div className="survey">
      {/* 진행바 */}
      <div className="survey-progress">
        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{ width: `${((step + 1) / totalSteps) * 100}%` }}
          />
        </div>
        <span className="progress-text">{step + 1} / {totalSteps}</span>
      </div>

      {/* 질문 */}
      <div className="survey-question">
        <div className="question-emoji">{question.emoji}</div>
        <h2 className="question-title">{question.title}</h2>
        {question.type === 'multi' && (
          <p className="question-hint">해당되는 것 모두 선택</p>
        )}
      </div>

      {/* 옵션 목록 */}
      <div className="survey-options">
        {question.options.map(opt => {
          const selected = isSelected(question.id, opt.id, question.type);
          const isDisabled = !!opt.disabled;
          return (
            <button
              key={opt.id}
              type="button"
              className={`option-btn ${selected ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}`}
              onClick={() => !isDisabled && toggleAnswer(question.id, opt.id, question.type)}
              disabled={isDisabled}
            >
              <div className="option-check">
                {question.type === 'single' ? (
                  <span className={`radio ${selected ? 'active' : ''}`} />
                ) : (
                  <span className={`checkbox ${selected ? 'active' : ''}`}>
                    {selected && '✓'}
                  </span>
                )}
              </div>
              <div className="option-content">
                <span className="option-label">{opt.label}</span>
                {opt.desc && <span className="option-desc">{opt.desc}</span>}
              </div>
            </button>
          );
        })}
      </div>

      {/* 네비게이션 */}
      <div className="survey-nav">
        {step > 0 && (
          <button className="btn-secondary" onClick={() => setStep(s => s - 1)}>
            ← 이전
          </button>
        )}
        {!isLast ? (
          <button
            className="btn-primary"
            disabled={!canNext()}
            onClick={() => setStep(s => s + 1)}
          >
            다음 →
          </button>
        ) : (
          <button
            className="btn-primary btn-finish"
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
    <div className="plan-result">
      <div className="result-header">
        <div className="result-emoji">🎯</div>
        <h2>딱 맞는 플랜을 찾았어요!</h2>
        <p className="result-desc">
          총 <strong>{plan.steps.length}단계</strong>로 진행할게요
        </p>
      </div>

      {/* 메인 툴 */}
      <div className="result-main-tool">
        <span className="tool-badge main">메인 툴</span>
        <div className="tool-card featured">
          <span className="tool-logo">{mainTool.logo}</span>
          <div className="tool-info">
            <strong className="tool-name">{mainTool.name}</strong>
            <span className="tool-role">{mainTool.role}</span>
            <p className="tool-desc">{mainTool.tagline}</p>
          </div>
        </div>
      </div>

      {/* 보조 툴 */}
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

      {/* 스텝 미리보기 */}
      <div className="result-steps-preview">
        <h3>진행 순서</h3>
        <div className="steps-preview-list">
          {plan.steps.slice(0, 5).map((step, i) => (
            <div key={step.stepId} className="step-preview-item">
              <span className="step-num">{i + 1}</span>
              <div>
                <span className="step-tool-icon">{step.toolIcon}</span>
                <span className="step-title">{step.title}</span>
              </div>
            </div>
          ))}
          {plan.steps.length > 5 && (
            <p className="steps-more">+ {plan.steps.length - 5}단계 더...</p>
          )}
        </div>
      </div>

      <button className="btn-primary btn-start" onClick={onStart}>
        시작하기 🚀
      </button>
    </div>
  );
}
