"""
Product Hunt 카테고리 페이지를 열고, 스냅샷 본문을 텍스트 중심 마크다운(.md)으로 저장합니다.

대응 사항:
- JS 렌더 완료 후 스냅샷: load + 콘텐츠 selector 대기
- Lazy loading 실행: 전체 스크롤 후 수집
- Virtual list: 스크롤 구간별 텍스트 수집 후 병합
- Snapshot size 제한 제거: 텍스트 중심 수집, 섹션별 누적
"""
import os
import sys
import time
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from playwright.sync_api import sync_playwright

PH_URL = "https://www.producthunt.com/categories/engineering-development?page=1&tags=developer+tools"
SNAPSHOTS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "snapshots")

# JS 렌더 대기: 최대 대기 시간(초)
WAIT_LOAD_TIMEOUT_MS = 60_000
WAIT_CONTENT_TIMEOUT_MS = 25_000
# Lazy / virtual list: 스크롤 횟수, 스크롤 간 대기(초)
SCROLL_STEPS = 30
SCROLL_PAUSE_SEC = 0.6

# 루트에서 텍스트 중심 마크다운 추출 (헤딩, 링크, 문단, 리스트만)
_EXTRACT_MD_JS = """
() => {
  const root = document.querySelector('main') || document.body;
  const out = [];
  const seen = new Set();

  function text(n) {
    if (!n) return '';
    const s = (n.textContent || '').trim();
    return s.length > 2000 ? s.slice(0, 2000) + '…' : s;
  }
  function href(n) {
    const a = n.closest('a') || (n.tagName === 'A' ? n : null);
    return a ? (a.getAttribute('href') || '') : '';
  }
  function key(t, h) { return (t.slice(0, 80) + '|' + h).trim(); }

  function walk(el, level) {
    if (!el || out.length > 5000) return;
    const tag = (el.tagName || '').toLowerCase();
    if (tag === 'svg') { return; }
    const t = text(el);
    const h = href(el);
    const k = key(t, h);
    if (seen.has(k) && k.length > 5) return;
    if (t.length < 2) {
      for (const c of el.children || []) walk(c, level);
      return;
    }
    if (tag === 'h1') { seen.add(k); out.push('# ' + t); return; }
    if (tag === 'h2') { seen.add(k); out.push('## ' + t); return; }
    if (tag === 'h3') { seen.add(k); out.push('### ' + t); return; }
    if (tag === 'h4' || tag === 'h5' || tag === 'h6') { seen.add(k); out.push('#### ' + t); return; }
    if (tag === 'a' && h && t) {
      if (!seen.has(k)) { seen.add(k); out.push('- [' + t.replace(/\\n/g, ' ').slice(0, 200) + '](' + h + ')'); }
      return;
    }
    if (tag === 'p' && t) { seen.add(k); out.push(t); out.push(''); return; }
    if (tag === 'li' && t) { seen.add(k); out.push('- ' + t.replace(/\\n/g, ' ').slice(0, 300)); return; }
    for (const c of el.children || []) walk(c, level);
  }
  walk(root, 0);
  return out.join('\\n');
}
"""


def _scroll_and_collect(page):
    """Lazy loading 실행 + virtual list 구간별 수집: 스크롤하면서 구간 텍스트 누적 (중복 제거)."""
    collected = []
    seen_lines = set()
    last_height = page.evaluate("() => document.body.scrollHeight")
    step_px = 400
    for step in range(SCROLL_STEPS):
        page.evaluate(f"window.scrollBy(0, {step_px})")
        time.sleep(SCROLL_PAUSE_SEC)
        try:
            chunk = page.evaluate(_EXTRACT_MD_JS)
            if not chunk:
                continue
            for line in chunk.split("\n"):
                line = line.strip()
                if line and line not in seen_lines:
                    seen_lines.add(line)
                    collected.append(line)
        except Exception:
            pass
        new_height = page.evaluate("() => document.body.scrollHeight")
        if step > 5 and new_height == last_height:
            page.evaluate("window.scrollBy(0, -step_px)")
            time.sleep(0.3)
            chunk = page.evaluate(_EXTRACT_MD_JS)
            if chunk:
                for line in chunk.split("\n"):
                    line = line.strip()
                    if line and line not in seen_lines:
                        seen_lines.add(line)
                        collected.append(line)
            break
        last_height = new_height
    return collected


def main():
    os.makedirs(SNAPSHOTS_DIR, exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            page.set_extra_http_headers({
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            })
            # 1) JS 렌더 완료 후 스냅샷: domcontentloaded가 아닌 load 사용
            page.goto(PH_URL, wait_until="load", timeout=WAIT_LOAD_TIMEOUT_MS)
            # 2) 콘텐츠가 보일 때까지 대기 (lazy/virtual 전에 최소 본문 존재 확인)
            try:
                page.wait_for_selector("main, [role='main'], .main-content, body", state="attached", timeout=WAIT_CONTENT_TIMEOUT_MS)
            except Exception:
                pass
            time.sleep(2)

            md_lines = [
                "# Product Hunt 스냅샷 (텍스트 중심)",
                "",
                f"- **URL**: {PH_URL}",
                f"- **저장 시각**: {datetime.now().isoformat()}",
                "",
                "---",
                "",
            ]

            # 3) Lazy loading + virtual list: 스크롤 구간별 수집
            body_lines = _scroll_and_collect(page)
            if body_lines:
                md_lines.append("## 본문 (스크롤 구간별 수집)")
                md_lines.append("")
                md_lines.extend(body_lines)
                md_lines.append("")
            else:
                # 폴백: 스크롤 없이 한 번만 추출
                try:
                    chunk = page.evaluate(_EXTRACT_MD_JS)
                    if chunk:
                        md_lines.append("## 본문")
                        md_lines.append("")
                        md_lines.append(chunk)
                        md_lines.append("")
                except Exception as e:
                    md_lines.append(f"*본문 추출 실패: {e}*")

            md_path = os.path.join(SNAPSHOTS_DIR, "producthunt_snapshot.md")
            with open(md_path, "w", encoding="utf-8") as f:
                f.write("\n".join(md_lines))
            print(f"Saved: {md_path}")

        finally:
            browser.close()
    print("Done. See backend/snapshots/SNAPSHOT_REPORT.md for design notes.")


if __name__ == "__main__":
    main()
