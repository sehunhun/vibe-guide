"""
Pricing 페이지 크롤링 스크립트
각 툴의 pricing 페이지에서 플랜 정보와 capabilities를 추출합니다.
규칙 기반 파싱 + AI 폴백 방식 사용.
"""
import os
import sys
import re
import time
import json
from typing import List, Dict, Optional, Tuple
from playwright.sync_api import sync_playwright, Browser, Page
from bs4 import BeautifulSoup
from openai import OpenAI
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

# 환경변수
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

if not all([SUPABASE_URL, SUPABASE_KEY, OPENAI_API_KEY]):
    print("ERROR: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY must be set")
    sys.exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
openai_client = OpenAI(api_key=OPENAI_API_KEY)

# Capability 매핑 키워드 (규칙 기반)
CAPABILITY_KEYWORDS = {
    "AUTH_BASIC": ["email", "password", "basic auth", "email auth"],
    "AUTH_SOCIAL": ["social login", "google", "github", "oauth", "sso", "social auth"],
    "AUTH_MFA": ["2fa", "mfa", "two factor", "multi factor"],
    "PAYMENT_ONE_TIME": ["one-time", "one time", "single payment", "payment"],
    "PAYMENT_SUBSCRIPTION": ["subscription", "recurring", "monthly", "yearly"],
    "DB_HOSTED": ["database", "db", "postgres", "mysql", "mongodb"],
    "STORAGE_OBJECT": ["storage", "file upload", "object storage", "s3"],
    "EDGE_FUNCTION": ["edge function", "edge computing"],
    "SERVERLESS_FUNCTION": ["serverless", "function", "lambda", "invocation"],
    "ANALYTICS_BASIC": ["analytics", "visitor", "pageview", "tracking"],
    "ANALYTICS_ADVANCED": ["custom event", "funnel", "conversion"],
    "TEAM_COLLAB": ["team", "collaboration", "member"],
    "ROLE_BASED_ACCESS": ["role", "permission", "rbac", "access control"],
    "API_PUBLIC": ["api", "rest api", "graphql"],
    "CI_CD": ["ci/cd", "continuous integration", "deployment"],
    "CUSTOM_DOMAIN": ["custom domain", "domain"],
    "SSL": ["ssl", "tls", "https", "certificate"],
    "BANDWIDTH": ["bandwidth", "transfer", "data transfer"],
    "EMAIL_SEND": ["email", "send email", "smtp"],
    "NOTIFICATION": ["notification", "push", "alert"],
}

def extract_price(text: str) -> Optional[float]:
    """텍스트에서 가격 추출 (USD)"""
    # $29, $29.99, $29/month 등 패턴
    price_match = re.search(r'\$(\d+(?:\.\d{2})?)', text.replace(',', ''))
    if price_match:
        return float(price_match.group(1))
    return None

def parse_table_structure(page: Page) -> List[Dict]:
    """표 구조에서 플랜 정보 추출 (규칙 기반)"""
    try:
        html = page.content()
        soup = BeautifulSoup(html, 'html.parser')
        
        plans = []
        
        # 표 찾기
        tables = soup.find_all('table')
        for table in tables:
            rows = table.find_all('tr')
            if len(rows) < 2:
                continue
            
            # 헤더에서 플랜 이름 추출
            headers = [th.get_text(strip=True) for th in rows[0].find_all(['th', 'td'])]
            
            for col_idx, header in enumerate(headers):
                if col_idx == 0:  # 첫 번째 열은 보통 기능명
                    continue
                
                plan_name = header.strip()
                if not plan_name or plan_name.lower() in ['feature', 'plan', '']:
                    continue
                
                plan = {
                    "name": plan_name,
                    "slug": re.sub(r'[^\w-]', '', plan_name.lower().replace(' ', '_')),
                    "monthly_price": None,
                    "yearly_price": None,
                    "is_free": "free" in plan_name.lower(),
                    "features": []
                }
                
                # 가격 추출 (헤더나 다음 행에서)
                price_text = header
                monthly_price = extract_price(price_text)
                if monthly_price:
                    plan["monthly_price"] = monthly_price
                
                # 기능 추출 (각 행에서)
                for row in rows[1:]:
                    cells = row.find_all(['td', 'th'])
                    if len(cells) > col_idx:
                        feature_text = cells[col_idx].get_text(strip=True)
                        if feature_text and feature_text.lower() not in ['yes', 'no', '✓', '✗', '']:
                            plan["features"].append(feature_text)
                
                if plan["name"]:
                    plans.append(plan)
        
        return plans
    except Exception as e:
        print(f"Error parsing table: {e}")
        return []

def parse_card_structure(page: Page) -> List[Dict]:
    """카드 구조에서 플랜 정보 추출 (규칙 기반)"""
    try:
        html = page.content()
        soup = BeautifulSoup(html, 'html.parser')
        
        plans = []
        
        # 카드 선택자 (일반적인 패턴)
        card_selectors = [
            '[class*="pricing-card"]',
            '[class*="plan-card"]',
            '[class*="tier"]',
            '[data-test*="plan"]',
            '[class*="package"]'
        ]
        
        for selector in card_selectors:
            cards = soup.select(selector)
            if cards:
                for card in cards:
                    plan_name_elem = card.select_one('h2, h3, [class*="name"], [class*="title"]')
                    if not plan_name_elem:
                        continue
                    
                    plan_name = plan_name_elem.get_text(strip=True)
                    
                    # 가격 추출
                    price_elem = card.select_one('[class*="price"], [class*="cost"]')
                    monthly_price = None
                    if price_elem:
                        price_text = price_elem.get_text()
                        monthly_price = extract_price(price_text)
                    
                    # 기능 리스트 추출
                    features = []
                    feature_list = card.select('ul li, [class*="feature"]')
                    for feature in feature_list:
                        feature_text = feature.get_text(strip=True)
                        if feature_text:
                            features.append(feature_text)
                    
                    plan = {
                        "name": plan_name,
                        "slug": re.sub(r'[^\w-]', '', plan_name.lower().replace(' ', '_')),
                        "monthly_price": monthly_price or 0,
                        "yearly_price": None,
                        "is_free": "free" in plan_name.lower() or monthly_price == 0,
                        "features": features
                    }
                    
                    if plan["name"]:
                        plans.append(plan)
                
                if plans:
                    break
        
        return plans
    except Exception as e:
        print(f"Error parsing cards: {e}")
        return []

def parse_with_ai(html: str, website: str) -> List[Dict]:
    """AI를 사용하여 pricing 정보 추출 (폴백)"""
    try:
        prompt = f"""
Extract pricing plan information from this HTML page. Return a JSON array of plans.

Each plan should have:
- name: plan name (e.g., "Free", "Pro", "Team")
- monthly_price: monthly price in USD (number, 0 if free)
- yearly_price: yearly price in USD (number or null)
- is_free: boolean
- features: array of feature strings

Website: {website}

HTML:
{html[:10000]}  # 첫 10KB만

Return ONLY valid JSON array, no markdown, no explanation.
Example format:
[
  {{
    "name": "Free",
    "monthly_price": 0,
    "yearly_price": null,
    "is_free": true,
    "features": ["Feature 1", "Feature 2"]
  }},
  {{
    "name": "Pro",
    "monthly_price": 29,
    "yearly_price": 290,
    "is_free": false,
    "features": ["Feature 1", "Feature 2", "Feature 3"]
  }}
]
"""
        
        response = openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a JSON extraction expert. Extract pricing information and return ONLY valid JSON."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.1,
            max_tokens=2000
        )
        
        content = response.choices[0].message.content.strip()
        # JSON 코드 블록 제거
        content = re.sub(r'^```json\s*', '', content)
        content = re.sub(r'^```\s*', '', content)
        content = re.sub(r'```\s*$', '', content)
        
        plans = json.loads(content)
        return plans if isinstance(plans, list) else []
        
    except Exception as e:
        print(f"Error with AI parsing: {e}")
        return []

def map_features_to_capabilities(features: List[str]) -> List[Tuple[str, Optional[float], Optional[str]]]:
    """기능 텍스트를 Capability ID로 매핑"""
    capabilities = []
    
    for feature in features:
        feature_lower = feature.lower()
        
        # 규칙 기반 매핑
        matched = False
        for cap_id, keywords in CAPABILITY_KEYWORDS.items():
            if any(keyword in feature_lower for keyword in keywords):
                # 제한값 추출 (숫자)
                limit_match = re.search(r'(\d+(?:\.\d+)?)\s*([km]?b|gb|mb|tb|million|thousand|m|k)?', feature_lower)
                limit_value = None
                limit_unit = None
                
                if limit_match:
                    limit_value = float(limit_match.group(1))
                    if limit_match.group(2):
                        unit = limit_match.group(2).lower()
                        if unit in ['k', 'thousand']:
                            limit_value *= 1000
                        elif unit in ['m', 'million']:
                            limit_value *= 1000000
                        limit_unit = unit
                
                capabilities.append((cap_id, limit_value, limit_unit))
                matched = True
                break
        
        # 매칭 안되면 AI로 매핑 (선택적)
        if not matched and "unlimited" in feature_lower:
            # 무제한은 특별 처리
            pass
    
    return capabilities

def crawl_pricing_for_tool(tool: Dict) -> bool:
    """특정 툴의 pricing 페이지 크롤링"""
    website = tool.get("website")
    if not website:
        return False
    
    # Pricing 페이지 URL 추정
    pricing_urls = [
        f"{website}/pricing",
        f"{website}/prices",
        f"{website}/plans",
        f"{website}/pricing/",
    ]
    
    if not website.startswith("http"):
        website = f"https://{website}"
    
    plans = []
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        
        try:
            # Pricing 페이지 찾기
            found = False
            for url in pricing_urls:
                try:
                    page.goto(url, wait_until="networkidle", timeout=30000)
                    time.sleep(2)
                    
                    # 표 구조 파싱
                    plans = parse_table_structure(page)
                    if plans:
                        found = True
                        print(f"  ✓ Found {len(plans)} plans (table)")
                        break
                    
                    # 카드 구조 파싱
                    plans = parse_card_structure(page)
                    if plans:
                        found = True
                        print(f"  ✓ Found {len(plans)} plans (cards)")
                        break
                    
                except Exception as e:
                    continue
            
            # 폴백: AI 파싱
            if not plans:
                html = page.content()
                plans = parse_with_ai(html, website)
                if plans:
                    print(f"  ✓ Found {len(plans)} plans (AI)")
            
            if not plans:
                print(f"  ✗ No plans found")
                return False
            
            # DB에 저장
            tool_id = tool["id"]
            
            for plan_data in plans:
                try:
                    # Plan 저장
                    plan_record = {
                        "tool_id": tool_id,
                        "name": plan_data["name"],
                        "slug": plan_data.get("slug", re.sub(r'[^\w-]', '', plan_data["name"].lower().replace(' ', '_'))),
                        "monthly_price": plan_data.get("monthly_price", 0),
                        "yearly_price": plan_data.get("yearly_price"),
                        "is_free": plan_data.get("is_free", False)
                    }
                    
                    result = supabase.table("plans").upsert(
                        plan_record,
                        on_conflict="tool_id,slug"
                    ).execute()
                    
                    if not result.data:
                        continue
                    
                    plan_id = result.data[0]["id"]
                    
                    # Capabilities 매핑 및 저장
                    features = plan_data.get("features", [])
                    capabilities = map_features_to_capabilities(features)
                    
                    for cap_id, limit_value, limit_unit in capabilities:
                        try:
                            supabase.table("plan_capabilities").upsert({
                                "plan_id": plan_id,
                                "capability_id": cap_id,
                                "limit_value": limit_value,
                                "limit_unit": limit_unit
                            }, on_conflict="plan_id,capability_id").execute()
                        except Exception as e:
                            print(f"    Error saving capability {cap_id}: {e}")
                    
                    print(f"    ✓ Plan: {plan_data['name']} ({len(capabilities)} capabilities)")
                    
                except Exception as e:
                    print(f"    ✗ Error saving plan {plan_data.get('name')}: {e}")
            
            return True
            
        except Exception as e:
            print(f"  ✗ Error crawling pricing: {e}")
            return False
        finally:
            browser.close()

def main():
    """메인 실행 함수"""
    print("=" * 60)
    print("Pricing Page Crawler")
    print("=" * 60)
    
    # tools 테이블에서 모든 툴 가져오기
    print("\nFetching tools from database...")
    result = supabase.table("tools").select("*").execute()
    
    if not result.data:
        print("No tools found. Run crawl_producthunt.py first.")
        return
    
    tools = result.data
    print(f"Found {len(tools)} tools")
    
    success = 0
    failed = 0
    
    for tool in tools:
        print(f"\n[{success + failed + 1}/{len(tools)}] {tool['name']} - {tool.get('website', 'N/A')}")
        
        if crawl_pricing_for_tool(tool):
            success += 1
        else:
            failed += 1
        
        time.sleep(2)  # Rate limiting
    
    print("\n" + "=" * 60)
    print(f"✅ Complete: {success} success, {failed} failed")

if __name__ == "__main__":
    main()
