/**
 * 도메인별 가이드 문서
 * 각 도메인에 대한 가이드 문서를 마크다운 형식으로 저장
 * AI 프롬프트 생성 시 참고 자료로 사용됨
 * 백그라운드(서비스 워커)에서 동적 import가 불안정하므로 정적 import 사용
 */

import demoGuide from './guides/demo-guide.md';
import ga4Guide from './guides/ga4.md';
import googleAiStudioGuide from './guides/google-ai-studio.md';
import resendGuide from './guides/resend.md';
import sanityGuide from './guides/sanity.md';
import sentryGuide from './guides/sentry.md';
import stripeGuide from './guides/stripe.md';
import supabaseGuide from './guides/supabase.md';

const GUIDE_MAP = {
  'demo-guide': demoGuide,
  ga4: ga4Guide,
  'google-ai-studio': googleAiStudioGuide,
  resend: resendGuide,
  sanity: sanityGuide,
  sentry: sentryGuide,
  stripe: stripeGuide,
  supabase: supabaseGuide,
};

/**
 * 도메인 ID에 해당하는 가이드 문서 반환
 * @param {string} domainId - 도메인 ID (예: 'supabase')
 * @returns {Promise<string|null>} 가이드 문서 마크다운 또는 null
 */
export async function getDomainGuide(domainId) {
  if (!domainId || typeof domainId !== 'string') return null;
  const guide = GUIDE_MAP[domainId] ?? null;
  return Promise.resolve(guide ?? null);
}

/**
 * 데모 모드용 가이드 문서 반환
 * @returns {Promise<string|null>}
 */
export async function getDemoGuide() {
  return Promise.resolve(demoGuide ?? null);
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
