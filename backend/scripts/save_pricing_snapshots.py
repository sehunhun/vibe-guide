"""
tools 테이블의 각 툴에 대해 website + '/pricing' 으로 접속해
커스텀 DOM 추출 로직으로 텍스트 중심 마크다운을 만들어 snapshots/pricing/{slug}.md 로 저장합니다.
덮어쓰기 용도로 slug 기반 파일명 사용.
"""
import os
import sys
import time
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from playwright.sync_api import sync_playwright
from supabase import create_client, Client

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY required")
    sys.exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SNAPSHOTS_PRICING_DIR = os.path.join(BACKEND_DIR, "snapshots", "pricing")

WAIT_LOAD_TIMEOUT_MS = 45_000
SCROLL_STEPS = 12
SCROLL_PAUSE_SEC = 0.5

# 텍스트 중심 마크다운 추출 (헤딩, 링크, 문단, 리스트, 테이블 행)
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
  function cellText(c) {
    const s = text(c).trim();
    if (c.querySelector('svg')) return s ? s + ' {icon}' : '{icon}';
    return s || ' ';
  }

  function walk(el, level) {
    if (!el || out.length > 6000) return;
    const tag = (el.tagName || '').toLowerCase();
    if (tag === 'svg') { return; }
    if (tag === 'section' || tag === 'div') {
      try {
        if (getComputedStyle(el).display === 'grid') {
          const rows = Array.from(el.children);
          if (rows.length > 0) {
            const firstCells = Array.from(rows[0].children);
            const numCols = firstCells.length;
            if (numCols >= 2 && numCols <= 24 && rows.every(r => r.children.length === numCols)) {
              const keyGrid = 'grid:' + rows[0].textContent.slice(0, 60);
              if (!seen.has(keyGrid)) {
                seen.add(keyGrid);
                for (const row of rows) {
                  const cells = Array.from(row.children).map(cellText);
                  out.push('| ' + cells.join(' | ') + ' |');
                }
              }
              return;
            }
            const gtc = getComputedStyle(el).gridTemplateColumns;
            const colCount = (gtc && gtc !== 'none') ? gtc.trim().split(/\\s+/).length : 0;
            if (colCount >= 2 && colCount <= 24) {
              const keyGrid2 = 'grid2:' + text(el).slice(0, 60);
              if (!seen.has(keyGrid2)) {
                seen.add(keyGrid2);
                const flat = Array.from(el.children);
                for (let i = 0; i < flat.length; i += colCount) {
                  const rowCells = flat.slice(i, i + colCount).map(cellText);
                  if (rowCells.some(Boolean)) out.push('| ' + rowCells.join(' | ') + ' |');
                }
              }
              return;
            }
          }
        }
      } catch (err) {}
    }
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
    if (tag === 'tr') {
      const cells = Array.from(el.querySelectorAll('td, th')).map(c => {
        const t = text(c).trim();
        const hasSvg = c.querySelector('svg');
        if (hasSvg) return t ? t + ' {icon}' : '{icon}';
        return t || ' ';
      });
      if (cells.length) { const row = '| ' + cells.join(' | ') + ' |'; seen.add(k); out.push(row); }
      return;
    }
    for (const c of el.children || []) walk(c, level);
  }
  walk(root, 0);
  return out.join('\\n');
}
"""


def _scroll_and_collect(page):
    """스크롤하면서 구간별 마크다운 수집 (중복 라인 제거)."""
    collected = []
    seen_lines = set()
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
    return collected


def main():
    os.makedirs(SNAPSHOTS_PRICING_DIR, exist_ok=True)

    # tools 테이블에서 slug, website, name 조회
    result = supabase.table("tools").select("slug, website, name").execute()
    if not result.data:
        print("No tools in DB. Run seed_tools_from_snapshot.py first.")
        return

    tools = result.data
    print(f"Found {len(tools)} tools. Saving pricing pages to {SNAPSHOTS_PRICING_DIR}")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            page.set_extra_http_headers({
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            })
            for i, tool in enumerate(tools):
                slug = (tool.get("slug") or "").strip()
                website = (tool.get("website") or "").strip()
                name = (tool.get("name") or slug or "unknown").strip()
                if not slug or not website:
                    print(f"  Skip (no slug/website): {name}")
                    continue

                pricing_url = website.rstrip("/") + "/pricing"
                print(f"  [{i+1}/{len(tools)}] {name} ({slug}) -> {pricing_url}")

                try:
                    page.goto(pricing_url, wait_until="load", timeout=WAIT_LOAD_TIMEOUT_MS)
                    time.sleep(2)
                    body_lines = _scroll_and_collect(page)
                    if not body_lines:
                        try:
                            chunk = page.evaluate(_EXTRACT_MD_JS)
                            if chunk:
                                body_lines = [line.strip() for line in chunk.split("\n") if line.strip()]
                        except Exception:
                            pass

                    md_lines = [
                        f"# {name} — Pricing",
                        "",
                        f"- **URL**: {pricing_url}",
                        f"- **slug**: {slug}",
                        f"- **saved**: {datetime.now().isoformat()}",
                        "",
                        "---",
                        "",
                    ]
                    md_lines.extend(body_lines)
                    md_path = os.path.join(SNAPSHOTS_PRICING_DIR, f"{slug}.md")
                    with open(md_path, "w", encoding="utf-8") as f:
                        f.write("\n".join(md_lines))
                    print(f"    Saved: {md_path} ({len(body_lines)} lines)")
                except Exception as e:
                    print(f"    Error: {e}")
                time.sleep(1)

        finally:
            browser.close()

    print("Done.")


if __name__ == "__main__":
    main()
