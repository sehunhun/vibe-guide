import { TOOLS, QUESTIONS, scoreTool } from './tools.js';

/**
 * 설문 requirement id → 실제 서비스 (이름, 아이콘, URL).
 * 여러 requirement가 같은 서비스로 매핑됨 (db/storage/login → Supabase).
 */
export const REQUIREMENT_TO_SERVICE = {
  db: { id: 'supabase', name: 'Supabase', icon: '🔷', url: 'https://supabase.com' },
  storage: { id: 'supabase', name: 'Supabase', icon: '🔷', url: 'https://supabase.com' },
  login: { id: 'supabase', name: 'Supabase', icon: '🔷', url: 'https://supabase.com' },
  payment: { id: 'stripe', name: 'Stripe', icon: '💳', url: 'https://stripe.com' },
  'frontend-hosting': { id: 'vercel', name: 'Vercel', icon: '▲', url: 'https://vercel.com' },
  'backend-hosting': { id: 'railway', name: 'Railway', icon: '🚂', url: 'https://railway.app' },
  analytics: { id: 'ga4', name: 'GA4', icon: '📊', url: 'https://analytics.google.com' },
  email: { id: 'resend', name: 'Resend', icon: '📧', url: 'https://resend.com' },
  monitoring: { id: 'sentry', name: 'Sentry', icon: '🛡️', url: 'https://sentry.io' },
  'headless-cms': { id: 'sanity', name: 'Sanity', icon: '📝', url: 'https://sanity.io' },
};

/** 도구별 간략 설명 + 비개발자용 "왜 필요한지" (선택한 서비스 드롭다운용) */
export const SERVICE_DESCRIPTIONS = {
  supabase: {
    summary: '데이터베이스, 로그인, 파일 저장을 한 곳에서 처리하는 백엔드 서비스예요.',
    whyNeeded: '회원가입·로그인, 게시글·댓글 저장, 업로드한 파일 보관처럼 "서버에 뭔가 저장해야 하는" 기능은 Supabase가 대신 해줘요. 직접 서버를 만들 필요가 없어요.',
  },
  stripe: {
    summary: '카드·간편결제를 웹사이트에 붙일 때 쓰는 결제 대행 서비스예요.',
    whyNeeded: '결제는 보안·법 규정이 까다로워서, 전문 서비스(Stripe)를 쓰는 게 안전해요. 상품/정기구독 결제를 쉽게 넣을 수 있어요.',
  },
  vercel: {
    summary: '만든 웹사이트를 인터넷에 올려 누구나 접속할 수 있게 해주는 호스팅 서비스예요.',
    whyNeeded: '코드만 있으면 되는 게 아니라 "어디선가 계속 돌아가게" 해야 해요. Vercel이 그 역할을 해줘서, 링크 하나로 사이트를 공개할 수 있어요.',
  },
  railway: {
    summary: '백엔드 서버나 API를 인터넷에 올려서 24시간 돌아가게 해주는 호스팅이에요.',
    whyNeeded: '데이터 처리·예약·알림 같은 일을 하는 서버 코드를 안정적으로 켜 두려면 Railway 같은 서비스가 필요해요. 직접 컴퓨터를 켜 둘 필요가 없어요.',
  },
  ga4: {
    summary: 'Google에서 제공하는 방문자 분석 도구예요. 누가, 어디서, 어떤 페이지를 봤는지 볼 수 있어요.',
    whyNeeded: '사이트를 개선하려면 "몇 명이 왔는지, 어디서 유입됐는지"를 알아야 해요. GA4를 붙이면 대시보드에서 한눈에 볼 수 있어요.',
  },
  resend: {
    summary: '웹사이트에서 이메일을 보낼 때 쓰는 발송 서비스예요.',
    whyNeeded: '가입 환영 메일, 비밀번호 찾기, 알림 메일처럼 "사이트가 자동으로 메일을 보내는" 기능을 안정적으로 쓰려면 Resend 같은 서비스가 필요해요.',
  },
  sentry: {
    summary: '사이트에서 발생한 오류를 자동으로 잡아서 알려주는 모니터링 도구예요.',
    whyNeeded: '문제가 생겨도 사용자가 직접 문의하기 전에 "어디서, 왜" 터졌는지 알 수 있어요. 빠르게 수정할 수 있어요.',
  },
  sanity: {
    summary: '글·이미지 같은 콘텐츠를 관리하는 헤드리스 CMS예요. 관리 화면에서 수정하면 사이트에 반영돼요.',
    whyNeeded: '블로그, 랜딩 문구, 메뉴 이름처럼 "개발자 없이도 나중에 바꾸고 싶은" 내용을 Sanity에서 편집하고, 사이트는 그걸 불러와서 보여줄 수 있어요.',
  },
};

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

/** 데모 모드: Google AI Studio → Vercel 순서로 하드코딩된 플랜 */
function buildDemoPlan(answers) {
  const googleTool = TOOLS.find(t => t.id === 'google-ai-studio');
  const vercelTool = TOOLS.find(t => t.id === 'vercel');
  if (!googleTool || !vercelTool) throw new Error('Demo requires google-ai-studio and vercel in TOOLS');

  const toolsWithOrder = [
    { ...googleTool, ...TOOL_ROLES['google-ai-studio'], order: 1, score: 100 },
    { ...vercelTool, ...TOOL_ROLES.vercel, order: 2, score: 100 },
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
      stepId: 'demo_vercel_deploy',
      toolId: 'vercel',
      toolName: vercelTool.name,
      toolIcon: vercelTool.logo,
      order: 1,
      status: 'pending',
      title: 'Vercel로 배포',
      desc: 'Vercel에서 사이트를 배포하세요.',
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

/**
 * 선택된 AI 도구들의 requirements에서 유일한 서비스 목록 반환 (이름·아이콘·URL)
 * @param {Array<{ id, description, requirements: string[] }>} selectedTools
 * @returns {Array<{ id: string, name: string, icon: string, url: string }>}
 */
export function getUniqueServicesFromSelectedTools(selectedTools) {
  const byId = new Map();
  for (const tool of selectedTools || []) {
    for (const r of tool.requirements || []) {
      const service = REQUIREMENT_TO_SERVICE[r];
      if (service && !byId.has(service.id)) {
        byId.set(service.id, { ...service });
      }
    }
  }
  return Array.from(byId.values());
}

/** 도구별 연동 시 필요한 환경변수 키 예시 (시스템 프롬프트용) */
const SERVICE_ENV_KEYS = {
  supabase: ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'],
  stripe: ['STRIPE_SECRET_KEY', 'STRIPE_PUBLISHABLE_KEY'],
  vercel: ['VERCEL_TOKEN', 'VERCEL_ORG_ID', 'VERCEL_PROJECT_ID'],
  railway: ['RAILWAY_TOKEN'],
  ga4: ['NEXT_PUBLIC_GA_MEASUREMENT_ID', 'GA_MEASUREMENT_ID'],
  resend: ['RESEND_API_KEY'],
  sentry: ['SENTRY_DSN', 'SENTRY_AUTH_TOKEN'],
  sanity: ['NEXT_PUBLIC_SANITY_PROJECT_ID', 'SANITY_DATASET', 'SANITY_API_TOKEN'],
};

/**
 * 선택된 AI 도구 기준 requirement 객체 리스트 생성
 * @param {Array<{ id, description: string, requirements: string[] }>} selectedTools
 * @returns {Array<{ requirement: string, name: string, url: string, descriptions: string[] }>}
 */
export function buildRequirementObjects(selectedTools) {
  const byReq = new Map();
  for (const tool of selectedTools || []) {
    const desc = (tool.description || '').trim() || '기능';
    for (const r of tool.requirements || []) {
      const service = REQUIREMENT_TO_SERVICE[r];
      if (!service) continue;
      if (!byReq.has(r)) {
        byReq.set(r, {
          requirement: r,
          name: service.name,
          url: service.url,
          descriptions: [],
        });
      }
      byReq.get(r).descriptions.push(desc);
    }
  }
  return Array.from(byReq.values());
}

/**
 * 바이브 코딩 에이전트용 시스템 프롬프트 생성
 * - 사용자가 만들고 싶은 웹사이트와 사용할 도구 정보 전달
 * - 도구 연동에 필요한 키는 환경변수로 사용하도록 안내
 */
export function buildSystemPrompt(userQuery, requirements) {
  const lines = [
    '당신은 비개발자를 위한 웹사이트 바이브 코딩 가이드 에이전트입니다.',
    '',
    '## 사용자가 만들고 싶은 웹사이트',
    userQuery || '(미입력)',
    '',
    '## 사용할 도구 및 기능',
  ];
  for (const r of requirements || []) {
    lines.push(`- **${r.name}** (${r.requirement}): ${r.url}`);
    if (r.descriptions?.length) {
      lines.push(`  - ${r.descriptions.join(', ')}`);
    }
  }
  lines.push('');
  lines.push('## 중요: 환경변수 사용');
  lines.push('도구들과 기능을 연결하기 위해 필요한 API 키, 시크릿, URL 등은 반드시 환경변수로 관리하세요. 코드에 직접 넣지 마세요.');
  const usedServiceIds = [...new Set((requirements || []).map(r => REQUIREMENT_TO_SERVICE[r.requirement]?.id).filter(Boolean))];
  const envExamples = usedServiceIds.flatMap(id => SERVICE_ENV_KEYS[id] || []);
  if (envExamples.length) {
    lines.push(`필요한 환경변수 예: ${envExamples.join(', ')}`);
  }
  return lines.join('\n');
}

/**
 * 시작하기 시 localStorage/스토리지에 저장할 설문 페이로드
 * @param {{ siteGoal: string, selectedTools: Array<{ id, description, requirements }> }} surveyResult
 * @returns {{ userQuery: string, requirements: object[], systemPrompt: string, tools, steps, ... }}
 */
export function buildSurveyPayload(surveyResult) {
  const userQuery = (surveyResult.siteGoal || '').trim();
  const selectedTools = surveyResult.selectedTools || [];
  const requirements = buildRequirementObjects(selectedTools);
  const systemPrompt = buildSystemPrompt(userQuery, requirements);

  const plan = buildPlanFromSurveyTools(surveyResult);

  return {
    userQuery,
    requirements,
    systemPrompt,
    ...plan,
  };
}

/**
 * 설문 단일 질문 플로우: siteGoal + 선택한 AI 도구 → 새 형식 플랜 생성 (기존 answers 형식 사용 안 함)
 * @param {{ siteGoal: string, selectedTools: Array<{ id, description, requirements }> }} surveyResult
 * @returns {object} plan - { siteGoal, tools, steps, currentStepId, createdAt, visitedUrls }
 */
export function buildPlanFromSurveyTools(surveyResult) {
  const services = getUniqueServicesFromSelectedTools(surveyResult.selectedTools || []);
  const toolsWithOrder = services.map((s, i) => ({
    id: s.id,
    name: s.name,
    logo: s.icon,
    url: s.url,
    role: s.name,
    order: i + 1,
  }));

  const steps = toolsWithOrder.map((tool, order) => ({
    stepId: tool.id,
    toolId: tool.id,
    toolName: tool.name,
    toolIcon: tool.logo,
    order,
    status: 'pending',
    title: tool.name,
    desc: `${tool.name} 사이트에서 계정을 만들고 연결하세요.`,
    url: tool.url,
    type: 'tool',
  }));

  const currentStepId = steps[0]?.stepId || null;

  return {
    siteGoal: surveyResult.siteGoal || '',
    tools: toolsWithOrder,
    steps,
    currentStepId,
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
    ? [{ ...vercelTool, ...(TOOL_ROLES.vercel || { role: '배포 & 호스팅', icon: '▲' }), order: 2, score: 100 }]
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

// 스토리지 헬퍼 (Chrome Extension 또는 웹 환경 모두 지원)
const isChromeExtension = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;

export const storage = {
  async getPlan() {
    if (isChromeExtension) {
      return new Promise(resolve => {
        chrome.storage.local.get('plan', r => resolve(r.plan || null));
      });
    } else {
      // 웹 환경: localStorage 사용
      const stored = localStorage.getItem('plan');
      return stored ? JSON.parse(stored) : null;
    }
  },
  async savePlan(plan) {
    if (isChromeExtension) {
      return new Promise(resolve => {
        chrome.storage.local.set({ plan }, resolve);
      });
    } else {
      // 웹 환경: localStorage 사용
      localStorage.setItem('plan', JSON.stringify(plan));
      return Promise.resolve();
    }
  },
  async getAnswers() {
    if (isChromeExtension) {
      return new Promise(resolve => {
        chrome.storage.local.get('answers', r => resolve(r.answers || null));
      });
    } else {
      // 웹 환경: localStorage 사용
      const stored = localStorage.getItem('answers');
      return stored ? JSON.parse(stored) : null;
    }
  },
  async saveAnswers(answers) {
    if (isChromeExtension) {
      return new Promise(resolve => {
        chrome.storage.local.set({ answers }, resolve);
      });
    } else {
      // 웹 환경: localStorage 사용
      localStorage.setItem('answers', JSON.stringify(answers));
      return Promise.resolve();
    }
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
    if (isChromeExtension) {
      return new Promise(resolve => {
        chrome.storage.local.clear(resolve);
      });
    } else {
      // 웹 환경: localStorage 사용
      localStorage.removeItem('plan');
      localStorage.removeItem('answers');
      return Promise.resolve();
    }
  },
};
