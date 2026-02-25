"""
크롤링 통합 실행 스크립트
Railway cron에서 실행됩니다.
"""
import os
import sys
import logging
from datetime import datetime

# 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def main():
    """메인 실행 함수"""
    logger.info("=" * 60)
    logger.info("Starting crawler job")
    logger.info(f"Time: {datetime.now()}")
    logger.info("=" * 60)
    
    try:
        # 1. Product Hunt 크롤링
        logger.info("\n[1/2] Running Product Hunt crawler...")
        from crawl_producthunt import main as crawl_ph
        crawl_ph()
        
        # 2. Pricing 페이지 크롤링
        logger.info("\n[2/2] Running pricing page crawler...")
        from crawl_pricing import main as crawl_pricing
        crawl_pricing()
        
        logger.info("\n" + "=" * 60)
        logger.info("✅ All crawlers completed successfully!")
        logger.info("=" * 60)
        
    except Exception as e:
        logger.error(f"❌ Error in crawler job: {e}", exc_info=True)
        sys.exit(1)

if __name__ == "__main__":
    main()
