"""
Capabilities 시드 스크립트
spec 파일 기반으로 capabilities 테이블을 채웁니다.
"""
import os
import sys
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

# Supabase 연결
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")  # Service role key 필요

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
    sys.exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Spec 파일 기반 Capabilities 정의
CAPABILITIES = [
    # Auth
    {"id": "AUTH_BASIC", "category": "auth", "description": "기본 이메일/비밀번호 인증"},
    {"id": "AUTH_SOCIAL", "category": "auth", "description": "소셜 로그인 (구글, 깃허브, 카카오 등)"},
    {"id": "AUTH_MFA", "category": "auth", "description": "다단계 인증 (2FA, MFA)"},
    {"id": "AUTH_SSO", "category": "auth", "description": "SSO (Single Sign-On)"},
    
    # Payment
    {"id": "PAYMENT_ONE_TIME", "category": "payment", "description": "일회성 결제"},
    {"id": "PAYMENT_SUBSCRIPTION", "category": "payment", "description": "구독/정기결제"},
    {"id": "PAYMENT_INVOICE", "category": "payment", "description": "인보이스 발행"},
    
    # Database & Storage
    {"id": "DB_HOSTED", "category": "database", "description": "호스팅된 데이터베이스"},
    {"id": "DB_REALTIME", "category": "database", "description": "실시간 데이터베이스 (WebSocket)"},
    {"id": "STORAGE_OBJECT", "category": "storage", "description": "객체 스토리지 (파일 업로드)"},
    {"id": "STORAGE_CDN", "category": "storage", "description": "CDN (콘텐츠 전송 네트워크)"},
    
    # Compute
    {"id": "EDGE_FUNCTION", "category": "compute", "description": "엣지 함수 (Edge Functions)"},
    {"id": "SERVERLESS_FUNCTION", "category": "compute", "description": "서버리스 함수"},
    {"id": "BACKGROUND_JOBS", "category": "compute", "description": "백그라운드 작업/큐"},
    {"id": "CRON_JOBS", "category": "compute", "description": "스케줄 작업 (Cron)"},
    
    # CMS & Content
    {"id": "CMS_BUILTIN", "category": "cms", "description": "내장 CMS"},
    {"id": "CMS_HEADLESS", "category": "cms", "description": "헤드리스 CMS"},
    
    # Analytics & Monitoring
    {"id": "ANALYTICS_BASIC", "category": "analytics", "description": "기본 분석 (방문자, 페이지뷰)"},
    {"id": "ANALYTICS_ADVANCED", "category": "analytics", "description": "고급 분석 (커스텀 이벤트, 퍼널)"},
    {"id": "MONITORING", "category": "monitoring", "description": "모니터링 (에러, 성능)"},
    {"id": "LOGGING", "category": "monitoring", "description": "로깅 시스템"},
    
    # Team & Collaboration
    {"id": "TEAM_COLLAB", "category": "team", "description": "팀 협업 기능"},
    {"id": "ROLE_BASED_ACCESS", "category": "team", "description": "역할 기반 접근 제어 (RBAC)"},
    {"id": "USER_MANAGEMENT", "category": "team", "description": "사용자 관리"},
    
    # API & Integration
    {"id": "API_PUBLIC", "category": "api", "description": "공개 API 제공"},
    {"id": "API_WEBHOOK", "category": "api", "description": "웹훅 지원"},
    {"id": "API_GRAPHQL", "category": "api", "description": "GraphQL API"},
    {"id": "API_REST", "category": "api", "description": "REST API"},
    
    # DevOps & Infrastructure
    {"id": "CI_CD", "category": "devops", "description": "CI/CD 파이프라인"},
    {"id": "CUSTOM_DOMAIN", "category": "devops", "description": "커스텀 도메인 연결"},
    {"id": "SSL", "category": "devops", "description": "SSL/TLS 인증서"},
    {"id": "ENV_VARS", "category": "devops", "description": "환경변수 관리"},
    
    # Networking
    {"id": "BANDWIDTH", "category": "networking", "description": "대역폭"},
    {"id": "REQUEST_LIMIT", "category": "networking", "description": "요청 제한"},
    
    # Email & Communication
    {"id": "EMAIL_SEND", "category": "communication", "description": "이메일 발송"},
    {"id": "EMAIL_TEMPLATE", "category": "communication", "description": "이메일 템플릿"},
    {"id": "NOTIFICATION", "category": "communication", "description": "알림 (푸시, SMS 등)"},
    
    # Security
    {"id": "DDoS_PROTECTION", "category": "security", "description": "DDoS 보호"},
    {"id": "WAF", "category": "security", "description": "웹 애플리케이션 방화벽"},
    {"id": "RATE_LIMITING", "category": "security", "description": "속도 제한"},
]

def seed_capabilities():
    """Capabilities를 DB에 삽입 (중복시 무시)"""
    print(f"Seeding {len(CAPABILITIES)} capabilities...")
    
    inserted = 0
    skipped = 0
    
    for cap in CAPABILITIES:
        try:
            # Upsert (중복시 업데이트)
            result = supabase.table("capabilities").upsert(
                cap,
                on_conflict="id"
            ).execute()
            
            if result.data:
                inserted += 1
                print(f"✓ {cap['id']} - {cap['description']}")
            else:
                skipped += 1
                
        except Exception as e:
            print(f"✗ Error inserting {cap['id']}: {e}")
    
    print(f"\n✅ Complete: {inserted} inserted, {skipped} skipped")

if __name__ == "__main__":
    seed_capabilities()
