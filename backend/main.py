"""
FastAPI 백엔드 서버
Railway 배포용 AI API 프록시
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Literal
import os
import httpx
import json
import logging

# 로깅 설정
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Vibe Guide API")

# CORS 설정 (모든 origin 허용)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 환경변수에서 OpenAI API 키 가져오기 (런타임에 체크)
def get_openai_api_key():
    key = os.getenv("OPENAI_API_KEY")
    if not key:
        raise ValueError("OPENAI_API_KEY 환경변수가 설정되지 않았습니다.")
    return key


class Step(BaseModel):
    text: str
    selector: Optional[str] = None


class GuidanceRequest(BaseModel):
    system: str
    user: str
    model: str = "gpt-4o-mini"
    page_context_type: Literal["html", "image"]
    page_context_content: Optional[str] = None  # HTML 문자열 또는 base64 이미지


class GuidanceResponse(BaseModel):
    steps: List[Step]


@app.get("/")
async def root():
    return {"message": "Vibe Guide API", "status": "ok"}


@app.post("/api/guidance", response_model=GuidanceResponse)
async def get_guidance(request: GuidanceRequest):
    """
    AI 가이드 생성 API
    프론트엔드에서 프롬프트를 받아 OpenAI API를 호출하고 결과를 반환
    """
    import traceback
    try:
        logger.info(f"요청 받음: model={request.model}, type={request.page_context_type}")
        
        # OpenAI API 키 확인
        try:
            api_key = get_openai_api_key()
            logger.info("OpenAI API 키 확인 완료")
        except ValueError as e:
            logger.error(f"환경변수 오류: {str(e)}")
            raise HTTPException(status_code=500, detail=f"환경변수 오류: {str(e)}")
        
        # OpenAI API 호출 준비
        content = [{"type": "text", "text": request.user}]
        
        # 이미지가 있으면 추가
        if request.page_context_type == "image" and request.page_context_content:
            image_url = request.page_context_content
            if not image_url.startswith("data:"):
                image_url = f"data:image/png;base64,{image_url}"
            content.append({
                "type": "image_url",
                "image_url": {"url": image_url}
            })
            logger.info("이미지 포함됨")

        # OpenAI API 호출
        logger.info("OpenAI API 호출 시작")
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {api_key}",
                },
                json={
                    "model": request.model,
                    "messages": [
                        {"role": "system", "content": request.system},
                        {"role": "user", "content": content},
                    ],
                    "max_tokens": 2048,
                },
            )
            
            logger.info(f"OpenAI API 응답 상태: {response.status_code}")
            
            if not response.is_success:
                try:
                    error_data = response.json()
                    error_text = error_data.get("error", {}).get("message", response.text)
                except:
                    error_text = response.text
                logger.error(f"OpenAI API 오류: {error_text}")
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"OpenAI API 오류 ({response.status_code}): {error_text}"
                )
            
            data = response.json()
            raw = data.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
            
            if not raw:
                logger.error("OpenAI API가 빈 응답을 반환했습니다.")
                raise HTTPException(status_code=500, detail="OpenAI API가 빈 응답을 반환했습니다.")
            
            logger.info(f"OpenAI 응답 받음 (길이: {len(raw)})")
            
            # JSON 파싱
            parsed = parse_ai_response(raw)
            logger.info(f"파싱 완료: {len(parsed.get('steps', []))}개 단계")
            return GuidanceResponse(steps=parsed.get("steps", []))
            
    except HTTPException:
        raise
    except httpx.TimeoutException:
        logger.error("OpenAI API 호출 시간 초과")
        raise HTTPException(status_code=504, detail="OpenAI API 호출 시간 초과")
    except httpx.RequestError as e:
        logger.error(f"OpenAI API 요청 실패: {str(e)}")
        raise HTTPException(status_code=500, detail=f"OpenAI API 요청 실패: {str(e)}")
    except Exception as e:
        error_msg = str(e) if str(e) else type(e).__name__
        error_trace = traceback.format_exc()
        logger.error(f"서버 오류: {error_msg}\n{error_trace}")
        raise HTTPException(status_code=500, detail=f"서버 오류: {error_msg}")


def parse_ai_response(raw: str) -> dict:
    """
    AI 응답 텍스트에서 JSON 추출 → steps 배열로 정규화
    """
    import re
    cleaned = re.sub(r"^```(?:json)?\s*\n?", "", raw, flags=re.IGNORECASE)
    cleaned = re.sub(r"\n?```\s*$", "", cleaned).strip()
    
    try:
        # JSON 객체 찾기
        json_match = re.search(r"\{[\s\S]*\}", cleaned)
        
        if json_match:
            obj = json.loads(json_match.group(0))
            
            # 빈 배열인 경우
            if isinstance(obj.get("steps"), list) and len(obj["steps"]) == 0:
                return {"steps": []}
            
            # steps 배열이 있는 경우
            if isinstance(obj.get("steps"), list) and len(obj["steps"]) > 0:
                steps = []
                for s in obj["steps"]:
                    if isinstance(s, dict) and s.get("text"):
                        steps.append({
                            "text": str(s["text"]).strip(),
                            "selector": (s.get("selector") or "").strip() or None
                        })
                if steps:
                    return {"steps": steps}
            
            # 하위 호환: text/selector 단일 형식
            if obj.get("text") and isinstance(obj["text"], str):
                text = obj["text"].strip()
                if text and "{" not in text:
                    selector = (obj.get("selector") or "").strip() or None
                    return {"steps": [{"text": text, "selector": selector}]}
    except json.JSONDecodeError as e:
        pass
    except Exception as e:
        pass
    
    # 파싱 실패 시
    return {
        "steps": [{"text": "안내를 생성하지 못했습니다. 다시 시도해 주세요.", "selector": None}]
    }
