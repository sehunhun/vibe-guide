import { TOOLS, QUESTIONS, scoreTool } from './tools.js';
import plannerKo from './planner.ko.json';
import plannerEn from './planner.en.json';

/** 서비스 id → favicon URL (survey/guide 아이콘용) */
export const SERVICE_FAVICONS = {
  'google-ai-studio': 'https://www.gstatic.com/aistudio/ai_studio_favicon_2_32x32.png',
  supabase: 'https://supabase.com/favicon/apple-icon-57x57.png',
  stripe: 'https://images.stripeassets.com/fzn2n1nzq965/1hgcBNd12BfT9VLgbId7By/01d91920114b124fb4cf6d448f9f06eb/favicon.svg',
  paypal: 'https://www.paypalobjects.com/webstatic/icon/favicon.ico',
  vercel: 'https://assets.vercel.com/image/upload/q_auto/front/favicon/vercel/favicon.ico',
  railway: 'https://railway.app/favicon.ico',
  ga4: 'https://www.google.com/s2/favicons?domain=analytics.google.com&sz=128',
  resend: 'https://resend.com/static/favicons/favicon-marketing.ico?v=1',
  sentry: 'https://sentry.io/static/favicon-46f8676a36982f8eb852ac6860387755.ico',
  sanity: 'https://www.sanity.io/static/images/favicons/android-icon-192x192.png?v=2',
  firebase: 'https://www.gstatic.com/devrel-devsite/prod/v0aaaacbf0fa1137eef038c28cbf068bb36f5d76d975ff92c1063f1fc9a424af3/firebase/images/favicon.png',
  github: 'https://github.com/fluidicon.png',
  strapi: 'https://strapi.io/assets/favicon-16x16.png',
};

/**
 * 설문 requirement id → 실제 서비스 (이름, 아이콘=favicon URL, URL).
 * 여러 requirement가 같은 서비스로 매핑됨 (db/storage/login → Supabase).
 */
export const REQUIREMENT_TO_SERVICE = {
  db: { id: 'supabase', name: 'Supabase', icon: SERVICE_FAVICONS.supabase, url: 'https://supabase.com' },
  storage: { id: 'supabase', name: 'Supabase', icon: SERVICE_FAVICONS.supabase, url: 'https://supabase.com' },
  login: { id: 'supabase', name: 'Supabase', icon: SERVICE_FAVICONS.supabase, url: 'https://supabase.com' },
  payment: { id: 'paypal', name: 'PayPal', icon: SERVICE_FAVICONS.paypal, url: 'https://developer.paypal.com/dashboard/' },
  'frontend-hosting': { id: 'vercel', name: 'Vercel', icon: SERVICE_FAVICONS.vercel, url: 'https://vercel.com' },
  'backend-hosting': { id: 'railway', name: 'Railway', icon: SERVICE_FAVICONS.railway, url: 'https://railway.app' },
  analytics: { id: 'ga4', name: 'GA4', icon: SERVICE_FAVICONS.ga4, url: 'https://analytics.google.com' },
  email: { id: 'resend', name: 'Resend', icon: SERVICE_FAVICONS.resend, url: 'https://resend.com' },
  monitoring: { id: 'sentry', name: 'Sentry', icon: SERVICE_FAVICONS.sentry, url: 'https://sentry.io' },
  'headless-cms': { id: 'sanity', name: 'Sanity', icon: SERVICE_FAVICONS.sanity, url: 'https://sanity.io' },
};

let _plannerLocale = 'en';

/** 현재 planner 로케일 설정 (언어 전환 시 호출) */
export function setPlannerLocale(locale) {
  _plannerLocale = locale === 'ko' ? 'ko' : 'en';
}

/** 로케일별 planner 문구 반환. locale 생략 시 현재 설정된 로케일 사용 */
export function getPlannerMessages(locale) {
  const loc = locale ?? _plannerLocale;
  return loc === 'en' ? plannerEn : plannerKo;
}

/** @deprecated getPlannerMessages(locale).serviceDescriptions 사용 */
export function getServiceDescriptions(locale) {
  return getPlannerMessages(locale).serviceDescriptions;
}

/**
 * demo: 랜딩페이지만, 진행 순서 고정 (Google AI Studio → GitHub → Vercel)
 * production: 설문 기반 툴 추천 + 동적 스텝
 */
export const PLAN_MODE = 'production'; // 'demo' | 'production'

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

function substituteToolName(str, toolName) {
  return String(str).replace(/\$toolName\$/g, toolName || '');
}

// 툴별 단계 생성 템플릿 (getPlannerMessages() 기반)
function generateStepsForTool(tool, order, answers) {
  const t = getPlannerMessages().stepTemplates;
  const base = [
    {
      title: substituteToolName(t.signup.title, tool.name),
      desc: substituteToolName(t.signup.desc, tool.name),
      url: tool.url,
      type: 'signup',
    },
    {
      title: substituteToolName(t.start.title, tool.name),
      desc: t.start.desc,
      url: tool.url,
      type: 'start',
    },
  ];

  if (answers.features?.includes('socialLogin') && tool.features?.includes('socialLogin')) {
    base.push({
      title: t.socialLogin.title,
      desc: t.socialLogin.desc,
      url: tool.url,
      type: 'feature',
    });
  }
  if (answers.features?.includes('payment') && tool.features?.includes('payment')) {
    base.push({
      title: t.payment.title,
      desc: t.payment.desc,
      url: tool.url,
      type: 'feature',
    });
  }
  if (answers.features?.includes('email') && tool.features?.includes('email')) {
    base.push({
      title: t.email.title,
      desc: t.email.desc,
      url: tool.url,
      type: 'feature',
    });
  }

  base.push({
    title: substituteToolName(t.deploy.title, tool.name),
    desc: t.deploy.desc,
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

  const roles = getPlannerMessages().toolRoles;
  const demo = getPlannerMessages().demoSteps;
  const googleLogo = SERVICE_FAVICONS['google-ai-studio'] || googleTool.logo;
  const vercelLogo = SERVICE_FAVICONS.vercel || vercelTool.logo;
  const toolsWithOrder = [
    { ...googleTool, ...roles['google-ai-studio'], logo: googleLogo, order: 1, score: 100 },
    { ...vercelTool, ...roles.vercel, logo: vercelLogo, order: 2, score: 100 },
  ];

  const steps = [
    {
      stepId: 'demo_google_landing',
      toolId: 'google-ai-studio',
      toolName: googleTool.name,
      toolIcon: googleLogo,
      order: 0,
      status: 'pending',
      title: demo.googleLanding.title,
      desc: demo.googleLanding.desc,
      url: googleTool.url,
      type: 'start',
    },
    {
      stepId: 'demo_vercel_deploy',
      toolId: 'vercel',
      toolName: vercelTool.name,
      toolIcon: vercelLogo,
      order: 1,
      status: 'pending',
      title: demo.vercelDeploy.title,
      desc: demo.vercelDeploy.desc,
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
  const fallbackDesc = getPlannerMessages().fallbackDesc;
  const byReq = new Map();
  for (const tool of selectedTools || []) {
    const desc = (tool.description || '').trim() || fallbackDesc;
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
  const p = getPlannerMessages().systemPrompt;
  const lines = [
    p.intro,
    '',
    p.userGoalSection,
    userQuery || '(미입력)',
    '',
    p.toolsSection,
  ];
  for (const r of requirements || []) {
    lines.push(`- **${r.name}** (${r.requirement}): ${r.url}`);
    if (r.descriptions?.length) {
      lines.push(`  - ${r.descriptions.join(', ')}`);
    }
  }
  lines.push('');
  lines.push(p.envSection);
  lines.push(p.envLine);
  const usedServiceIds = [...new Set((requirements || []).map(r => REQUIREMENT_TO_SERVICE[r.requirement]?.id).filter(Boolean))];
  const envExamples = usedServiceIds.flatMap(id => SERVICE_ENV_KEYS[id] || []);
  if (envExamples.length) {
    lines.push(p.envExample + envExamples.join(', '));
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

  // Vercel(프론트엔드 호스팅)은 항상 마지막 순서로 배치
  const vercelService = services.find(s => s.id === 'vercel');
  const orderedServices = vercelService
    ? [...services.filter(s => s.id !== 'vercel'), vercelService]
    : services;

  // 항상 맨 앞에 Google AI Studio를 하나의 도메인으로 포함
  const toolsWithOrder = [];

  const googleTool = TOOLS.find(t => t.id === 'google-ai-studio');
  if (googleTool) {
    toolsWithOrder.push({
      id: googleTool.id,
      name: googleTool.name,
      logo: SERVICE_FAVICONS['google-ai-studio'] || googleTool.logo,
      // 실제로 사용하는 앱 화면으로 바로 이동
      url: 'https://aistudio.google.com/apps',
      role: googleTool.name,
      order: 1,
    });
  }

  orderedServices.forEach((s) => {
    toolsWithOrder.push({
      id: s.id,
      name: s.name,
      logo: s.icon,
      url: s.url,
      role: s.name,
      order: toolsWithOrder.length + 1,
    });
  });

  const { toolStepDesc, toolStepDescByToolId } = getPlannerMessages();
  const steps = toolsWithOrder.map((tool, index) => ({
    stepId: tool.id,
    toolId: tool.id,
    toolName: tool.name,
    toolIcon: tool.logo,
    order: index,
    status: 'pending',
    title: tool.name,
    desc: substituteToolName((toolStepDescByToolId?.[tool.id] ?? toolStepDesc), tool.name),
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

  const roles = getPlannerMessages().toolRoles;
  const fallbackRole = getPlannerMessages().fallbackRole;
  // production: 점수 계산 및 정렬
  const scored = TOOLS.map(tool => ({
    ...tool,
    score: scoreTool(tool, answers),
    ...(roles[tool.id] || { role: fallbackRole, icon: '🔧' }),
  }))
    .filter(t => t.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 1); // 메인 툴 1개만

  // 메인 툴 (1순위)
  const mainTool = { ...scored[0], order: 1 };
  // 보조 툴: Vercel 하나만
  const vercelTool = TOOLS.find(t => t.id === 'vercel');
  const subTools = vercelTool
    ? [{ ...vercelTool, ...(roles.vercel || { role: fallbackRole, icon: '▲' }), order: 2, score: 100 }]
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
