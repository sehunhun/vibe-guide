/**
 * 도메인별 가이드 문서
 * 각 도메인에 대한 가이드 문서를 마크다운 형식으로 저장
 * AI 프롬프트 생성 시 참고 자료로 사용됨
 */

// 가이드 문서를 정적 import (webpack의 raw-loader가 처리)
import googleAiStudioGuide from './guides/google-ai-studio.md';
import demoGuide from './guides/demo-guide.md';

/**
 * 도메인 ID에 해당하는 가이드 문서 반환
 * @param {string} domainId - 도메인 ID (예: 'google-ai-studio')
 * @returns {Promise<string|null>} 가이드 문서 마크다운 또는 null
 */
export async function getDomainGuide(domainId) {
  try {
    const guides = {
      'google-ai-studio': googleAiStudioGuide,
      // 다른 가이드도 여기에 추가
    };
    return guides[domainId] || null;
  } catch (err) {
    console.error('[vibe-guide] 가이드 문서 로드 실패:', err);
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
    
    // Guide.jsx의 TOOL_DOMAINS와 매칭
    const domainMap = {
      'aistudio.google.com': 'google-ai-studio',
      'github.com': 'github',
      'framer.com': 'framer',
      'webflow.com': 'webflow',
      'webflow.io': 'webflow',
      'bubble.io': 'bubble',
      'bolt.new': 'bolt',
      'stackblitz.com': 'bolt',
      'cursor.sh': 'cursor',
      'cursor.com': 'cursor',
      'lovable.dev': 'lovable',
      'gptengineer.app': 'lovable',
      'softr.io': 'softr',
      'carrd.co': 'carrd',
      'teachable.com': 'teachable',
      'notion.so': 'notion',
      'notion.site': 'notion',
      'super.so': 'notion',
      'replit.com': 'replit',
      'vercel.com': 'vercel',
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
