"""
스냅샷(producthunt_snapshot.md) 기준 상위 3개 툴을 tools 테이블에 upsert합니다.
크롤링 없이 스냅샷 데이터만 사용합니다.
"""
import os
import sys
import re

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from supabase import create_client, Client

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY required")
    sys.exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


def slugify(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[-\s]+", "-", text)
    return text.strip("-") or "tool"


def popularity_quintile(rank_one_based: int, total_count: int) -> float:
    """전체 개수를 5구간으로 나누어 0, 0.25, 0.5, 0.75, 1 반환. 1등=1, 막등=0 (예: 10개면 1,2등=1, 9,10등=0)."""
    if total_count <= 0:
        return 0.0
    rank_one_based = max(1, min(rank_one_based, total_count))
    quintile_index = (rank_one_based - 1) * 5 // total_count  # 0..4
    return (4 - quintile_index) / 4.0


# 스냅샷 상위 3개: 이름, 한줄설명, 공식 사이트, 카테고리
TOP_3_FROM_SNAPSHOT = [
    {
        "name": "Vercel",
        "description": "The frontend cloud. Creators of Next.js.",
        "website": "https://vercel.com",
        "category": "frontend_hosting",
    },
    {
        "name": "Cursor",
        "description": "The AI Code Editor",
        "website": "https://cursor.com",
        "category": "ai_code_editors",
    },
    {
        "name": "Supabase",
        "description": "The open source Firebase alternative",
        "website": "https://supabase.com",
        "category": "databases",
    },
]


def main():
    total = len(TOP_3_FROM_SNAPSHOT)
    print("Seeding top 3 tools from snapshot into tools table...")
    for rank_one_based, tool in enumerate(TOP_3_FROM_SNAPSHOT, start=1):
        slug = slugify(tool["name"])
        popularity_rank_percentile = popularity_quintile(rank_one_based, total)  # 5구간: 0, 0.25, 0.5, 0.75, 1
        row = {
            "name": tool["name"],
            "slug": slug,
            "category": tool["category"],
            "website": tool["website"],
            "description": tool["description"],
            "popularity_rank_percentile": popularity_rank_percentile,
        }
        try:
            result = supabase.table("tools").upsert(row, on_conflict="slug").execute()
            if result.data:
                print(f"  [{rank_one_based}] {tool['name']} - tools upsert OK (id: {result.data[0].get('id')})")
            else:
                print(f"  [{rank_one_based}] {tool['name']} - upsert OK (existing slug)")
        except Exception as e:
            print(f"  [{rank_one_based}] {tool['name']} - error: {e}")
    print("Done.")


if __name__ == "__main__":
    main()
