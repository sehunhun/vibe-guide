접속: https://supabase.com

## 조회해야 할 값과 그 위치
Project URL: https://supabase.com/dashboard/project/{project-id}/settings/api-keys
anon public key: https://supabase.com/dashboard/project/{project-id}/settings/api-keys/legacy

- 위 두 값을 찾은 경우 이 페이지에서 할 일을 마칩니다.
- 구체적인 반환 형식
{ "steps": [] }


## 조회 경로
1. Login
2. Dashboard
3. Create(or select) a project → Project URL
4. Project Settings
5. API KEYS → anon public key


## 복사해야 할 환경변수

Project URL → VITE_SUPABASE_URL (google-ai-studio)
anon public key → VITE_SUPABASE_ANON_KEY (google-ai-studio)