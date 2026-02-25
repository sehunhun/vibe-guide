"""
Product Hunt 1~3등 툴을 찾아서 tools 테이블에 추가합니다.
기존 데이터는 삭제하지 않고 upsert만 수행합니다.
"""
import os
import sys
import re
import time

# backend 루트에서 .env 로드
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

PH_URL = "https://www.producthunt.com/categories/engineering-development?page=1&tags=developer+tools"
TOP_N = 3  # 1등, 2등, 3등

def slugify(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r'[^\w\s-]', '', text)
    text = re.sub(r'[-\s]+', '-', text)
    return text


def popularity_quintile(rank_one_based: int, total_count: int) -> float:
    """전체 개수를 5구간으로 나누어 0, 0.25, 0.5, 0.75, 1 반환. 1등=1, 막등=0 (예: 10개면 1,2등=1, 9,10등=0)."""
    if total_count <= 0:
        return 0.0
    rank_one_based = max(1, min(rank_one_based, total_count))
    quintile_index = (rank_one_based - 1) * 5 // total_count  # 0..4
    return (4 - quintile_index) / 4.0

def extract_website_from_detail(page, detail_url: str) -> str | None:
    try:
        page.goto(detail_url, wait_until="domcontentloaded", timeout=30000)
        time.sleep(2)
        for sel in ['a[href^="http"]:not([href*="producthunt.com"])', 'meta[property="og:url"]']:
            el = page.query_selector(sel)
            if el:
                if el.tag_name == "meta":
                    website = el.get_attribute("content")
                else:
                    website = el.get_attribute("href")
                if website and not website.startswith("javascript:"):
                    return website
    except Exception:
        pass
    return None

def main():
    print("Product Hunt 1~3등 툴 추출 후 tools 테이블에 추가")
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        
        try:
            page.set_extra_http_headers({
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            })
            print("페이지 로딩 중...")
            page.goto(PH_URL, wait_until="domcontentloaded", timeout=90000)
            time.sleep(5)
            
            card_selectors = [
                '[data-test="post-item"]',
                'article[class*="post"]',
                'div[class*="PostItem"]',
                'a[href*="/posts/"]'
            ]
            cards = []
            for sel in card_selectors:
                found = page.query_selector_all(sel)
                if found:
                    cards = found
                    break
            
            if len(cards) < TOP_N:
                print(f"카드 부족: {len(cards)}개만 있음. 1~3등 추출 불가.")
                return
            
            for rank_one_based in range(1, TOP_N + 1):
                idx = rank_one_based - 1
                card = cards[idx]
                name_el = card.query_selector("h3, [data-test='post-title']")
                name = name_el.inner_text().strip() if name_el else None
                tagline_el = card.query_selector("[data-test='post-tagline'], p")
                tagline = (tagline_el.inner_text().strip() if tagline_el else "")[:500]
                link_el = card.query_selector("a[href*='/posts/']")
                detail_url = None
                if link_el:
                    href = link_el.get_attribute("href")
                    if href:
                        detail_url = f"https://www.producthunt.com{href}" if href.startswith("/") else href
                
                if not name:
                    print(f"{rank_one_based}등: 이름 없음, 스킵")
                    continue
                
                print(f"\n{rank_one_based}등: {name}")
                print(f"  tagline: {tagline[:60]}...")
                print(f"  detail: {detail_url}")
                
                website = extract_website_from_detail(page, detail_url) if detail_url else None
                if not website:
                    website = f"https://www.producthunt.com/posts/{slugify(name)}"
                    print(f"  website 미발견 → placeholder")
                else:
                    print(f"  website: {website}")
                
                slug = slugify(name)
                # 5구간: 0, 0.25, 0.5, 0.75, 1 (1~3등이면 1, 0.75, 0.5)
                popularity_rank_percentile = popularity_quintile(rank_one_based, TOP_N)
                
                row = {
                    "name": name,
                    "slug": slug,
                    "category": None,
                    "website": website,
                    "description": tagline or "",
                    "popularity_rank_percentile": popularity_rank_percentile,
                }
                result = supabase.table("tools").upsert(row, on_conflict="slug").execute()
                if result.data:
                    print(f"  tools 테이블 upsert 완료: {result.data[0].get('id')}")
                else:
                    print("  upsert 실패 또는 동일 데이터")
                
                time.sleep(1)
                
        finally:
            browser.close()
    print("\n1~3등 tools 반영 완료.")

if __name__ == "__main__":
    main()
