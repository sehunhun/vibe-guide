접속: https://dashboard.stripe.com

## 조회해야 할 값
Client ID 
Secret Key 

- 위 두 값을 찾은 경우 이 페이지에서 할 일을 마칩니다.
- 구체적인 반환 형식
{ "steps": [] }


## 조회 경로
1. Login: PayPal Developer Dashboard에 로그인합니다.
2. Apps & Credentials: 왼쪽 사이드바 메뉴에서 Apps & Credentials를 클릭합니다.
3. Sandbox / Live 선택: 화면 상단의 토글을 이용해 Sandbox(테스트용) 또는 Live(실결제용) 모드를 선택합니다.
4. Select (or Create) an App: 목록에서 기존 앱을 선택하거나, 없다면 Create App을 클릭하여 새 앱을 생성합니다.
5. Credentials 확인: 앱 상세 페이지에서 Client ID와 Secret (Show 클릭 시 노출) 값을 확인합니다.



## 복사해야 할 환경변수

Publishable key → VITE_PAYPAL_CLIENT_ID (google-ai-studio)
Secret key → PAYPAL_SECRET_KEY (google-ai-studio)
