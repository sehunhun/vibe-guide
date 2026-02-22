# Vibe Guide Backend API

FastAPI 기반 백엔드 서버로, OpenAI API를 프록시하여 AI 가이드를 생성합니다.

## 배포 방법 (Railway)

1. Railway에 프로젝트 생성
2. GitHub 저장소 연결 또는 직접 배포
3. 환경변수 설정:
   - `OPENAI_API_KEY`: OpenAI API 키 (필수)
   - `PORT`: Railway가 자동으로 설정 (기본값 사용)
4. 배포 완료 후 생성된 URL을 확장 프로그램 설정에 입력

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
