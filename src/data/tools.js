// 설문 질문 정의
export const QUESTIONS = [
  {
    id: 'skill',
    title: '개발 지식이 어느 정도인가요?',
    emoji: '🧠',
    type: 'single',
    options: [
      { id: 'none', label: '아예 모름', desc: '코드가 뭔지도 잘 모름' },
      { id: 'vibe', label: '바이브 코딩만 몇 번 해봤음', desc: 'AI한테 시켜서 만들어본 경험 있음' },
      { id: 'nocode', label: '노코드 툴 써본 적 있음', desc: 'Notion, Wix, Squarespace 등' },
      { id: 'some', label: '약간의 코딩 지식 있음', desc: 'HTML/CSS 정도는 이해함' },
    ],
  },
  {
    id: 'siteType',
    title: '어떤 웹사이트를 만들고 싶나요?',
    emoji: '🌐',
    type: 'single',
    options: [
      { id: 'landing', label: '랜딩페이지 (데모)', desc: '제품/서비스 소개, 신청 받기' },
      { id: 'community', label: '커뮤니티', desc: '회원들이 글 쓰고 소통하는 공간', disabled: true },
      { id: 'store', label: '온라인 쇼핑몰', desc: '상품 판매, 결제, 주문 관리', disabled: true },
      { id: 'portfolio', label: '포트폴리오 / 블로그', desc: '나를 소개하는 개인 사이트', disabled: true },
      { id: 'saas', label: 'SaaS / 웹 앱', desc: '로그인해서 사용하는 서비스', disabled: true },
      { id: 'content', label: '콘텐츠 판매', desc: '강의, 전자책, 템플릿 판매', disabled: true },
    ],
  },
  {
    id: 'bizType',
    title: '어떤 비즈니스인가요?',
    emoji: '💼',
    type: 'single',
    options: [
      { id: 'onetime', label: '일회성 프로젝트', desc: '한 번 만들고 끝' },
      { id: 'personal', label: '개인 브랜드 / 프리랜서', desc: '디자이너, 개발자, 마케터, 컨설턴트 등' },
      { id: 'edu', label: '온라인 교육 / 콘텐츠 판매', desc: '강의, 전자책, 템플릿, 코칭' },
      { id: 'b2b', label: 'B2B 서비스 / SaaS', desc: '솔루션 소개, 데모 신청, 무료 체험' },
      { id: 'event', label: '이벤트 / 프로모션', desc: '웨비나, 세미나, 한정 판매, 사전 예약' },
      { id: 'tool', label: '업무 보조 도구', desc: '내부용 대시보드, 자동화 툴' },
    ],
  },
  {
    id: 'features',
    title: '필요한 기능을 모두 선택해주세요',
    emoji: '⚙️',
    type: 'multi',
    options: [
      { id: 'socialLogin', label: '소셜 로그인', desc: '구글, 카카오 등으로 가입/로그인' },
      { id: 'payment', label: '결제', desc: '카드, 간편결제 등' },
      { id: 'form', label: '신청 폼', desc: '이름, 연락처 등 정보 수집' },
      { id: 'email', label: '이메일 전송', desc: '가입 환영, 알림 메일 발송' },
      { id: 'notification', label: '알림 & 구독', desc: '푸시 알림, 뉴스레터 구독' },
      { id: 'admin', label: '관리자 권한', desc: '관리자 페이지, 콘텐츠 관리' },
      { id: 'subscription', label: '구독 (정기결제)', desc: '월/연 구독 플랜 관리' },
      { id: 'referral', label: '추천인 코드', desc: '초대 링크, 리워드 시스템' },
      { id: 'analytics', label: '방문자 분석', desc: '조회수, 유입 경로 확인' },
      { id: 'multilang', label: '다국어 지원', desc: '영어 등 다국어 버전' },
      { id: 'ops', label: '배포 후 운영/유지보수', desc: '서버 관리 없이 자동 운영' },
      { id: 'api', label: '외부 API 연동', desc: '슬랙, 구글 시트, Zapier 등' },
    ],
  },
  {
    id: 'budget',
    title: '월 예산 계획은 어떻게 되나요?',
    emoji: '💰',
    type: 'single',
    options: [
      { id: 'free', label: '무조건 무료', desc: '돈 쓰고 싶지 않음' },
      { id: 'usage', label: '사용량에 따라 부과', desc: '쓴 만큼만 내는 방식 선호' },
      { id: 'low', label: '월 ~3만원', desc: '소규모 사이드 프로젝트 수준' },
      { id: 'mid', label: '월 3~5만원', desc: '가벼운 운영 비용은 OK' },
      { id: 'high', label: '월 5~10만원', desc: '안정적 서비스 운영 가능' },
      { id: 'pro', label: '월 10~30만원', desc: '팀/비즈니스 수준 투자 가능' },
    ],
  },
];

// 툴 데이터
export const TOOLS = [
  {
    id: 'google-ai-studio',
    name: 'Google AI Studio',
    category: 'vibe',
    url: 'https://aistudio.google.com/apps',
    logo: '🤖',
    tagline: 'Google AI로 랜딩페이지 제작',
    desc: 'Google AI Studio로 랜딩페이지를 만들 수 있는 툴',
    strengths: ['landing', 'demo', 'personal', 'onetime'],
    features: ['form', 'ops'],
    skillMin: 'none',
    budgetRange: ['free', 'usage', 'low'],
    pricing: '무료 시작',
  },
  {
    id: 'framer',
    name: 'Framer',
    category: 'nocode',
    url: 'https://www.framer.com',
    logo: '🖼️',
    tagline: '디자인이 아름다운 랜딩페이지',
    desc: '디자인 감각이 있는 랜딩페이지를 가장 빠르게 만들 수 있는 툴',
    strengths: ['landing', 'portfolio', 'personal', 'onetime'],
    features: ['form', 'analytics', 'ops'],
    skillMin: 'none',
    budgetRange: ['free', 'low', 'mid'],
    pricing: '무료 시작 / 유료 월 $10~',
  },
  {
    id: 'webflow',
    name: 'Webflow',
    category: 'nocode',
    url: 'https://webflow.com',
    logo: '🌊',
    tagline: '전문가급 웹사이트 노코드 제작',
    desc: 'HTML/CSS 개념을 시각적으로 다루는 강력한 노코드 툴. 커스텀 자유도가 높음',
    strengths: ['landing', 'portfolio', 'b2b', 'personal'],
    features: ['form', 'cms', 'analytics', 'ops', 'email'],
    skillMin: 'nocode',
    budgetRange: ['low', 'mid', 'high'],
    pricing: '무료 시작 / 유료 월 $14~',
  },
  {
    id: 'bubble',
    name: 'Bubble',
    category: 'nocode',
    url: 'https://bubble.io',
    logo: '🫧',
    tagline: '로직 있는 앱을 노코드로',
    desc: '로그인, 결제, DB까지 코드 없이 구현 가능한 풀스택 노코드 플랫폼',
    strengths: ['saas', 'community', 'tool', 'b2b'],
    features: ['socialLogin', 'payment', 'admin', 'subscription', 'api', 'ops'],
    skillMin: 'nocode',
    budgetRange: ['low', 'mid', 'high', 'pro'],
    pricing: '무료 시작 / 유료 월 $29~',
  },
  {
    id: 'bolt',
    name: 'Bolt.new',
    category: 'vibe',
    url: 'https://bolt.new',
    logo: '⚡',
    tagline: 'AI로 풀스택 앱 즉시 생성',
    desc: '채팅만으로 풀스택 웹앱을 만들어주는 AI 바이브코딩 툴. 결과물이 실제 코드',
    strengths: ['saas', 'tool', 'landing', 'community'],
    features: ['socialLogin', 'payment', 'form', 'admin', 'api'],
    skillMin: 'vibe',
    budgetRange: ['free', 'usage', 'low'],
    pricing: '무료 크레딧 / 유료 월 $20~',
  },
  {
    id: 'cursor',
    name: 'Cursor',
    category: 'vibe',
    url: 'https://cursor.sh',
    logo: '🖱️',
    tagline: 'AI 페어 프로그래밍 에디터',
    desc: 'VS Code 기반 AI 코딩 에디터. 바이브코딩으로 실제 코드를 작성/수정',
    strengths: ['saas', 'tool', 'b2b'],
    features: ['socialLogin', 'payment', 'admin', 'subscription', 'api', 'referral', 'multilang'],
    skillMin: 'some',
    budgetRange: ['free', 'usage', 'low', 'mid'],
    pricing: '무료 시작 / 유료 월 $20',
  },
  {
    id: 'lovable',
    name: 'Lovable',
    category: 'vibe',
    url: 'https://lovable.dev',
    logo: '💜',
    tagline: 'AI로 앱을 채팅처럼 만들기',
    desc: '디자인부터 기능까지 AI와 대화로 완성하는 바이브코딩 플랫폼',
    strengths: ['landing', 'saas', 'tool', 'b2b'],
    features: ['socialLogin', 'payment', 'form', 'admin', 'api'],
    skillMin: 'vibe',
    budgetRange: ['free', 'low', 'mid'],
    pricing: '무료 크레딧 / 유료 월 $20~',
  },
  {
    id: 'softr',
    name: 'Softr',
    category: 'nocode',
    url: 'https://www.softr.io',
    logo: '🧱',
    tagline: 'Airtable 기반 앱 빠르게',
    desc: 'Airtable/구글 시트를 DB로 쓰는 노코드 앱 빌더. 멤버십, 포털에 강함',
    strengths: ['community', 'tool', 'b2b', 'edu'],
    features: ['socialLogin', 'admin', 'form', 'email', 'api'],
    skillMin: 'none',
    budgetRange: ['free', 'low', 'mid'],
    pricing: '무료 시작 / 유료 월 $49~',
  },
  {
    id: 'carrd',
    name: 'Carrd',
    category: 'nocode',
    url: 'https://carrd.co',
    logo: '📄',
    tagline: '초간단 원페이지 사이트',
    desc: '가장 빠르고 저렴하게 단순한 랜딩페이지/소개 페이지를 만드는 툴',
    strengths: ['landing', 'personal', 'onetime', 'event'],
    features: ['form', 'ops'],
    skillMin: 'none',
    budgetRange: ['free', 'low'],
    pricing: '무료 / 유료 연 $19~',
  },
  {
    id: 'teachable',
    name: 'Teachable',
    category: 'nocode',
    url: 'https://teachable.com',
    logo: '🎓',
    tagline: '강의 판매 전문 플랫폼',
    desc: '온라인 강의, 코칭, 디지털 상품 판매에 특화된 올인원 플랫폼',
    strengths: ['edu', 'content', 'personal'],
    features: ['payment', 'subscription', 'email', 'admin', 'ops'],
    skillMin: 'none',
    budgetRange: ['free', 'low', 'mid', 'high'],
    pricing: '무료 시작 / 유료 월 $39~',
  },
  {
    id: 'notion',
    name: 'Notion + Super',
    category: 'nocode',
    url: 'https://super.so',
    logo: '📝',
    tagline: 'Notion을 웹사이트로',
    desc: 'Notion 페이지를 Super로 웹사이트화. 블로그, 포트폴리오, 간단한 랜딩에 적합',
    strengths: ['portfolio', 'personal', 'onetime', 'edu'],
    features: ['form', 'ops', 'analytics'],
    skillMin: 'none',
    budgetRange: ['free', 'low'],
    pricing: '무료 / Super 유료 월 $16~',
  },
  {
    id: 'replit',
    name: 'Replit',
    category: 'vibe',
    url: 'https://replit.com',
    logo: '🔁',
    tagline: 'AI 코딩 + 호스팅 올인원',
    desc: '브라우저에서 코드 작성, AI 보조, 즉시 배포까지 한 곳에서',
    strengths: ['tool', 'saas', 'b2b'],
    features: ['socialLogin', 'api', 'ops', 'admin'],
    skillMin: 'some',
    budgetRange: ['free', 'usage', 'low'],
    pricing: '무료 시작 / 유료 월 $20~',
  },
  {
    id: 'vercel',
    name: 'Vercel',
    category: 'vibe',
    url: 'https://vercel.com',
    logo: '▲',
    tagline: '배포 & 호스팅',
    desc: '만든 사이트를 배포하고 도메인을 연결하는 플랫폼',
    strengths: ['landing', 'ops'],
    features: ['ops'],
    skillMin: 'none',
    budgetRange: ['free', 'usage', 'low'],
    pricing: '무료 시작',
  },
];

// 스킬 레벨 순서
const SKILL_ORDER = ['none', 'vibe', 'nocode', 'some', 'dev'];

// 매칭 점수 계산
export function scoreTool(tool, answers) {
  let score = 0;

  const { skill, siteType, bizType, features = [], budget } = answers;

  // 스킬 레벨 호환 여부 (최소 요구 스킬 이상이어야 함)
  const userSkillIdx = SKILL_ORDER.indexOf(skill);
  const minSkillIdx = SKILL_ORDER.indexOf(tool.skillMin);
  if (userSkillIdx < minSkillIdx) return -1; // 불가

  // 사이트 유형 매치
  if (tool.strengths.includes(siteType)) score += 30;

  // 비즈니스 유형 매치
  if (tool.strengths.includes(bizType)) score += 20;

  // 필요 기능 매치
  const featureMatch = features.filter(f => tool.features.includes(f)).length;
  score += featureMatch * 10;

  // 예산 매치
  if (tool.budgetRange.includes(budget)) score += 20;

  return score;
}

export function getRecommendedTools(answers) {
  const scored = TOOLS.map(tool => ({
    ...tool,
    score: scoreTool(tool, answers),
  }))
    .filter(t => t.score >= 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, 4); // 상위 4개 추천
}
