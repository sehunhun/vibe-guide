"""
Product Hunt 크롤링 스크립트
상위 100개 개발자 도구를 크롤링하여 tools 테이블에 저장합니다.
"""
import os
import sys
import re
import time
from typing import List, Dict, Optional
from playwright.sync_api import sync_playwright, Browser, Page
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

# Supabase 연결
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
    sys.exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Product Hunt URL
PH_URL = "https://www.producthunt.com/categories/engineering-development?page=1&tags=developer+tools"
MAX_TOOLS = 3

def slugify(text: str) -> str:
    """텍스트를 URL-friendly slug로 변환"""
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

def extract_tool_from_card(page: Page, card_index: int) -> Optional[Dict]:
    """Product Hunt 카드에서 툴 정보 추출"""
    try:
        # 다양한 선택자 시도
        selectors = {
            "name": [
                f'[data-test="post-item"]:nth-of-type({card_index + 1}) h3',
                f'[data-test="post-item"]:nth-of-type({card_index + 1}) [data-test="post-title"]',
                f'article:nth-of-type({card_index + 1}) h3',
                f'div[class*="PostItem"]:nth-of-type({card_index + 1}) h3',
            ],
            "tagline": [
                f'[data-test="post-item"]:nth-of-type({card_index + 1}) [data-test="post-tagline"]',
                f'[data-test="post-item"]:nth-of-type({card_index + 1}) p',
                f'article:nth-of-type({card_index + 1}) p',
            ],
            "link": [
                f'[data-test="post-item"]:nth-of-type({card_index + 1}) a[href*="/posts/"]',
                f'article:nth-of-type({card_index + 1}) a[href*="/posts/"]',
            ],
            "upvotes": [
                f'[data-test="post-item"]:nth-of-type({card_index + 1}) [data-test="vote-button"]',
                f'[data-test="post-item"]:nth-of-type({card_index + 1}) button',
            ]
        }
        
        # 이름 추출
        name = None
        for selector in selectors["name"]:
            elem = page.query_selector(selector)
            if elem:
                name = elem.inner_text().strip()
                break
        
        if not name:
            return None
        
        # 태그라인 추출
        tagline = ""
        for selector in selectors["tagline"]:
            elem = page.query_selector(selector)
            if elem:
                tagline = elem.inner_text().strip()
                break
        
        # 링크 추출
        detail_url = None
        for selector in selectors["link"]:
            elem = page.query_selector(selector)
            if elem:
                href = elem.get_attribute("href")
                if href:
                    detail_url = f"https://www.producthunt.com{href}" if href.startswith("/") else href
                    break
        
        # 업보트 수 추출
        upvotes = 0
        for selector in selectors["upvotes"]:
            elem = page.query_selector(selector)
            if elem:
                upvotes_text = elem.inner_text()
                upvotes_match = re.search(r'(\d+)', upvotes_text.replace(',', ''))
                if upvotes_match:
                    upvotes = int(upvotes_match.group(1))
                    break
        
        return {
            "name": name,
            "tagline": tagline,
            "detail_url": detail_url,
            "upvotes": upvotes
        }
    except Exception as e:
        print(f"Error extracting tool from card {card_index}: {e}")
        return None

def extract_website_from_detail(page: Page, detail_url: str) -> Optional[str]:
    """상세 페이지에서 웹사이트 URL 추출"""
    try:
        page.goto(detail_url, wait_until="networkidle", timeout=30000)
        time.sleep(2)  # JavaScript 렌더링 대기
        
        # 웹사이트 링크 찾기
        website_elem = page.query_selector('a[href^="http"]:not([href*="producthunt.com"])')
        if website_elem:
            href = website_elem.get_attribute("href")
            if href and not href.startswith("javascript:"):
                return href
        
        # 또는 메타 태그에서
        meta_elem = page.query_selector('meta[property="og:url"]')
        if meta_elem:
            return meta_elem.get_attribute("content")
        
        return None
    except Exception as e:
        print(f"Error extracting website from {detail_url}: {e}")
        return None

def crawl_producthunt() -> List[Dict]:
    """Product Hunt에서 툴 목록 크롤링"""
    tools = []
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        
        try:
            print(f"Loading Product Hunt page: {PH_URL}")
            # User-Agent 설정 (봇 차단 방지)
            page.set_extra_http_headers({
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            })
            # domcontentloaded 사용 (networkidle보다 빠르고 안정적)
            page.goto(PH_URL, wait_until="domcontentloaded", timeout=90000)
            time.sleep(5)  # JavaScript 렌더링 대기
            
            # 카드 선택자 (Product Hunt 구조에 맞게 조정 필요)
            card_selectors = [
                '[data-test="post-item"]',
                'article[class*="post"]',
                'div[class*="PostItem"]',
                'a[href*="/posts/"]'
            ]
            
            cards = []
            for selector in card_selectors:
                found = page.query_selector_all(selector)
                if found:
                    cards = found
                    print(f"Found {len(cards)} cards with selector: {selector}")
                    break
            
            if not cards:
                print("No cards found. Taking screenshot for debugging...")
                page.screenshot(path="debug_ph.png")
                return tools
            
            print(f"Extracting tools from {len(cards)} cards...")
            
            for i in range(min(len(cards), MAX_TOOLS)):
                try:
                    # 카드 정보 추출
                    tool_info = extract_tool_from_card(page, i)
                    if not tool_info or not tool_info.get("name"):
                        continue
                    
                    # 상세 페이지에서 웹사이트 추출
                    if tool_info.get("detail_url"):
                        website = extract_website_from_detail(page, tool_info["detail_url"])
                        if website:
                            tool_info["website"] = website
                    
                    tools.append(tool_info)
                    print(f"[{len(tools)}/{MAX_TOOLS}] {tool_info['name']} - {tool_info.get('website', 'No website')}")
                    
                    if len(tools) >= MAX_TOOLS:
                        break
                    
                    time.sleep(1)  # Rate limiting
                    
                except Exception as e:
                    print(f"Error processing card {i}: {e}")
                    continue
            
        except Exception as e:
            print(f"Error during crawling: {e}")
        finally:
            browser.close()
    
    return tools

def save_to_db(tools: List[Dict], total_tools: int):
    """크롤링한 툴들을 DB에 저장"""
    print(f"\nSaving {len(tools)} tools to database...")
    
    saved = 0
    skipped = 0
    
    for idx, tool in enumerate(tools):
        try:
            if not tool.get("name") or not tool.get("website"):
                skipped += 1
                continue
            
            # 5구간 인기도: 0, 0.25, 0.5, 0.75, 1 (1,2등=1, 막등=0)
            rank_one_based = idx + 1
            popularity_rank_percentile = round(
                popularity_quintile(rank_one_based, total_tools), 2
            )

            # Slug 생성
            slug = slugify(tool["name"])

            # Category는 나중에 pricing 크롤링에서 업데이트
            tool_data = {
                "name": tool["name"],
                "slug": slug,
                "category": None,  # 나중에 업데이트
                "website": tool["website"],
                "description": tool.get("tagline", ""),
                "popularity_rank_percentile": popularity_rank_percentile,
            }
            
            # Upsert (slug 기준)
            result = supabase.table("tools").upsert(
                tool_data,
                on_conflict="slug"
            ).execute()
            
            if result.data:
                saved += 1
                print(f"✓ [{rank}] {tool['name']} - {tool['website']}")
            else:
                skipped += 1
                
        except Exception as e:
            print(f"✗ Error saving {tool.get('name', 'unknown')}: {e}")
            skipped += 1
    
    print(f"\n✅ Complete: {saved} saved, {skipped} skipped")

def main():
    """메인 실행 함수"""
    print("=" * 60)
    print("Product Hunt Crawler")
    print("=" * 60)
    
    # 기존 데이터 삭제 (덮어쓰기)
    print("\nClearing existing tools...")
    try:
        supabase.table("tools").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
        print("✓ Existing tools cleared")
    except Exception as e:
        print(f"Note: {e}")
    
    # 크롤링
    tools = crawl_producthunt()
    
    if not tools:
        print("No tools found. Exiting.")
        return
    
    # DB 저장
    save_to_db(tools, len(tools))
    
    print("\n" + "=" * 60)
    print("Crawling complete!")

if __name__ == "__main__":
    main()
