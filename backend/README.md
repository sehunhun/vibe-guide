# Vibe Guide Backend API

FastAPI 기반 백엔드 서버로, OpenAI API를 프록시하여 AI 가이드를 생성합니다.

## 배포 방법 (Railway)

### 방법 1: Railway CLI 사용 (권장)

```bash
# backend 폴더로 이동
cd backend

# Railway 로그인
railway login

# 프로젝트 초기화 (새 프로젝트인 경우)
railway init

# 배포
railway up
```

### 방법 2: Railway 웹 대시보드 사용

1. Railway 대시보드에서 새 프로젝트 생성
2. GitHub 저장소 연결
3. **Settings → Root Directory를 `backend`로 설정**
4. 환경변수 설정:
   - `OPENAI_API_KEY`: OpenAI API 키 (필수)
5. 배포 완료 후 생성된 URL을 `src/data/ai.js`의 `BACKEND_URL`에 하드코딩

## 로컬 실행

```bash
# 의존성 설치
pip install -r requirements.txt

# 환경변수 설정
export OPENAI_API_KEY=your-api-key-here

# 서버 실행
uvicorn main:app --host 0.0.0.0 --port 8000
```

## API 엔드포인트

### POST /api/guidance

AI 가이드 생성 요청

**Request Body:**
```json
{
  "system": "시스템 프롬프트",
  "user": "사용자 프롬프트",
  "model": "gpt-4o-mini",
  "page_context_type": "html" | "image",
  "page_context_content": "HTML 문자열 또는 base64 이미지"
}
```

**Response:**
```json
{
  "steps": [
    {
      "text": "안내 문장",
      "selector": "CSS 선택자 또는 null"
    }
  ]
}
```

## 환경변수

- `OPENAI_API_KEY` (필수): OpenAI API 키
