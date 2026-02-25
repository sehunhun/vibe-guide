# Product Hunt 스냅샷 스크립트 — 문제 대응 보고

## 대상 이슈와 조치

| 문제 | 원인 | 조치 |
|------|------|------|
| **JS 렌더 전에 snapshot** | `wait_until="domcontentloaded"`만 사용하면 DOM만 준비되고 JS 렌더/SPA가 끝나기 전에 스냅샷 가능 | `wait_until="load"` 사용 + `main`/`[role=main]` 등 본문 노드 `attached` 대기 후 2초 추가 대기 |
| **Lazy loading 미실행** | 뷰포트 밖 이미지/영역이 로드되지 않은 상태에서 스냅샷 | 스냅샷 전에 `SCROLL_STEPS`(30)회만큼 세로 스크롤 + 스크롤 간 `SCROLL_PAUSE_SEC`(0.6초) 대기로 lazy 구간 로드 유도 |
| **Virtual list 특성** | DOM에 보이는 항목만 있어 한 번의 스냅샷으로 전체 리스트 누락 | 스크롤 구간마다 `page.evaluate`로 현재 viewport 기준 텍스트·링크만 추출해 리스트에 누적, 중복 라인은 Set으로 제거 후 하나의 마크다운으로 병합 |
| **Snapshot size 제한** | `innerHTML.substring(0, 80000)`로 인한 잘림 및 대용량 HTML | HTML 덤프 대신 **텍스트 중심 마크다운**만 추출(헤딩, 링크, 문단, 리스트). 크기 제한 없이 구간별로 append |

## 스크립트 동작 요약

1. **로드**  
   `page.goto(..., wait_until="load")` 후 `main`/`[role=main]`/`.main-content`/`body` 중 하나가 `attached` 될 때까지 대기(타임아웃 25초), 이후 2초 추가 대기.

2. **스크롤 수집**  
   `_scroll_and_collect(page)`:
   - 400px씩 아래로 스크롤 × 30단계, 단계마다 0.6초 대기.
   - 매 단계에서 `main`(또는 `body`) 기준으로 `_EXTRACT_MD_JS` 실행 → 텍스트 중심 마크다운 문자열 수집.
   - 새로 나온 라인만 `seen_lines`로 걸러서 리스트에 추가.
   - `scrollHeight`가 더 이상 늘지 않으면 한 번 위로 살짝 스크롤 후 한 번 더 수집하고 종료.

3. **텍스트 추출**  
   `_EXTRACT_MD_JS`: `main`/`body`를 순회하며 `h1`~`h6` → `#`~`####`, `a` → `[text](href)`, `p` → 문단, `li` → `- item` 형태로만 추출. 긴 텍스트는 2000자/200자 등으로 자르고, 동일 텍스트+href 조합은 `seen` Set으로 중복 제거.

4. **저장**  
   수집한 라인을 `## 본문 (스크롤 구간별 수집)` 아래에 이어붙여 `backend/snapshots/producthunt_snapshot.md`에 저장. HTML 블록 없음 → 파일 크기·snapshot size 제한 이슈 제거.

## 설정 상수

- `WAIT_LOAD_TIMEOUT_MS`: 60_000  
- `WAIT_CONTENT_TIMEOUT_MS`: 25_000  
- `SCROLL_STEPS`: 30  
- `SCROLL_PAUSE_SEC`: 0.6  

필요 시 위 값으로 “JS 렌더 대기 강도”, “lazy/virtual 수집 길이” 조정 가능.

## 참고

- Product Hunt가 Cloudflare 등으로 차단되면 본문이 “Performing security verification” 등으로만 나올 수 있음. 이 경우 동일 로직으로 스냅샷은 생성되나, 실제 제품 리스트는 나오지 않음.
- 접근성 스냅샷(`page.accessibility.snapshot`)은 Playwright 최신 버전에서 제거/이동되었을 수 있어, 현재 스크립트는 **HTML DOM 기반 텍스트 추출**만 사용함.
