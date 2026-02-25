---
name: browser-navigator
description: Navigate web pages, extract content via accessibility snapshot, and interact with elements using cursor-ide-browser MCP. Use when the user asks to open a URL, scrape a page, test a web app, fill forms, click elements, or automate browser workflows.
---

# Browser Navigator

cursor-ide-browser MCP로 웹 페이지 접속, 콘텐츠 확인, 요소 상호작용을 수행하는 워크플로우.

## Lock/Unlock 순서 (필수)

1. **탭이 없으면**: `browser_navigate` → `browser_lock` → (상호작용) → `browser_unlock`
2. **탭이 이미 있으면**: `browser_tabs`(action: list)로 확인 후 `browser_lock` 먼저 호출
3. 상호작용 전에는 반드시 `browser_snapshot`으로 페이지 구조와 element ref 확보

`browser_lock`은 기존 탭이 있어야 하므로, navigate 전에는 lock 불가.

## 1단계: URL 접속

- `browser_navigate`에 `url` 전달.
- 필요 시 `newTab: true`, `position: "side"`(사이드 패널), `take_screenshot_afterwards: true` 사용.

## 2단계: 콘텐츠·구조 확인

- **반드시** 클릭/입력/호버 전에 `browser_snapshot` 호출.
- 스냅샷으로 페이지 구조와 각 요소의 ref(참조)를 얻음. 이 ref로만 `browser_click`, `browser_type`, `browser_fill` 등 사용 가능.
- 스냅샷 결과를 파싱해 사용자가 요청한 정보(목록, 링크, 텍스트) 추출.

## 3단계: 요소 상호작용

- `browser_click`: 스냅샷에 나온 ref 사용 (예: 특정 링크/버튼).
- `browser_type`: 텍스트 추가. `browser_fill`: 입력값 비우고 채우기 (contenteditable 지원).
- 스크롤 필요 시 `browser_scroll`(nested scroll일 때 `scrollIntoView: true`).
- 대기: 한 번에 긴 대기보다 1–3초 간격으로 대기 후 `browser_snapshot`으로 준비 여부 확인.

## 4단계: 작업 종료

- 해당 턴에서 브라우저 작업을 모두 마치면 `browser_unlock` 호출.

## 참고

- **다이얼로그**: `browser_handle_dialog`를 트리거 전에 호출. `accept: false`(취소), `promptText`(프롬프트 값).
- **iframe**: 내부 요소는 접근 불가. iframe 밖 요소만 상호작용 가능.
- **데이터 처리**: 스냅샷/페이지 텍스트를 파일로 저장한 뒤 `scripts/navigate_and_extract.py`로 후처리 가능.

## 유틸 스크립트

**scripts/navigate_and_extract.py**: 텍스트/마크다운 파일 경로를 인자로 받아 제목, 글자 수, 링크 수 등 요약 반환. 스냅샷 결과를 파일로 저장한 경우 사용.

```bash
python scripts/navigate_and_extract.py <path_to_text_or_markdown_file>
```
