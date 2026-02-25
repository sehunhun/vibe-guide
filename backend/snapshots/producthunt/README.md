# Snapshots

브라우저 스냅샷/페이지 덤프를 **마크다운(.md)**으로 저장하는 폴더입니다.  
(browser-navigator skill: 스냅샷을 마크다운 파일로 저장한 뒤 후처리)

- **용도**: 스냅샷 본문을 마크다운으로 두면 selector 정리·크롤러 수정 시 참고하고, `navigate_and_extract.py`로 요약 가능.
- **저장 방법**
  - MCP로 스냅샷 찍은 뒤, 결과 본문을 복사해 `producthunt_snapshot.md` 등으로 저장
  - 또는 `python scripts/save_producthunt_snapshot.py` 실행 → `producthunt_snapshot.md` 자동 생성 (접근성 트리 + 본문 HTML)
- **활용**: `@backend/snapshots/producthunt_snapshot.md` 참조로 selector/스크립트 수정, 또는 `python scripts/navigate_and_extract.py backend/snapshots/producthunt_snapshot.md` 로 요약.

### pricing/

각 툴의 `website` + `/pricing` 페이지를 커스텀 DOM 추출로 마크다운 저장. 파일명 `{slug}.md` (덮어쓰기 용이).

- `python scripts/save_pricing_snapshots.py` — tools 테이블 기준으로 `snapshots/pricing/vercel.md`, `cursor.md` 등 생성.
