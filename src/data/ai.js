/**
 * AI API: 설문 + 플랜 + 페이지(HTML 또는 이미지) → "이 페이지에서 할 일" + 선택자
 * 백엔드 서버를 통해 OpenAI API 호출
 */

import { getDomainGuide, getDomainIdFromUrl } from './guides.js';
import { buildPlanContext, buildPageState } from './prompts/buildContext.js';
import { SYSTEM_PROMPT_TEXT } from './prompts/system-text.js';
import { SYSTEM_PROMPT_SELECTOR } from './prompts/system-selector.js';

/**
 * 시스템 프롬프트 로드
 */
// 정적 import로 변경 (동적 import가 background에서 문제를 일으킴)
import { SYSTEM_PROMPT } from './prompts/system.js';

function loadSystemPrompt(mode = 'default') {
  // 정적 import를 사용하므로 동기 함수로 변경
  if (mode === 'text') {
    return SYSTEM_PROMPT_TEXT;
  } else if (mode === 'selector') {
    return SYSTEM_PROMPT_SELECTOR;
  }
  return SYSTEM_PROMPT;
}

/**
 * AI용 메시지 배열 생성 (텍스트 생성용 - PAGE STATE 없음)
 * @param {{ plan: object, answers: object, previousStepsForUrl?: { steps: Array<{text,selector?}>, completed: boolean[] } }} context
 * @param {string} pageUrl
 * @param {string|null} domainGuide - 도메인별 가이드 문서 (마크다운)
 * @returns {Promise<{messages: Array<{role: string, content: string}>}>}
 */
export async function buildPromptForText(context, pageUrl, domainGuide = null) {
  try {
    console.log('[vibe-guide] buildPromptForText 시작');
    
    // 1. 시스템 프롬프트 로드 (텍스트 생성용)
    const systemPrompt = loadSystemPrompt('text');
    console.log('[vibe-guide] ===== SYSTEM PROMPT (TEXT) =====');
    console.log(systemPrompt);
    console.log('[vibe-guide] ========================');
    
    // 2. 전략/플랜 컨텍스트 생성
    const planContext = buildPlanContext(context, domainGuide);
    console.log('[vibe-guide] ===== PLAN CONTEXT =====');
    console.log(planContext);
    console.log('[vibe-guide] ========================');
    
    return {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: planContext },
      ],
    };
  } catch (error) {
    console.error('[vibe-guide] buildPromptForText 오류:', error);
    throw error;
  }
}

/**
 * AI용 메시지 배열 생성 (Selector 생성용 - PAGE STATE 포함)
 * @param {{ plan: object, answers: object, previousStepsForUrl?: { steps: Array<{text,selector?}>, completed: boolean[] } }} context
 * @param {{ type: 'html'|'image', content: string }} pageContext - html 문자열 또는 base64 이미지
 * @param {string} pageUrl
 * @param {string} stepText - 첫 번째 단계에서 생성된 텍스트
 * @param {string|null} domainGuide - 도메인별 가이드 문서 (마크다운)
 * @returns {Promise<{messages: Array<{role: string, content: string}>}>}
 */
export async function buildPromptForSelector(context, pageContext, pageUrl, stepText, domainGuide = null) {
  try {
    console.log('[vibe-guide] buildPromptForSelector 시작, stepText:', stepText);
    
    // 1. 시스템 프롬프트 로드 (Selector 생성용)
    const systemPrompt = loadSystemPrompt('selector');
    console.log('[vibe-guide] ===== SYSTEM PROMPT (SELECTOR) =====');
    console.log(systemPrompt);
    console.log('[vibe-guide] ========================');
    
    // 2. 전략/플랜 컨텍스트 생성
    const planContext = buildPlanContext(context, domainGuide);
    
    // 3. 페이지 상태 생성 (요소 목록 포함)
    const pageState = buildPageState(pageUrl, pageContext, context.previousStepsForUrl);
    
    // 4. Step text 추가
    const stepContext = `[STEP TEXT TO MATCH]\n${stepText}\n\n`;
    
    return {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: planContext },
        { role: 'user', content: stepContext + pageState },
      ],
    };
  } catch (error) {
    console.error('[vibe-guide] buildPromptForSelector 오류:', error);
    throw error;
  }
}

/**
 * AI용 메시지 배열 생성 (하위 호환용 - 기존 방식)
 * @param {{ plan: object, answers: object, previousStepsForUrl?: { steps: Array<{text,selector?}>, completed: boolean[] } }} context
 * @param {{ type: 'html'|'image', content: string }} pageContext - html 문자열 또는 base64 이미지
 * @param {string} pageUrl
 * @param {string|null} domainGuide - 도메인별 가이드 문서 (마크다운)
 * @returns {Promise<{messages: Array<{role: string, content: string}>}>}
 */
export async function buildPrompt(context, pageContext, pageUrl, domainGuide = null) {
  // 하위 호환을 위해 기존 방식 유지
  return buildPromptForSelector(context, pageContext, pageUrl, '', domainGuide);
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
async function callBackend(backendUrl, modelId, messages, pageContextType, pageContextContent) {
  if (!backendUrl || !backendUrl.trim()) {
    throw new Error('백엔드 서버 URL을 설정해주세요.');
  }

  // 백엔드 URL 정규화 (끝에 / 제거)
  const baseUrl = backendUrl.trim().replace(/\/$/, '');
  const apiUrl = `${baseUrl}/api/guidance`;

  // messages 배열 형식으로 변환 (이미지가 있으면 마지막 user 메시지에 추가)
  let messagesToSend = messages.messages || [];
  
  // 이미지가 있으면 마지막 user 메시지에 이미지 추가
  if (pageContextType === 'image' && pageContextContent && messagesToSend.length > 0) {
    const lastMessage = messagesToSend[messagesToSend.length - 1];
    if (lastMessage.role === 'user') {
      // OpenAI 형식: content를 배열로 변환
      const imageUrl = pageContextContent.startsWith('data:') 
        ? pageContextContent 
        : `data:image/png;base64,${pageContextContent}`;
      
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
      page_context_content: pageContextContent || null,
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
  try {
    console.log('[vibe-guide] getPageGuidance 시작 (2단계 방식):', { pageUrl, type: pageContext.type });
    
    const { modelId, backendUrl } = await getStoredAISettings();
    
    if (!backendUrl || !backendUrl.trim()) {
      throw new Error('설정에서 백엔드 서버 URL을 입력해주세요.');
    }

    // 도메인별 가이드 문서 로드
    console.log('[vibe-guide] 도메인 가이드 로드 시작');
    const domainId = getDomainIdFromUrl(pageUrl);
    const domainGuide = domainId ? await getDomainGuide(domainId) : null;
    console.log('[vibe-guide] 도메인 가이드 로드 완료:', domainGuide ? '있음' : '없음');

    // ===== 1단계: 텍스트 생성 (PAGE STATE 없이) =====
    console.log('[vibe-guide] ===== 1단계: 텍스트 생성 시작 =====');
    const textPrompt = await buildPromptForText(context, pageUrl, domainGuide);
    
    const maxAttempts = 3;
    let stepText = null;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        console.log(`[vibe-guide] 텍스트 생성 API 호출 시도 ${attempt}/${maxAttempts}`);
        const textResult = await callBackend(
          backendUrl,
          modelId,
          textPrompt,
          'html', // PAGE STATE 없으므로 타입은 중요하지 않음
          null // 콘텐츠 없음
        );
        if (!isParseFailureResult(textResult) && textResult?.steps?.[0]?.text) {
          stepText = textResult.steps[0].text;
          console.log('[vibe-guide] 텍스트 생성 성공:', stepText);
          break;
        }
        if (attempt < maxAttempts) {
          console.warn(`[vibe-guide] 텍스트 생성 실패, 재시도 ${attempt}/${maxAttempts}`);
        }
      } catch (err) {
        console.error(`[vibe-guide] 텍스트 생성 API 호출 실패 (시도 ${attempt}/${maxAttempts}):`, err);
        if (attempt >= maxAttempts) throw err;
      }
    }
    
    if (!stepText) {
      console.warn('[vibe-guide] 텍스트 생성 실패, fallback 반환');
      return { steps: [{ text: PARSE_FAILURE_MESSAGE, selector: null }] };
    }

    // ===== 2단계: Selector 생성 (PAGE STATE 포함) =====
    console.log('[vibe-guide] ===== 2단계: Selector 생성 시작 =====');
    const selectorPrompt = await buildPromptForSelector(context, pageContext, pageUrl, stepText, domainGuide);
    
    // HTML 또는 이미지 콘텐츠를 백엔드에 전달
    const pageContextContent = pageContext.content || null;
    console.log('[vibe-guide] pageContextContent 전달:', pageContext.type, pageContextContent ? `길이: ${pageContextContent.length}` : '없음');

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        console.log(`[vibe-guide] Selector 생성 API 호출 시도 ${attempt}/${maxAttempts}`);
        const selectorResult = await callBackend(
          backendUrl,
          modelId,
          selectorPrompt,
          pageContext.type,
          pageContextContent
        );
        if (!isParseFailureResult(selectorResult) && selectorResult?.steps?.[0]) {
          // 텍스트는 첫 번째 단계에서 생성한 것을 사용, selector는 두 번째 단계에서 생성한 것을 사용
          const finalResult = {
            steps: [{
              text: stepText,
              selector: selectorResult.steps[0].selector || null,
            }],
          };
          console.log('[vibe-guide] 최종 결과:', finalResult);
          return finalResult;
        }
        if (attempt < maxAttempts) {
          console.warn(`[vibe-guide] Selector 생성 실패, 재시도 ${attempt}/${maxAttempts}`);
        }
      } catch (err) {
        console.error(`[vibe-guide] Selector 생성 API 호출 실패 (시도 ${attempt}/${maxAttempts}):`, err);
        if (attempt >= maxAttempts) {
          // Selector 생성 실패해도 텍스트는 있으므로 반환
          console.warn('[vibe-guide] Selector 생성 실패, 텍스트만 반환');
          return { steps: [{ text: stepText, selector: null }] };
        }
      }
    }

    console.warn('[vibe-guide] Selector 생성 실패, 텍스트만 반환');
    return { steps: [{ text: stepText, selector: null }] };
  } catch (error) {
    console.error('[vibe-guide] getPageGuidance 전체 오류:', error);
    console.error('[vibe-guide] 오류 스택:', error.stack);
    throw error;
  }
}
