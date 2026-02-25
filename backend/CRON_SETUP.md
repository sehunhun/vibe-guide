# Railway Cron 설정 가이드

## 개요

매주 1회 Product Hunt 크롤링과 Pricing 페이지 크롤링을 자동으로 실행합니다.

## 설정 방법

### 방법 1: Railway 대시보드 (권장)

1. Railway 대시보드에서 프로젝트 선택
2. **Settings** → **Cron Jobs** 이동
3. **New Cron Job** 클릭
4. 다음 설정 입력:
   - **Name**: `weekly-crawler`
   - **Schedule**: `0 0 * * 0` (매주 일요일 자정 UTC)
   - **Command**: `cd backend && python scripts/run_crawler.py`
   - **Environment Variables**: 
     - `SUPABASE_URL`
     - `SUPABASE_SERVICE_ROLE_KEY`
     - `OPENAI_API_KEY`

### 방법 2: Railway CLI

```bash
railway cron create \
  --name weekly-crawler \
  --schedule "0 0 * * 0" \
  --command "cd backend && python scripts/run_crawler.py"
```

## Cron Schedule 형식

- `0 0 * * 0`: 매주 일요일 자정 (UTC)
- `0 0 1 * *`: 매월 1일 자정
- `0 */6 * * *`: 6시간마다

## 환경변수 확인

Railway 대시보드에서 다음 환경변수가 설정되어 있는지 확인:

```bash
SUPABASE_URL=https://ppbxyhknhygviehjvaro.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
OPENAI_API_KEY=your-openai-api-key
```

## 로그 확인

Railway 대시보드의 **Deployments** 탭에서 cron job 실행 로그를 확인할 수 있습니다.

## 수동 실행

Railway CLI로 수동 실행:

```bash
railway run python backend/scripts/run_crawler.py
```

또는 로컬에서:

```bash
cd backend
python scripts/run_crawler.py
```
