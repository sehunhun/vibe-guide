/**
 * AI API: 설문 + 플랜 + 페이지(HTML 또는 이미지) → "이 페이지에서 할 일" + 선택자
 * 백엔드 서버를 통해 OpenAI API 호출
 */

import { QUESTIONS } from './tools.js';
import { getDomainGuide, getDomainIdFromUrl } from './guides.js';
import { PLAN_MODE } from './planner.js';
import demoGuide from './guides/demo-guide.md';

const MAX_HTML_LEN = 30000; // 토큰 절감용

/** 설문 answers를 읽기 쉬운 텍스트로 (기존 다중 질문 플로우용 폴백) */
function formatAnswers(answers) {
  if (!answers) return '없음';
  const lines = [];
  if (answers.siteGoal) {
    lines.push(`- 어떤 웹사이트: ${answers.siteGoal}`);
    if (Array.isArray(answers.features) && answers.features.length > 0) {
      lines.push(`- 필요한 기능: ${answers.features.join(', ')}`);
    }
  }
  for (const q of QUESTIONS) {
    if (answers.siteGoal && (q.id === 'siteType' || q.id === 'skill' || q.id === 'bizType' || q.id === 'teamType' || q.id === 'budget')) continue;
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
 * 설문 요약 (옵션 2): 만들려는 웹사이트 + 도구별 이름·용도
 * plan.userQuery, plan.requirements 있으면 새 포맷, 없으면 formatAnswers(answers) 폴백
 */
function formatSurveySummary(plan, answers) {
  const userQuery = (plan?.userQuery || answers?.siteGoal || '').trim();
  const requirements = plan?.requirements;
  if (requirements?.length > 0) {
    const lines = [
      `만들려는 웹사이트: ${userQuery || '(미입력)'}`,
      '',
      '사용할 도구 및 용도:',
      ...requirements.map((r) => {
        const desc = (r.descriptions && r.descriptions.length > 0)
          ? [...new Set(r.descriptions)].join(', ')
          : '연동·설정';
        return `- ${r.name}: ${desc}`;
      }),
    ];
    return lines.join('\n');
  }
  return formatAnswers(answers);
}

/** 플랜 요약 (현재 스텝 중심) */
function formatPlan(plan) {
  if (!plan) return '없음';
  const current = plan.steps?.find(s => s.stepId === plan.currentStepId);
  const tools = plan.tools?.map(t => t.name).join(' → ') || '';
  return [
    `진행 순서: ${tools}`,
    current ? `현재 단계: ${current.title} — ${current.desc}` : '',
    `완료된 단계 수: ${plan.steps?.filter(s => s.status === 'done').length ?? 0} / ${plan.steps?.length ?? 0}`,
  ].filter(Boolean).join('\n');
}

/**
 * AI용 시스템 + 유저 프롬프트 생성
 * @param {{ plan: object, answers: object, previousStepsForUrl?: { steps: Array<{text,selector?}>, completed: boolean[] } }} context
 * @param {{ type: 'html'|'image', content: string }} pageContext - html 문자열 또는 base64 이미지
 * @param {string} pageUrl
 * @param {string|null} domainGuide - 도메인별 가이드 문서 (마크다운)
 */
export function buildPrompt(context, pageContext, pageUrl, domainGuide = null) {
  const { plan, answers, previousStepsForUrl } = context;
  const answersText = formatSurveySummary(plan, answers);
  const planText = formatPlan(plan);

  const system = `당신은 비개발자를 위한 웹 가이드 어시스턴트입니다.
**핵심 목표**: 사용자의 설문 응답과 프로젝트 플랜(Step1)을 달성하기 위해, **지금 보고 있는 웹페이지**에서 **다음에 해야 할 하나의 단계**를 UI 단위로 구체적으로 안내해주세요.

응답은 반드시 다음 JSON만 출력하세요. 다른 설명은 붙이지 마세요.
{
  "steps": [
    { "text": "다음 단계 안내 문장 (예: 상단 '시작하기' 버튼을 클릭하세요)", "selector": "해당 요소의 CSS 선택자 또는 null" }
  ]
}

**중요 규칙**:
1. **한 번에 하나의 단계만 생성**: steps 배열에는 정확히 하나의 단계만 포함하세요. 여러 단계를 한 번에 생성하지 마세요.
2. **과거 단계와 절대 겹치지 않아야 합니다**: 이전에 안내한 단계와 동일하거나 유사한 내용을 반복하지 마세요. 이미 완료된 작업이나 안내된 단계는 제외하고, **새로운 다음 단계 하나만** 생성하세요.
3. **플랜 달성을 위한 다음 단계 선정**: 설문 응답과 프로젝트 플랜을 달성하기 위해 **아직 수행하지 않은 다음 작업 하나**를 선정하세요. 이미 완료된 단계나 이전에 안내한 단계는 제외합니다.
4. **완료 상태 고려**: 이전 단계가 모두 완료되었다면, 그 다음 새로운 단계 하나를 생성하세요. 완료되지 않은 단계가 있다면, 그 단계를 다시 안내하거나 업데이트할 수 있습니다.
5. **연속된 작업은 하나로 합치기**: "입력하세요"와 "제출하세요"처럼 연속된 작업은 별도 단계로 나누지 말고 하나의 단계로 합쳐서 안내하세요. 예: "입력하고 제출하세요" 또는 "입력 후 제출하세요".
6. **행동 가능한 단계만 생성**: 실제로 사용자가 수행할 수 있는 인터랙션(클릭, 타이핑, 입력, 선택, 드래그 등)만 단계로 추가하세요. 단순히 "읽기", "확인하기", "보기", "참고하기" 같은 수동적인 행동은 단계로 포함하지 마세요. 예: "버튼을 클릭하세요", "텍스트를 입력하세요", "옵션을 선택하세요" 등.
7. **선택자**: selector는 document.querySelector()로 찾을 수 있는 유효한 CSS 선택자여야 합니다. id, data 속성, 역할(button, a) 등을 우선 사용하세요. 찾기 어렵거나 해당 없으면 null.`;

  const userParts = [
    `## 설문 요약`,
    answersText,
    `## 프로젝트 플랜`,
    planText,
    `## 현재 페이지 URL`,
    pageUrl,
  ];

  // 도메인별 가이드 문서가 있으면 추가
  if (domainGuide) {
    userParts.push(
      `## 도메인 가이드 문서`,
      `다음은 현재 도메인(${pageUrl})에 대한 공식 가이드 문서입니다. 이 문서를 참고하여 정확한 단계를 안내해주세요.`,
      '',
      domainGuide,
      '',
      '**중요**: 위 가이드 문서의 내용을 참고하여, 사용자가 실제로 수행할 수 있는 구체적인 단계를 안내해주세요. 가이드 문서에 나와있는 기능이나 버튼, 메뉴 등을 정확히 언급하세요.'
    );
  }

  // 데모 모드일 때 데모 가이드 추가 (반드시 참고해야 함)
  if (PLAN_MODE === 'demo') {
    userParts.push(
      `## ⚠️ 데모 버전 필수 가이드 (반드시 참고)`,
      `다음은 데모 버전에서 반드시 따라야 하는 단계별 가이드입니다. 이 가이드의 순서를 정확히 따르고, 각 단계를 순서대로 안내해주세요.`,
      '',
      demoGuide,
      '',
      '**매우 중요**: 위 데모 가이드의 단계들을 정확히 순서대로 안내해주세요. 사용자가 현재 페이지에서 수행해야 할 단계가 가이드에 명시되어 있다면, 그 단계를 정확히 안내하세요. 가이드에 나와있는 버튼 이름, 메뉴 이름, 입력 칸 이름 등을 정확히 사용하세요.'
    );
  }

  if (previousStepsForUrl?.steps?.length) {
    const completed = previousStepsForUrl.completed || [];
    const lines = previousStepsForUrl.steps.map((s, i) => {
      const status = completed[i] ? '(완료)' : '(미완료)';
      return `${i + 1}) ${s.text} ${status}`;
    });
    userParts.push('## 이 페이지에 대해 이전에 안내한 단계와 달성 여부', lines.join('\n'));
    
    // 완료되지 않은 첫 번째 단계의 인덱스 찾기
    const firstIncompleteIndex = completed.findIndex((done, idx) => !done && idx < previousStepsForUrl.steps.length);
    if (firstIncompleteIndex >= 0) {
      userParts.push(`\n**⚠️ 매우 중요**: 
- 위 이전 단계들 중 ${firstIncompleteIndex + 1}번째 단계가 아직 완료되지 않았습니다.
- **정확히 하나의 단계만** 생성해주세요. ${firstIncompleteIndex + 1}번째 단계를 다시 안내하거나, 필요하다면 업데이트해주세요.
- **절대 이전 단계들과 겹치거나 중복되는 내용을 생성하지 마세요.** 이미 안내한 작업은 제외하고, 설문 응답과 플랜을 달성하기 위한 **다음 단계 하나만** 선정하세요.`);
    } else {
      userParts.push(`\n**⚠️ 매우 중요**: 
- 위 이전 단계들은 모두 완료되었습니다.
- **더 이상 수행할 단계가 없다면**, steps 배열을 빈 배열([])로 반환하세요: {"steps": []}
- **아직 수행할 단계가 있다면**, 정확히 하나의 단계만 생성해주세요. 이전 단계들(${previousStepsForUrl.steps.length}개) 다음에 수행해야 할 **새로운 다음 단계 하나**를 선정하세요.
- **절대 이전 단계들과 겹치거나 중복되는 내용을 생성하지 마세요.** 이미 완료된 작업이나 안내된 단계는 제외하고, 설문 응답과 플랜을 달성하기 위한 **다음 단계 하나만** 선정하세요.`);
    }
  }

  if (pageContext.type === 'axtree') {
    userParts.push('(현재 페이지 상호작용 요소 목록은 백엔드에서 첨부됩니다. 해당 목록에서 반드시 하나의 요소(backendDOMNodeId)를 골라 단계를 안내하세요.)');
  } else if (pageContext.type === 'html' && pageContext.content) {
    const html = pageContext.content.length > MAX_HTML_LEN
      ? pageContext.content.slice(0, MAX_HTML_LEN) + '\n... (truncated)'
      : pageContext.content;
    userParts.push('## 현재 페이지 HTML (일부)', '```html', html, '```');
  } else if (pageContext.type === 'image' && pageContext.content) {
    userParts.push('(현재 페이지 스크린샷이 이미지로 제공됩니다. 화면 구성을 보고 할 일을 안내해주세요.)');
  }

  if (previousStepsForUrl?.steps?.length) {
    userParts.push(`\n위 정보를 바탕으로 **다음에 수행해야 할 하나의 단계**를 steps 배열에 포함하여 JSON 형식으로만 답해주세요. 
- **더 이상 수행할 단계가 없다면**, steps 배열을 빈 배열([])로 반환하세요: {"steps": []}
- **아직 수행할 단계가 있다면**, 정확히 하나의 단계만 생성하세요 (steps 배열에 하나의 객체만 포함).
- **새로운 단계는 이전 단계와 절대 겹치지 않아야 하며**, 설문 응답과 프로젝트 플랜을 달성하기 위한 **다음에 해야 할 작업 하나**만 선정하세요.`);
  } else {
    userParts.push(`\n위 정보를 바탕으로 이 페이지에서 할 일의 **첫 번째 단계 하나**를 steps 배열에 포함하여 JSON 형식으로만 답해주세요.
**중요**: 설문 응답과 프로젝트 플랜을 달성하기 위해 이 페이지에서 수행해야 할 **첫 번째 작업 하나**만 선정하세요. steps 배열에는 정확히 하나의 단계만 포함하세요.`);
  }

  return { system, user: userParts.join('\n') };
}

/**
 * 채팅용 시스템 + 유저 프롬프트 생성
 * - 같은 컨텍스트(설문 요약, 프로젝트 플랜, 현재 페이지 URL, 이전 단계)를 사용하되
 * - 웹페이지 내부 요소/용어를 비개발자도 이해하기 쉽게 설명하는 역할에 맞게 구성
 * - 단계 생성 AI처럼 axtree slim JSON을 함께 전달해, 페이지 요소 맥락을 참고할 수 있게 함
 * @param {{ plan: object, answers: object, previousStepsForUrl?: { steps: Array<{text,selector?}>, completed: boolean[] } }} context
 * @param {{ type: 'axtree'|'url'|string, nodes?: Array<object> }} pageContext
 * @param {string} pageUrl
 * @param {string|null} domainGuide
 * @param {Array<{ role: 'user'|'assistant', text: string }>} history
 * @param {string} userMessage
 */
export function buildChatPrompt(
  context,
  pageContext,
  pageUrl,
  domainGuide = null,
  history = [],
  userMessage = '',
) {
  const { plan, answers, previousStepsForUrl } = context;
  const answersText = formatSurveySummary(plan, answers);
  const planText = formatPlan(plan);

  const system = [
    '# role',
    '당신은 웹페이지 내부 요소 및 용어에 대해 설명하는 어시스턴트입니다.',
    '비개발자도 충분히 이해할 수 있도록 쉬운 용어와 표현으로 대답합니다.',
    '',
    '# style',
    '- 가능한 한 쉬운 한국어를 사용하세요.',
    '- 개발 용어가 나오면 일상적인 비유와 함께 풀어서 설명하세요.',
    '- 버튼, 메뉴, 입력칸 이름을 그대로 언급하되, 그게 무슨 역할을 하는지 같이 설명하세요.',
  ].join('\n');

  const userParts = [
    '## 설문 요약',
    answersText,
    '## 프로젝트 플랜',
    planText,
    '## 현재 페이지 URL',
    pageUrl,
  ];

  if (domainGuide) {
    userParts.push(
      '## 도메인 가이드 문서',
      `다음은 현재 도메인(${pageUrl})에 대한 공식 가이드 문서입니다. 화면을 설명할 때 참고만 하세요.`,
      '',
      domainGuide,
    );
  }

  if (previousStepsForUrl?.steps?.length) {
    const completed = previousStepsForUrl.completed || [];
    const lines = previousStepsForUrl.steps.map((s, i) => {
      const status = completed[i] ? '(완료)' : '(미완료)';
      return `${i + 1}) ${s.text} ${status}`;
    });
    userParts.push('## 이 페이지에 대해 지금까지 안내된 단계', lines.join('\n'));
  }

  // axtree slim 노드가 있으면 JSON으로 함께 제공
  if (pageContext?.type === 'axtree' && Array.isArray(pageContext.nodes) && pageContext.nodes.length > 0) {
    userParts.push(
      '## 현재 페이지 상호작용 요소 목록 (slim JSON)',
      '아래 JSON은 이 페이지에서 상호작용 가능한 UI 요소들의 슬림 목록입니다. 요소 이름과 역할을 설명할 때 참고만 하세요.',
      '```json',
      JSON.stringify(pageContext.nodes, null, 2),
      '```',
    );
  }

  if (Array.isArray(history) && history.length > 0) {
    const lines = history.map((m, idx) => {
      const role = m.role === 'assistant' ? '어시스턴트' : '사용자';
      return `${idx + 1}. [${role}] ${m.text}`;
    });
    userParts.push('## 지금까지의 대화 내용', lines.join('\n'));
  }

  userParts.push(
    '## 사용자의 현재 질문',
    userMessage || '(질문 없음)',
    '',
    '**답변 지침**',
    '- 개발 용어를 최대한 풀어서 설명하고, 필요한 경우 예시를 들어주세요.',
    '- 단계 지시(예: 어디를 클릭하세요) 보다는, 화면에 보이는 요소가 무슨 역할을 하는지 중심으로 설명해주세요.',
    '- 너무 길게 설명하기보다는, 중요한 포인트를 중심으로 짧고 명확하게 답변하세요.',
  );

  return { system, user: userParts.join('\n') };
}

// 백엔드 서버 URL (하드코딩)
const BACKEND_URL = 'https://vibe-guide-production.up.railway.app';

/**
 * 설문: 사용자 답변 → AI 추천 도구 목록 (체크박스용)
 * @param {string} backendUrl
 * @param {string} userAnswer - "어떤 웹사이트를 만들고 싶으신가요?" 답변
 * @returns {Promise<{ tools: Array<{ id: number, description: string, requirements: string[] }> }>}
 */
export async function getSurveyTools(backendUrl, userAnswer) {
  const baseUrl = (backendUrl || BACKEND_URL).trim().replace(/\/$/, '');
  const res = await fetch(`${baseUrl}/api/survey-tools`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_answer: userAnswer }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`설문 API 오류 (${res.status}): ${err}`);
  }
  return res.json();
}

/**
 * 저장된 AI 설정 조회 (background에서 호출)
 */
export function getStoredAISettings() {
  return new Promise(resolve => {
    chrome.storage.local.get(['aiModel'], r => {
      resolve({
        modelId: r.aiModel || 'gpt-4o-mini',
        backendUrl: BACKEND_URL,
      });
    });
  });
}

/**
 * 백엔드 API 호출
 * @param {string} backendUrl
 * @param {string} modelId
 * @param {{ system: string, user: string }} messages
 * @param {string} pageContextType - 'axtree' | 'html' | 'image'
 * @param {string|null} imageDataUrl - image 시에만
 * @param {string} [pageUrl] - axtree 시 필수
 * @param {Array<object>} [slimNodes] - axtree 시 필수
 */
async function callBackend(backendUrl, modelId, messages, pageContextType, imageDataUrl, pageUrl = '', slimNodes = null) {
  if (!backendUrl || !backendUrl.trim()) {
    throw new Error('백엔드 서버 URL을 설정해주세요.');
  }

  const baseUrl = backendUrl.trim().replace(/\/$/, '');
  const apiUrl = `${baseUrl}/api/guidance`;

  const body = {
    system: messages.system,
    user: messages.user,
    model: modelId,
    page_context_type: pageContextType,
    page_context_content: imageDataUrl || null,
  };
  if (pageContextType === 'axtree') {
    body.page_url = pageUrl || null;
    body.slim_nodes = Array.isArray(slimNodes) ? slimNodes : null;
  }

  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`백엔드 API 오류 (${res.status}): ${err}`);
  }

  const data = await res.json();
  const steps = (data.steps || []).map((s) => ({
    text: s.step_text ?? s.text ?? '',
    selector: s.selector ?? null,
    backendDOMNodeId: s.backendDOMNodeId ?? null,
  }));
  if (steps.length) {
    const kind = steps.some((s) => s.backendDOMNodeId != null) ? 'backendDOMNodeId' : 'selector';
    console.log('[vibe-guide] API 응답 단계:', steps.length, '개, 종류:', kind, steps.map((s) => ({ backendDOMNodeId: s.backendDOMNodeId, selector: s.selector ?? null })));
  }
  return { steps };
}

/**
 * 채팅용 백엔드 API 호출
 * @param {string} backendUrl
 * @param {string} modelId
 * @param {{ system: string, user: string }} messages
 */
async function callChatBackend(backendUrl, modelId, messages) {
  if (!backendUrl || !backendUrl.trim()) {
    throw new Error('백엔드 서버 URL을 설정해주세요.');
  }

  const baseUrl = backendUrl.trim().replace(/\/$/, '');
  const apiUrl = `${baseUrl}/api/chat`;

  const body = {
    system: messages.system,
    user: messages.user,
    model: modelId,
  };

  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`채팅 API 오류 (${res.status}): ${err}`);
  }

  const data = await res.json();
  return { text: data.text || '' };
}

/** 파싱 실패 시 반환하는 고정 메시지 (재시도 판별용) */
const PARSE_FAILURE_MESSAGE = '안내를 생성하지 못했습니다. 다시 시도해 주세요.';

/** 파싱 실패 fallback 결과인지 여부 */
function isParseFailureResult(result) {
  return (
    result?.steps?.length === 1 &&
    result.steps[0]?.text === PARSE_FAILURE_MESSAGE &&
    result.steps[0]?.selector === null
  );
}

/** 응답 텍스트에서 JSON 추출 → steps 배열로 정규화 */
function parseAIResponse(raw) {
  let cleaned = raw
    .replace(/^```(?:json)?\s*\n?/i, '')
    .replace(/\n?```\s*$/g, '')
    .trim();
  try {
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const obj = JSON.parse(jsonMatch[0]);
      
      // 빈 배열인 경우 명시적으로 처리
      if (Array.isArray(obj.steps) && obj.steps.length === 0) {
        return { steps: [] };
      }
      
      if (Array.isArray(obj.steps) && obj.steps.length > 0) {
        const steps = obj.steps.map((s) => ({
          text: (s.text && String(s.text).trim()) || '',
          selector: s.selector && typeof s.selector === 'string' ? s.selector.trim() || null : null,
        })).filter((s) => s.text);
        if (steps.length) return { steps };
      }
      // 하위 호환: text/selector 단일 형식
      const text = (obj.text && String(obj.text).trim()) || '';
      if (text && text !== raw && !text.includes('{"steps"')) {
        // raw가 JSON 문자열이 아닌 경우에만 text 사용
        const selector = obj.selector && typeof obj.selector === 'string' ? obj.selector.trim() || null : null;
        return { steps: [{ text, selector }] };
      }
    }
  } catch (err) {
    const len = raw != null && typeof raw.length === 'number' ? raw.length : 0;
    console.error('[vibe-guide] AI 응답 JSON 파싱 실패:', err);
    console.error('[vibe-guide] 원문 길이:', len);
    console.error('[vibe-guide] 원문:', raw);
  }
  // 파싱 실패 시 원문(raw)을 노출하지 않고 고정 메시지 반환
  return { steps: [{ text: PARSE_FAILURE_MESSAGE, selector: null }] };
}

/**
 * 백엔드 URL이 설정되어 있는지 확인 (가이드 진입 시 사용)
 */
export function hasValidApiKey() {
  return getStoredAISettings().then(({ backendUrl }) => {
    return !!(backendUrl && String(backendUrl).trim());
  });
}

/**
 * AI API 호출 (background에서 사용)
 * @param {{ plan: object, answers: object }} context
 * @param {{ type: 'html'|'image', content: string }} pageContext
 * @param {string} pageUrl
 * @returns {Promise<{ steps: Array<{ text: string, selector: string|null }> }>}
 */
export async function getPageGuidance(context, pageContext, pageUrl) {
  const { modelId, backendUrl } = await getStoredAISettings();
  
  if (!backendUrl || !backendUrl.trim()) {
    throw new Error('설정에서 백엔드 서버 URL을 입력해주세요.');
  }

  // 도메인별 가이드 문서 로드 (프롬프트 캐싱을 위해)
  const domainId = getDomainIdFromUrl(pageUrl);
  const domainGuide = domainId ? await getDomainGuide(domainId) : null;

  const messages = buildPrompt(context, pageContext, pageUrl, domainGuide);
  const imageDataUrl = pageContext.type === 'image' ? pageContext.content : null;
  const slimNodes = pageContext.type === 'axtree' ? pageContext.nodes : null;

  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await callBackend(
        backendUrl,
        modelId,
        messages,
        pageContext.type,
        imageDataUrl,
        pageUrl,
        slimNodes
      );
      if (!isParseFailureResult(result)) return result;
      if (attempt < maxAttempts) {
        console.warn(`[vibe-guide] AI 응답 파싱 실패, 재시도 ${attempt}/${maxAttempts}`);
      }
    } catch (err) {
      console.error(`[vibe-guide] 백엔드 API 호출 실패 (시도 ${attempt}/${maxAttempts}):`, err);
      if (attempt >= maxAttempts) throw err;
    }
  }

  return { steps: [{ text: PARSE_FAILURE_MESSAGE, selector: null }] };
}

/**
 * 채팅용 AI 호출 (background에서 사용)
 * - 단계 생성 AI와 동일하게 axtree slim JSON을 함께 사용 (가능한 경우)
 * @param {{ plan: object, answers: object, previousStepsForUrl?: { steps: Array<{text,selector?}>, completed: boolean[] } }} context
 * @param {{ type: 'axtree'|'url'|string, nodes?: Array<object> }} pageContext
 * @param {string} pageUrl
 * @param {Array<{ role: 'user'|'assistant', text: string }>} history
 * @param {string} userMessage
 * @returns {Promise<{ text: string }>}
 */
export async function getPageChatAnswer(context, pageContext, pageUrl, history = [], userMessage = '') {
  const { modelId, backendUrl } = await getStoredAISettings();

  if (!backendUrl || !backendUrl.trim()) {
    throw new Error('설정에서 백엔드 서버 URL을 입력해주세요.');
  }

  const domainId = getDomainIdFromUrl(pageUrl);
  const domainGuide = domainId ? await getDomainGuide(domainId) : null;

  const messages = buildChatPrompt(context, pageContext, pageUrl, domainGuide, history, userMessage);

  const result = await callChatBackend(backendUrl, modelId, messages);
  return result;
}
