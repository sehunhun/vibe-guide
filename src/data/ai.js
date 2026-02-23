/**
 * AI API: 설문 + 플랜 + 페이지(HTML 또는 이미지) → "이 페이지에서 할 일" + 선택자
 * 백엔드 서버를 통해 OpenAI API 호출
 */

import { getDomainGuide, getDomainIdFromUrl } from './guides.js';

/**
 * 시스템 프롬프트 로드
 */
async function loadSystemPrompt() {
  try {
    const { SYSTEM_PROMPT } = await import('./prompts/system.js');
    return SYSTEM_PROMPT;
  } catch (error) {
    console.error('[vibe-guide] 시스템 프롬프트 로드 실패:', error);
    // Fallback: 기본 시스템 프롬프트
    return `You are a web guide assistant for non-developers.

**Core Goal**: Based on the user's survey responses and project plan (Step1), guide them through **exactly one next actionable UI step** on the current webpage.

**Output Format**:
You must output ONLY the following JSON. Do not include any other explanation.
{
  "steps": [
    { "text": "Next step instruction (e.g., Click the 'Get Started' button at the top)", "selector": "CSS selector for the element or null" }
  ]
}

**Critical Rules**:
1. **Generate exactly ONE step**: The steps array must contain exactly one step. Do not generate multiple steps at once.
2. **Never repeat completed steps**: Do not repeat steps that have already been completed or guided. Exclude already completed tasks and generate only **one new next step**.
3. **Select next step for plan achievement**: Select **one next task** that hasn't been performed yet to achieve the survey responses and project plan. Exclude already completed steps or previously guided steps.
4. **Consider completion status**: If all previous steps are completed, generate one new next step. If there are incomplete steps, you can re-guide or update that step.
5. **Combine consecutive actions**: Do not separate consecutive actions like "enter" and "submit" into separate steps. Combine them into one step. Example: "Enter and submit" or "Enter then submit".
6. **Only actionable steps**: Only add steps that users can actually perform (click, type, input, select, drag, etc.). Do not include passive actions like "read", "check", "view", "refer to". Examples: "Click the button", "Enter text", "Select an option", etc.
7. **Selector**: The selector must be a valid CSS selector that can be found with document.querySelector(). Prefer id, data attributes, roles (button, a), etc. If unclear or not applicable, return null.`;
  }
}

/**
 * AI용 메시지 배열 생성 (새로운 구조)
 * @param {{ plan: object, answers: object, previousStepsForUrl?: { steps: Array<{text,selector?}>, completed: boolean[] } }} context
 * @param {{ type: 'html'|'image', content: string }} pageContext - html 문자열 또는 base64 이미지
 * @param {string} pageUrl
 * @param {string|null} domainGuide - 도메인별 가이드 문서 (마크다운)
 * @returns {Promise<{messages: Array<{role: string, content: string}>}>}
 */
export async function buildPrompt(context, pageContext, pageUrl, domainGuide = null) {
  const { buildPlanContext, buildPageState } = await import('./prompts/buildContext.js');
  
  // 1. 시스템 프롬프트 로드
  const systemPrompt = await loadSystemPrompt();
  console.log('[vibe-guide] ===== SYSTEM PROMPT =====');
  console.log(systemPrompt);
  console.log('[vibe-guide] ========================');
  
  // 2. 전략/플랜 컨텍스트 생성
  const planContext = buildPlanContext(context, domainGuide);
  console.log('[vibe-guide] ===== PLAN CONTEXT =====');
  console.log(planContext);
  console.log('[vibe-guide] ========================');
  
  // 3. 페이지 상태 생성
  const pageState = await buildPageState(pageUrl, pageContext, context.previousStepsForUrl);
  console.log('[vibe-guide] ===== PAGE STATE =====');
  console.log(pageState);
  console.log('[vibe-guide] =====================');
  
  return {
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: planContext },
      { role: 'user', content: pageState },
    ],
  };
}

// 백엔드 서버 URL (하드코딩)
const BACKEND_URL = 'https://vibe-guide-production.up.railway.app';

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
 */
async function callBackend(backendUrl, modelId, messages, pageContextType, imageDataUrl) {
  if (!backendUrl || !backendUrl.trim()) {
    throw new Error('백엔드 서버 URL을 설정해주세요.');
  }

  // 백엔드 URL 정규화 (끝에 / 제거)
  const baseUrl = backendUrl.trim().replace(/\/$/, '');
  const apiUrl = `${baseUrl}/api/guidance`;

  // messages 배열 형식으로 변환 (이미지가 있으면 마지막 user 메시지에 추가)
  let messagesToSend = messages.messages || [];
  
  // 이미지가 있으면 마지막 user 메시지에 이미지 추가
  if (imageDataUrl && messagesToSend.length > 0) {
    const lastMessage = messagesToSend[messagesToSend.length - 1];
    if (lastMessage.role === 'user') {
      // OpenAI 형식: content를 배열로 변환
      const imageUrl = imageDataUrl.startsWith('data:') 
        ? imageDataUrl 
        : `data:image/png;base64,${imageDataUrl}`;
      
      messagesToSend = [
        ...messagesToSend.slice(0, -1),
        {
          role: 'user',
          content: [
            { type: 'text', text: lastMessage.content },
            {
              type: 'image_url',
              image_url: { url: imageUrl },
            },
          ],
        },
      ];
    }
  }

  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages: messagesToSend,
      model: modelId,
      page_context_type: pageContextType,
      page_context_content: imageDataUrl || null,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`백엔드 API 오류 (${res.status}): ${err}`);
  }

  const data = await res.json();
  return { steps: data.steps || [] };
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

  const promptResult = await buildPrompt(context, pageContext, pageUrl, domainGuide);
  console.log('[vibe-guide] messages 원문:', promptResult);
  const imageDataUrl = pageContext.type === 'image' ? pageContext.content : null;

  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await callBackend(
        backendUrl,
        modelId,
        messages,
        pageContext.type,
        imageDataUrl
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
