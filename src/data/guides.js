/**
 * 도메인별 가이드 문서
 * 각 도메인에 대한 가이드 문서를 마크다운 형식으로 저장
 * AI 프롬프트 생성 시 참고 자료로 사용됨
 * 규칙: guides/{domainId}.md 파일만 추가하면 됨 (guides.js 수정 불필요)
 */

/**
 * 도메인 ID에 해당하는 가이드 문서 반환 (동적 import)
 * @param {string} domainId - 도메인 ID (예: 'google-ai-studio') → guides/{domainId}.md
 * @returns {Promise<string|null>} 가이드 문서 마크다운 또는 null
 */
export async function getDomainGuide(domainId) {
  if (!domainId || typeof domainId !== 'string') return null;
  try {
    const mod = await import(
      /* webpackChunkName: "guide-[request]" */
      `./guides/${domainId}.md`
    );
    return mod.default ?? null;
  } catch {
    return null;
  }
}

/**
 * 데모 모드용 가이드 문서 반환 (동적 import)
 * @returns {Promise<string|null>}
 */
export async function getDemoGuide() {
  try {
    const mod = await import(
      /* webpackChunkName: "guide-demo" */
      './guides/demo-guide.md'
    );
    return mod.default ?? null;
  } catch {
    return null;
  }
}

/**
 * URL에서 도메인 ID 추출
 * @param {string} url - 페이지 URL
 * @returns {string|null} 도메인 ID 또는 null
 */
export function getDomainIdFromUrl(url) {
  if (!url) return null;
  
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    
    // Guide.jsx의 TOOL_DOMAINS와 매칭 (manifest 도메인 목록과 동기화)
    const domainMap = {
      'n8n.io': 'n8n',
      'manus.ai': 'manus',
      'stitch.withgoogle.com': 'google-stitch',
      'aistudio.google.com': 'google-ai-studio',
      'supabase.com': 'supabase',
      'firebase.google.com': 'firebase',
      'stripe.com': 'stripe',
      'paypal.com': 'paypal',
      'www.paypal.com': 'paypal',
      'tosspayments.com': 'tosspayments',
      'www.tosspayments.com': 'tosspayments',
      'clerk.com': 'clerk',
      'aws.amazon.com': 'aws-s3',
      'vercel.com': 'vercel',
      'railway.app': 'railway',
      'render.com': 'render',
      'analytics.google.com': 'ga4',
      'posthog.com': 'posthog',
      'resend.com': 'resend',
      'sentry.io': 'sentry',
      'sanity.io': 'sanity',
      'www.sanity.io': 'sanity',
      'strapi.io': 'strapi',
      'github.com': 'github',
    };
    
    // 정확히 일치하는 도메인 확인
    if (domainMap[hostname]) {
      return domainMap[hostname];
    }
    
    // 서브도메인 확인 (예: www.github.com -> github.com)
    const parts = hostname.split('.');
    if (parts.length > 2) {
      const baseDomain = parts.slice(-2).join('.');
      if (domainMap[baseDomain]) {
        return domainMap[baseDomain];
      }
    }
    
    return null;
  } catch {
    return null;
  }
}
