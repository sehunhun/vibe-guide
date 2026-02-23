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
from extract_elements import extract_interactive_elements

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
    # 하위 호환: system/user 형식도 지원
    system: Optional[str] = None
    user: Optional[str] = None
    # 새로운 형식: messages 배열
    messages: Optional[List[dict]] = None
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
        
        # HTML이 있으면 상호작용 가능한 요소 추출
        interactive_elements = []
        if request.page_context_type == "html" and request.page_context_content:
            try:
                logger.info(f"요소 추출 시작, HTML 길이: {len(request.page_context_content)}")
                interactive_elements = extract_interactive_elements(request.page_context_content)
                logger.info(f"추출된 상호작용 요소: {len(interactive_elements)}개")
                if interactive_elements:
                    logger.info(f"첫 번째 요소 예시: {interactive_elements[0]}")
            except Exception as e:
                logger.error(f"요소 추출 실패: {e}", exc_info=True)
        else:
            logger.info(f"요소 추출 스킵: type={request.page_context_type}, content 있음={bool(request.page_context_content)}")
        
        # 메시지 형식 결정 (새로운 messages 배열 또는 하위 호환 system/user)
        if request.messages:
            # 새로운 형식: messages 배열 사용
            messages = request.messages.copy()
            
            # HTML에서 추출한 요소를 마지막 user 메시지(페이지 상태)에 추가
            if interactive_elements and messages:
                logger.info(f"요소를 메시지에 추가 시작: {len(interactive_elements)}개 요소")
                # 추출된 모든 요소 출력
                logger.info("=" * 80)
                logger.info("추출된 인터랙션 요소 목록:")
                for i, el in enumerate(interactive_elements, 1):
                    logger.info(f"{i}. tag={el.get('tag')}, type={el.get('type')}, selector={el.get('selector')}, text={el.get('text')}")
                logger.info("=" * 80)
                
                last_msg = messages[-1]
                if last_msg.get("role") == "user":
                    content = last_msg.get("content", "")
                    if isinstance(content, str):
                        # 페이지 상태 메시지에 요소 JSON 추가
                        elements_json = json.dumps(interactive_elements, ensure_ascii=False, indent=2)
                        logger.info(f"요소 JSON 길이: {len(elements_json)}")
                        # [PAGE INTERACTION ELEMENTS] 섹션의 []를 교체
                        if "[PAGE INTERACTION ELEMENTS]" in content:
                            logger.info("[PAGE INTERACTION ELEMENTS] 섹션 발견, 교체 중")
                            # []를 찾아서 교체 (정규식 사용)
                            import re
                            # [PAGE INTERACTION ELEMENTS] 다음에 나오는 []를 교체
                            pattern = r'(\[PAGE INTERACTION ELEMENTS\]\s*\n\s*)\[\]'
                            replacement = f'[PAGE INTERACTION ELEMENTS]\n\n{elements_json}'
                            content = re.sub(pattern, replacement, content)
                            # 혹시 []가 별도 줄에 있으면 교체
                            content = content.replace('[PAGE INTERACTION ELEMENTS]\n\n[]', f'[PAGE INTERACTION ELEMENTS]\n\n{elements_json}')
                            messages[-1]["content"] = content
                            logger.info("요소 JSON 교체 완료")
                        else:
                            logger.info("[PAGE INTERACTION ELEMENTS] 섹션 없음, 추가 중")
                            # 섹션이 없으면 추가
                            messages[-1]["content"] = content + f"\n\n[PAGE INTERACTION ELEMENTS]\n\n{elements_json}\n"
                            logger.info("요소 JSON 추가 완료")
                else:
                    logger.warning(f"마지막 메시지가 user가 아님: {last_msg.get('role')}")
            else:
                logger.info(f"요소 추가 스킵: interactive_elements={len(interactive_elements) if interactive_elements else 0}개, messages={len(messages) if messages else 0}개")
            
            # 이미지가 있으면 마지막 user 메시지에 추가
            if request.page_context_type == "image" and request.page_context_content:
                image_url = request.page_context_content
                if not image_url.startswith("data:"):
                    image_url = f"data:image/png;base64,{image_url}"
                
                # 마지막 메시지가 user인 경우 이미지 추가
                if messages and messages[-1].get("role") == "user":
                    last_msg = messages[-1]
                    content = last_msg.get("content", "")
                    
                    # content가 문자열이면 배열로 변환
                    if isinstance(content, str):
                        messages[-1]["content"] = [
                            {"type": "text", "text": content},
                            {
                                "type": "image_url",
                                "image_url": {"url": image_url}
                            }
                        ]
                    elif isinstance(content, list):
                        # 이미 배열이면 이미지 추가
                        content.append({
                            "type": "image_url",
                            "image_url": {"url": image_url}
                        })
                    logger.info("이미지 포함됨 (messages 배열 형식)")
        else:
            # 하위 호환: system/user 형식
            if not request.system or not request.user:
                raise HTTPException(status_code=400, detail="system/user 또는 messages 필드가 필요합니다.")
            
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
                logger.info("이미지 포함됨 (하위 호환 형식)")
            
            messages = [
                {"role": "system", "content": request.system},
                {"role": "user", "content": content},
            ]

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
                    "messages": messages,
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
