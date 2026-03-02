"""
tools 테이블의 각 툴에 대해 pricing_url(또는 website + '/pricing')으로 접속해
markdownify로 HTML → 마크다운 변환하여 tools.markdown 컬럼에 저장합니다.
"""
import os
import re
import sys
import time
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from markdownify import markdownify as md
from playwright.sync_api import sync_playwright
from supabase import create_client, Client

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY required")
    sys.exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

WAIT_LOAD_TIMEOUT_MS = 45_000
WAIT_AFTER_LOAD_SEC = 3

# 한 툴만 뽑을 때: slug 지정 (None이면 전체 실행)
SINGLE_SLUG = None

# 스냅샷에서 제거할 하드코딩 에러/플레이스홀더 문구 (정규식)
FILTER_PATTERNS = [
    re.compile(
        r"\s*###\s+Uh oh!\s*\n\s*\n\s*There was an error while loading\.\s*Please reload this page\.\s*",
        re.IGNORECASE,
    ),
]


def _filter_markdown(text: str) -> str:
    for pat in FILTER_PATTERNS:
        text = pat.sub("\n", text)
    return text.strip()


def main():
    result = supabase.table("tools").select("slug, website, name, pricing_url").execute()
    if not result.data:
        print("No tools in DB. Run seed_tools_from_snapshot.py first.")
        return

    tools = result.data
    if SINGLE_SLUG:
        tools = [t for t in tools if (t.get("slug") or "").strip() == SINGLE_SLUG]
        if not tools:
            print(f"No tool with slug '{SINGLE_SLUG}'.")
            return
        print(f"Single run: slug={SINGLE_SLUG}")
    else:
        print(f"Found {len(tools)} tools. Saving pricing markdown to tools.markdown")

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

                pricing_url = (tool.get("pricing_url") or "").strip() or (website.rstrip("/") + "/pricing")
                print(f"  [{i+1}/{len(tools)}] {name} ({slug}) -> {pricing_url}")

                try:
                    page.goto(pricing_url, wait_until="load", timeout=WAIT_LOAD_TIMEOUT_MS)
                    time.sleep(WAIT_AFTER_LOAD_SEC)

                    html = page.evaluate("""() => {
                      const main = document.querySelector('main') || document.body;
                      return main.outerHTML;
                    }""")

                    body_md = md(
                        html,
                        heading_style="ATX",
                        strip=["script", "style", "noscript"],
                        escape_asterisks=False,
                        escape_underscores=False,
                    )
                    body_md = _filter_markdown(body_md)

                    header_lines = [
                        f"# {name} — Pricing",
                        "",
                        f"- **URL**: {pricing_url}",
                        f"- **slug**: {slug}",
                        f"- **saved**: {datetime.now().isoformat()}",
                        "- **converter**: markdownify",
                        "",
                        "---",
                        "",
                    ]
                    full_md = "\n".join(header_lines) + body_md
                    supabase.table("tools").update({"markdown": full_md}).eq("slug", slug).execute()
                    print(f"    Updated: tools.markdown for {slug}")
                except Exception as e:
                    print(f"    Error: {e}")
                time.sleep(1)

        finally:
            browser.close()

    print("Done.")


if __name__ == "__main__":
    main()
