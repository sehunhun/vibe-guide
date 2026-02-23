/**
 * 프롬프트 컨텍스트 생성 함수들
 * 전략/플랜 컨텍스트와 페이지 상태를 생성
 */

import { QUESTIONS } from '../tools.js';
import { PLAN_MODE } from '../planner.js';
import demoGuide from '../guides/demo-guide.md';

/**
 * 설문 응답을 읽기 쉬운 텍스트로 변환
 */
function formatAnswers(answers) {
  if (!answers) return '없음';
  const lines = [];
  for (const q of QUESTIONS) {
    const val = answers[q.id];
    if (val == null) continue;
    const label = q.type === 'multi'
      ? (Array.isArray(val) ? val.map(id => q.options.find(o => o.id === id)?.label).filter(Boolean).join(', ') : '')
      : (q.options.find(o => o.id === val)?.label || val);
    if (label) lines.push(`- ${q.title}: ${label}`);
  }
  return lines.length ? lines.join('\n') : '없음';
}

/**
 * 플랜 요약 생성
 */
function formatPlan(plan) {
  if (!plan) return '없음';
  const current = plan.steps?.find(s => s.stepId === plan.currentStepId);
  const tools = plan.tools?.map(t => t.name).join(' → ') || '';
  const completedCount = plan.steps?.filter(s => s.status === 'done').length ?? 0;
  const totalCount = plan.steps?.length ?? 0;
  
  return {
    goal: current ? `${current.title} — ${current.desc}` : '목표 없음',
    currentPhase: tools || '없음',
    completedSteps: completedCount,
    totalSteps: totalCount,
  };
}

/**
 * 전략/플랜 컨텍스트 생성
 * @param {{ plan: object, answers: object }} context
 * @param {string|null} domainGuide - 도메인별 가이드 문서
 * @returns {string} 플랜 컨텍스트 텍스트
 */
export function buildPlanContext(context, domainGuide = null) {
  const { plan, answers } = context;
  const answersText = formatAnswers(answers);
  const planSummary = formatPlan(plan);
  
  const parts = [
    '[PROJECT CONTEXT]',
    '',
    'Goal:',
    planSummary.goal,
    '',
    'Current Phase:',
    planSummary.currentPhase,
    '',
  ];

  // 데모 모드일 때 데모 가이드 추가
  if (PLAN_MODE === 'demo') {
    parts.push(
      'Demo Guide Ordered Steps:',
      demoGuide,
      ''
    );
  }

  // 도메인별 가이드 문서가 있으면 추가
  if (domainGuide) {
    parts.push(
      'Domain Guide:',
      domainGuide,
      ''
    );
  }

  // 완료된 단계 정보
  parts.push(
    'Completed Steps:',
    planSummary.completedSteps > 0 
      ? `${planSummary.completedSteps} / ${planSummary.totalSteps} completed`
      : 'None',
    ''
  );

  // 이전 단계가 있으면 추가 정보
  if (context.previousStepsForUrl?.steps?.length) {
    const completed = context.previousStepsForUrl.completed || [];
    const lines = context.previousStepsForUrl.steps.map((s, i) => {
      const status = completed[i] ? '(완료)' : '(미완료)';
      return `${i + 1}) ${s.text} ${status}`;
    });
    parts.push(
      'Previous Steps on This Page:',
      lines.join('\n'),
      ''
    );
    
    // 완료되지 않은 첫 번째 단계 정보
    const firstIncompleteIndex = completed.findIndex((done, idx) => !done && idx < context.previousStepsForUrl.steps.length);
    if (firstIncompleteIndex >= 0) {
      parts.push(
        `⚠️ Step ${firstIncompleteIndex + 1} is incomplete. Guide that step or update it.`
      );
    } else {
      parts.push(
        '⚠️ All previous steps are completed. Generate the next new step, or return empty steps if done.'
      );
    }
  }

  return parts.join('\n');
}

/**
 * 페이지 상태 생성
 * @param {string} pageUrl - 현재 페이지 URL
 * @param {{ type: 'html'|'image', content: string }} pageContext - HTML 또는 이미지
 * @param {{ steps: Array<{text,selector?}>, completed: boolean[] }|null} previousStepsForUrl - 이전 단계들
 * @returns {Promise<string>} 페이지 상태 텍스트
 */
export async function buildPageState(pageUrl, pageContext, previousStepsForUrl = null) {
  const parts = [
    '[PAGE INTERACTION ELEMENTS]',
    '',
  ];

  if (pageContext.type === 'html' && pageContext.content) {
    // 백엔드에서 요소 추출하므로 여기서는 빈 배열만 표시
    // 백엔드가 자동으로 채워줌
    parts.push('[]');
  } else if (pageContext.type === 'image' && pageContext.content) {
    parts.push('(Current page screenshot provided as image. Analyze the UI and guide the user.)');
  } else {
    parts.push('[]');
  }

  parts.push('');
  parts.push('Current Page URL:');
  parts.push(pageUrl);

  if (previousStepsForUrl?.steps?.length) {
    parts.push('');
    parts.push('Already Performed Steps on This Page:');
    const completed = previousStepsForUrl.completed || [];
    previousStepsForUrl.steps.forEach((step, i) => {
      const status = completed[i] ? '✓' : '○';
      parts.push(`${status} ${step.text}${step.selector ? ` (${step.selector})` : ''}`);
    });
  }

  return parts.join('\n');
}
