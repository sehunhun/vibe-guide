import { TOOLS, QUESTIONS, scoreTool } from './tools.js';

/**
 * demo: 랜딩페이지만, 진행 순서 고정 (Google AI Studio → GitHub → Vercel)
 * production: 설문 기반 툴 추천 + 동적 스텝
 */
export const PLAN_MODE = 'demo'; // 'demo' | 'production'

/**
 * 설문 응답을 받아 툴 플랜을 생성한다.
 * 반환값은 chrome.storage에 저장되며 Step2에서 사용된다.
 *
 * plan 구조:
 * {
 *   answers: { skill, siteType, bizType, features[], budget },
 *   tools: [ { ...tool, score, role, order, guideUrl } ],
 *   steps: [ { stepId, toolId, title, desc, url, status: 'pending'|'done' } ],
 *   createdAt: timestamp,
 *   currentStepId: string,
 * }
 */

// 툴별 역할 정의
const TOOL_ROLES = {
  'google-ai-studio': { role: '랜딩페이지 제작', icon: '🤖' },
  framer:    { role: '웹사이트 제작', icon: '🎨' },
  webflow:   { role: '웹사이트 제작', icon: '🌊' },
  bubble:    { role: '앱 기능 구현', icon: '⚙️' },
  bolt:      { role: 'AI 풀스택 생성', icon: '⚡' },
  cursor:    { role: 'AI 코딩 환경', icon: '🖱️' },
  lovable:   { role: 'AI 앱 빌더', icon: '💜' },
  softr:     { role: '멤버십/포털 제작', icon: '🧱' },
  carrd:     { role: '빠른 원페이지', icon: '📄' },
  teachable: { role: '콘텐츠 판매', icon: '🎓' },
  notion:    { role: '노션 기반 사이트', icon: '📝' },
  replit:    { role: 'AI 코딩+배포', icon: '🔁' },
  vercel:    { role: '배포 & 호스팅', icon: '▲' },
};

// 툴별 단계 생성 템플릿
function generateStepsForTool(tool, order, answers) {
  const base = [
    {
      title: `${tool.name} 계정 만들기`,
      desc: `${tool.name} 공식 사이트에서 무료 계정을 생성하세요.`,
      url: tool.url,
      type: 'signup',
    },
    {
      title: `${tool.name} 시작하기`,
      desc: `새 프로젝트를 생성하고 템플릿을 선택하세요.`,
      url: tool.url,
      type: 'start',
    },
  ];

  // 기능별 추가 단계
  if (answers.features?.includes('socialLogin') && tool.features?.includes('socialLogin')) {
    base.push({
      title: '소셜 로그인 설정',
      desc: '구글/카카오 로그인을 활성화하고 인증 키를 연결하세요.',
      url: tool.url,
      type: 'feature',
    });
  }
  if (answers.features?.includes('payment') && tool.features?.includes('payment')) {
    base.push({
      title: '결제 시스템 연결',
      desc: '스트라이프 또는 토스페이먼츠를 연결해 결제를 활성화하세요.',
      url: tool.url,
      type: 'feature',
    });
  }
  if (answers.features?.includes('email') && tool.features?.includes('email')) {
    base.push({
      title: '이메일 발송 설정',
      desc: '회원가입 환영 메일 등 트리거 이메일을 설정하세요.',
      url: tool.url,
      type: 'feature',
    });
  }

  base.push({
    title: `${tool.name} 배포 및 도메인 연결`,
    desc: '완성된 사이트를 배포하고 도메인을 연결하세요.',
    url: tool.url,
    type: 'deploy',
  });

  return base.map((s, i) => ({
    stepId: `${tool.id}_step${i}`,
    toolId: tool.id,
    toolName: tool.name,
    toolIcon: tool.logo,
    order: order * 100 + i,
    status: 'pending',
    ...s,
  }));
}

/** 데모 모드: Google AI Studio → GitHub → Vercel 순서로 하드코딩된 플랜 */
function buildDemoPlan(answers) {
  const googleTool = TOOLS.find(t => t.id === 'google-ai-studio');
  const vercelTool = TOOLS.find(t => t.id === 'vercel');
  if (!googleTool || !vercelTool) throw new Error('Demo requires google-ai-studio and vercel in TOOLS');

  const toolsWithOrder = [
    { ...googleTool, ...TOOL_ROLES['google-ai-studio'], order: 1, score: 0 },
    { ...vercelTool, ...TOOL_ROLES.vercel, order: 2, score: 0 },
  ];

  const steps = [
    {
      stepId: 'demo_google_landing',
      toolId: 'google-ai-studio',
      toolName: googleTool.name,
      toolIcon: googleTool.logo,
      order: 0,
      status: 'pending',
      title: 'Google AI Studio에서 랜딩페이지 제작',
      desc: 'Google AI Studio로 랜딩페이지를 만드세요.',
      url: googleTool.url,
      type: 'start',
    },
    {
      stepId: 'demo_github_connect',
      toolId: 'github',
      toolName: 'GitHub',
      toolIcon: '🐙',
      order: 1,
      status: 'pending',
      title: '깃허브 연동',
      desc: '만든 프로젝트를 GitHub 저장소에 연결하세요.',
      url: 'https://github.com',
      type: 'feature',
    },
    {
      stepId: 'demo_vercel_deploy',
      toolId: 'vercel',
      toolName: vercelTool.name,
      toolIcon: vercelTool.logo,
      order: 2,
      status: 'pending',
      title: 'Vercel로 배포',
      desc: 'Vercel에서 GitHub 저장소를 연결해 사이트를 배포하세요.',
      url: vercelTool.url,
      type: 'deploy',
    },
  ];

  return {
    answers,
    tools: toolsWithOrder,
    steps,
    currentStepId: steps[0].stepId,
    createdAt: Date.now(),
    visitedUrls: {},
  };
}

export function buildPlan(answers) {
  if (PLAN_MODE === 'demo') {
    return buildDemoPlan(answers);
  }

  // production: 점수 계산 및 정렬
  const scored = TOOLS.map(tool => ({
    ...tool,
    score: scoreTool(tool, answers),
    ...(TOOL_ROLES[tool.id] || { role: '보조 도구', icon: '🔧' }),
  }))
    .filter(t => t.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 1); // 메인 툴 1개만

  // 메인 툴 (1순위)
  const mainTool = { ...scored[0], order: 1 };
  // 보조 툴: Vercel 하나만
  const vercelTool = TOOLS.find(t => t.id === 'vercel');
  const subTools = vercelTool
    ? [{ ...vercelTool, ...(TOOL_ROLES.vercel || { role: '배포 & 호스팅', icon: '▲' }), order: 2, score: 0 }]
    : [];
  const toolsWithOrder = [mainTool, ...subTools];

  // 전체 스텝 생성
  const steps = toolsWithOrder.flatMap(tool =>
    generateStepsForTool(tool, tool.order, answers)
  );

  // 첫 번째 스텝 ID
  const currentStepId = steps[0]?.stepId || null;

  return {
    answers,
    tools: toolsWithOrder,
    steps,
    currentStepId,
    createdAt: Date.now(),
    // 각 툴 방문 기록
    visitedUrls: {},
  };
}

// 스토리지 헬퍼
export const storage = {
  async getPlan() {
    return new Promise(resolve => {
      chrome.storage.local.get('plan', r => resolve(r.plan || null));
    });
  },
  async savePlan(plan) {
    return new Promise(resolve => {
      chrome.storage.local.set({ plan }, resolve);
    });
  },
  async getAnswers() {
    return new Promise(resolve => {
      chrome.storage.local.get('answers', r => resolve(r.answers || null));
    });
  },
  async saveAnswers(answers) {
    return new Promise(resolve => {
      chrome.storage.local.set({ answers }, resolve);
    });
  },
  async updateStepStatus(stepId, status) {
    const plan = await this.getPlan();
    if (!plan) return;
    plan.steps = plan.steps.map(s => s.stepId === stepId ? { ...s, status } : s);
    // 완료된 스텝 다음 스텝으로 이동
    if (status === 'done') {
      const next = plan.steps.find(s => s.status === 'pending');
      plan.currentStepId = next?.stepId || null;
    }
    await this.savePlan(plan);
    return plan;
  },
  async clearAll() {
    return new Promise(resolve => {
      chrome.storage.local.clear(resolve);
    });
  },
};
