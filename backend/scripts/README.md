# 크롤링 스크립트

## 개요

이 디렉토리에는 다음 스크립트들이 포함되어 있습니다:

1. **seed_capabilities.py** - Capabilities 테이블 초기 데이터 시드
2. **crawl_producthunt.py** - Product Hunt에서 상위 100개 툴 크롤링
3. **crawl_pricing.py** - 각 툴의 pricing 페이지에서 플랜 정보 크롤링
4. **run_crawler.py** - 통합 실행 스크립트 (Railway cron용)

## 환경변수 설정

다음 환경변수들이 필요합니다:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
OPENAI_API_KEY=your-openai-api-key
```

## 로컬 실행

### 1. Capabilities 시드

```bash
cd backend
python scripts/seed_capabilities.py
```

### 2. Product Hunt 크롤링

```bash
python scripts/crawl_producthunt.py
```

### 3. Pricing 페이지 크롤링

```bash
python scripts/crawl_pricing.py
```

### 4. 통합 실행

```bash
python scripts/run_crawler.py
```

## Railway Cron 설정

Railway에서 주 1회 자동 실행을 설정하려면:

1. Railway 대시보드에서 프로젝트 선택
2. **Settings** → **Cron Jobs** 이동
3. 새 Cron Job 추가:
   - **Schedule**: `0 0 * * 0` (매주 일요일 자정)
   - **Command**: `cd backend && python scripts/run_crawler.py`
   - **Environment**: 위의 환경변수들 설정

또는 `railway.json`에 cron 설정 추가:

```json
{
  "cron": {
    "crawl": {
      "schedule": "0 0 * * 0",
      "command": "cd backend && python scripts/run_crawler.py"
    }
  }
}
```

## 의존성 설치

```bash
pip install -r requirements.txt
playwright install chromium
```

## 주의사항

- Product Hunt 크롤링은 상위 100개만 가져옵니다
- 기존 데이터는 덮어쓰기됩니다 (매주 1회)
- Pricing 페이지 파싱 실패시 해당 툴은 스킵됩니다
- Rate limiting을 위해 각 요청 사이에 딜레이가 있습니다
