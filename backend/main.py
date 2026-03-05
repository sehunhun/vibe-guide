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
    step_text: str = ""
    backendDOMNodeId: Optional[int] = None
    text: Optional[str] = None  # 하위 호환 표시용 (step_text 와 동일)
    selector: Optional[str] = None  # 하위 호환


class GuidanceRequest(BaseModel):
    system: str
    user: str
    model: str = "gpt-4o-mini"
    page_context_type: Literal["html", "image", "axtree"] = "html"
    page_context_content: Optional[str] = None  # HTML 또는 base64 이미지 (axtree 시 미사용)
    page_url: Optional[str] = None  # axtree 시 참고용
    slim_nodes: Optional[List[dict]] = None  # axtree 시 필수: 접근성 트리 slim 목록


class GuidanceResponse(BaseModel):
    steps: List[Step]


# --- 자유 대화용 모델 ---

class ChatRequest(BaseModel):
    system: str
    user: str
    model: str = "gpt-4o-mini"
    # 선택적으로 페이지 컨텍스트를 함께 보낼 수 있지만,
    # 현재 구현에서는 프롬프트 문자열에 이미 포함된다고 가정한다.


class ChatResponse(BaseModel):
    text: str


# --- 설문: 사용자 답변 → AI 추천 도구 목록 (JSON) ---
ALLOWED_REQUIREMENTS = [
    "db", "payment", "login", "storage",
    "frontend-hosting", "backend-hosting",
    "analytics", "email", "monitoring", "headless-cms",
]


class SurveyToolItem(BaseModel):
    id: int
    description: str
    requirements: List[str]


class SurveyToolsRequest(BaseModel):
    user_answer: str
    locale: str = "en"  # "en" | "ko" — AI가 description을 반환할 언어


class SurveyToolsResponse(BaseModel):
    tools: List[SurveyToolItem]


def _survey_tools_system(locale: str) -> str:
    lang = "ko" if locale and locale.lower().startswith("ko") else "en"
    if lang == "ko":
        return """# role
넌 비개발자가 웹사이트를 만들 때 쓰는 가이드야.

# tools (내부 식별자, 사용자에게 노출하지 않음)
db, payment, login, storage, frontend-hosting, backend-hosting, analytics, email, monitoring, headless-cms

# description 작성 규칙 (매우 중요)
- description은 반드시 **비즈니스·도메인 용어**로 써. 개발 용어(DB, API, 호스팅, 프론트엔드, 백엔드, headless CMS 등)를 쓰지 말 것.
- "무엇을 할 수 있게 되는지", "사용자/운영자 입장에서의 가치"로 표현할 것.
- 예: db → "회원·데이터 저장", payment → "결제 받기", login → "로그인·회원가입", storage → "파일·이미지 저장", frontend-hosting → "웹사이트 배포·공개", analytics → "방문자·이용 현황 확인", email → "이메일 발송(가입 환영, 알림)", headless-cms → "콘텐츠(글·메뉴) 관리"

# job
사용자가 요청한 웹사이트 제작에 꼭 필요한 기능만 골라서 tools 배열로 반환해. 위 tools를 최대한 활용해서 누락 없이.
각 항목: id(1부터 순번), description(한글, 비개발자가 이해하는 비즈니스·도메인 표현), requirements(위 도구 이름 중 필요한 것만 문자열 배열)."""
    return """# role
You are a guide for non-developers building websites.

# tools (internal IDs only; do not expose to the user)
db, payment, login, storage, frontend-hosting, backend-hosting, analytics, email, monitoring, headless-cms

# description rules (critical)
- Write description in **business and domain language** only. Do not use developer jargon (DB, API, hosting, frontend, backend, headless CMS, etc.).
- Phrase each item as what the user can do or the value they get (outcome-oriented, user-facing).
- Examples: db → "Store members and data", payment → "Accept payments", login → "Sign up and log in", storage → "Store files and images", frontend-hosting → "Publish your website", analytics → "See visitors and usage", email → "Send emails (welcome, notifications)", headless-cms → "Manage content (posts, menus)".

# job
Return only the features required for the user's requested website as a json with a "tools" array. Use the tools above so nothing is missed.
Each item: id (1-based index), description (short, in English, business/domain wording for non-developers), requirements (array of tool names from the list above)."""

# axtree 모드: AI 응답 구조 (response_format)
GUIDANCE_AXTREE_JSON_SCHEMA = {
    "type": "object",
    "properties": {
        "steps": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "step_text": {"type": "string", "description": "다음 단계 안내 문장"},
                    "backendDOMNodeId": {"type": ["integer", "null"], "description": "선택한 요소의 backendDOMNodeId (slim 목록에 있는 값)"},
                },
                "required": ["step_text", "backendDOMNodeId"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["steps"],
    "additionalProperties": False,
}

SURVEY_TOOLS_JSON_SCHEMA = {
    "type": "object",
    "properties": {
        "tools": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "integer"},
                    "description": {"type": "string"},
                    "requirements": {
                        "type": "array",
                        "items": {"type": "string"},
                    },
                },
                "required": ["id", "description", "requirements"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["tools"],
    "additionalProperties": False,
}


def _extract_output_text_from_responses_api(data: dict) -> str:
    """
    OpenAI Responses API 응답에서 마지막 assistant 메시지의 output_text를 추출합니다.
    output 항목에 web_search_call, message 등이 순서대로 올 수 있으므로
    type="message" 이고 role="assistant"인 항목 중 마지막 것의 텍스트를 반환합니다.
    """
    output = data.get("output") or []
    text = ""
    for item in output:
        if item.get("type") == "message" and item.get("role") == "assistant":
            for block in item.get("content") or []:
                if block.get("type") == "output_text" and block.get("text"):
                    text = block.get("text", "").strip()
    return text


def _count_web_search_calls_from_responses_api(data: dict) -> int:
    """
    OpenAI Responses API output에서 web_search 사용 횟수를 센다.
    - type="web_search_call" (Responses API 공식 형식)
    - type="tool_call" 이고 tool_name="web_search" (호환)
    """
    output = data.get("output") or []
    count = 0
    for item in output:
        if item.get("type") == "web_search_call":
            count += 1
        elif item.get("type") == "tool_call" and item.get("tool_name") == "web_search":
            count += 1
    return count


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
        
        use_axtree = request.slim_nodes is not None and len(request.slim_nodes) > 0
        user_content = request.user
        if use_axtree:
            user_content = (
                request.user
                + "\n\n## 현재 페이지 상호작용 요소\n"
                + "아래 목록에서 반드시 하나의 요소(backendDOMNodeId)를 골라 단계를 안내하세요. 선택한 노드의 backendDOMNodeId를 그대로 응답에 포함하세요.\n\n"
                + json.dumps(request.slim_nodes, ensure_ascii=False, indent=2)
            )

        # Responses API 입력 형식 (system + user 메시지, web_search 도구 사용)
        user_content_items = [{"type": "input_text", "text": user_content}]
        if request.page_context_type == "image" and request.page_context_content:
            image_url = request.page_context_content
            if not image_url.startswith("data:"):
                image_url = f"data:image/png;base64,{image_url}"
            user_content_items.append({"type": "input_image", "image_url": image_url})
            logger.info("이미지 포함됨")

        payload = {
            "model": request.model,
            "input": [
                {"role": "system", "content": [{"type": "input_text", "text": request.system}]},
                {"role": "user", "content": user_content_items},
            ],
            "tools": [{"type": "web_search"}],
            "max_output_tokens": 2048,
        }
        if use_axtree:
            payload["text"] = {
                "format": {
                    "type": "json_schema",
                    "name": "guidance_steps",
                    "schema": GUIDANCE_AXTREE_JSON_SCHEMA,
                    "strict": True,
                }
            }

        logger.info("OpenAI Responses API 호출 시작 (web_search 도구 사용)")
        async with httpx.AsyncClient(timeout=90.0) as client:
            response = await client.post(
                "https://api.openai.com/v1/responses",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {api_key}",
                },
                json=payload,
            )

            logger.info(f"OpenAI API 응답 상태: {response.status_code}")

            if not response.is_success:
                try:
                    error_data = response.json()
                    error_text = error_data.get("error", {}).get("message", response.text)
                except Exception:
                    error_text = response.text
                logger.error(f"OpenAI API 오류: {error_text}")
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"OpenAI API 오류 ({response.status_code}): {error_text}"
                )

            data = response.json()
            web_search_count = _count_web_search_calls_from_responses_api(data)
            if web_search_count > 0:
                logger.info(f"[guidance] 이번 요청에서 web_search 사용: {web_search_count}회")
            else:
                logger.info("[guidance] 이번 요청에서 web_search 미사용")
            raw = _extract_output_text_from_responses_api(data)

            if not raw:
                logger.error("OpenAI API가 빈 응답을 반환했습니다.")
                raise HTTPException(status_code=500, detail="OpenAI API가 빈 응답을 반환했습니다.")

            logger.info(f"OpenAI 응답 받음 (길이: {len(raw)})")

            if use_axtree:
                try:
                    parsed = json.loads(raw)
                    steps_data = parsed.get("steps") or []
                    steps = [
                        Step(
                            step_text=(s.get("step_text") or "").strip(),
                            backendDOMNodeId=s.get("backendDOMNodeId") if s.get("backendDOMNodeId") is not None else None,
                            text=(s.get("step_text") or "").strip(),
                            selector=None,
                        )
                        for s in steps_data
                        if (s.get("step_text") or "").strip()
                    ]
                except json.JSONDecodeError as e:
                    logger.error(f"axtree 응답 JSON 파싱 실패: {e}")
                    steps = [Step(step_text="안내를 생성하지 못했습니다. 다시 시도해 주세요.", backendDOMNodeId=None, text="안내를 생성하지 못했습니다. 다시 시도해 주세요.", selector=None)]
            else:
                parsed = parse_ai_response(raw)
                legacy_steps = parsed.get("steps", [])
                steps = [
                    Step(
                        step_text=(s.get("text") or "").strip(),
                        backendDOMNodeId=None,
                        text=(s.get("text") or "").strip(),
                        selector=s.get("selector"),
                    )
                    for s in legacy_steps
                    if (s.get("text") or "").strip()
                ]
            logger.info(f"파싱 완료: {len(steps)}개 단계")
            return GuidanceResponse(steps=steps)
            
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


@app.post("/api/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """
    일반 자연어 채팅용 API
    - 시스템 프롬프트와 유저 프롬프트를 그대로 OpenAI에 전달하고
    - 모델이 생성한 텍스트 전체를 그대로 반환한다.
    """
    import traceback

    try:
        logger.info(f"[chat] 요청 받음: model={request.model}")

        try:
            api_key = get_openai_api_key()
            logger.info("[chat] OpenAI API 키 확인 완료")
        except ValueError as e:
            logger.error(f"[chat] 환경변수 오류: {str(e)}")
            raise HTTPException(status_code=500, detail=f"환경변수 오류: {str(e)}")

        payload = {
            "model": request.model,
            "messages": [
                {"role": "system", "content": request.system},
                {"role": "user", "content": request.user},
            ],
            "max_tokens": 2048,
        }

        logger.info("[chat] OpenAI API 호출 시작")
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {api_key}",
                },
                json=payload,
            )

        logger.info(f"[chat] OpenAI API 응답 상태: {response.status_code}")

        if not response.is_success:
            try:
                error_data = response.json()
                error_text = error_data.get("error", {}).get("message", response.text)
            except Exception:
                error_text = response.text
            logger.error(f"[chat] OpenAI API 오류: {error_text}")
            raise HTTPException(
                status_code=response.status_code,
                detail=f"OpenAI API 오류 ({response.status_code}): {error_text}",
            )

        data = response.json()
        text = (
            data.get("choices", [{}])[0]
            .get("message", {})
            .get("content", "")
            .strip()
        )

        if not text:
            logger.error("[chat] OpenAI API가 빈 응답을 반환했습니다.")
            raise HTTPException(status_code=500, detail="OpenAI API가 빈 응답을 반환했습니다.")

        logger.info(f"[chat] 응답 길이: {len(text)}")
        return ChatResponse(text=text)

    except HTTPException:
        raise
    except httpx.TimeoutException:
        logger.error("[chat] OpenAI API 호출 시간 초과")
        raise HTTPException(status_code=504, detail="OpenAI API 호출 시간 초과")
    except httpx.RequestError as e:
        logger.error(f"[chat] OpenAI API 요청 실패: {str(e)}")
        raise HTTPException(status_code=500, detail=f"OpenAI API 요청 실패: {str(e)}")
    except Exception as e:
        error_msg = str(e) if str(e) else type(e).__name__
        error_trace = traceback.format_exc()
        logger.error(f"[chat] 서버 오류: {error_msg}\n{error_trace}")
        raise HTTPException(status_code=500, detail=f"서버 오류: {error_msg}")


@app.post("/api/survey-tools", response_model=SurveyToolsResponse)
async def get_survey_tools(request: SurveyToolsRequest):
    """
    사용자 설문 답변(어떤 웹사이트를 만들고 싶은지)을 받아
    AI가 필수 도구 목록을 JSON으로 추천. response_format으로 구조 보장.
    """
    try:
        api_key = get_openai_api_key()
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))

    locale = (getattr(request, "locale", None) or "en").lower()
    is_ko = locale.startswith("ko")
    user_answer = request.user_answer.strip() or ("알 수 없음" if is_ko else "Not specified")
    if is_ko:
        user_content = (
            f"사용자 답변: {user_answer}\n\n"
            "위 답변을 바탕으로 해당 웹사이트 제작에 꼭 필요한 기능만 골라서 tools 배열을 반환해. "
            "각 항목의 description은 반드시 비개발자가 이해하기 쉬운 비즈니스·도메인 용어로만 써줘(개발 용어 사용 금지)."
        )
    else:
        user_content = (
            f"User answer: {user_answer}\n\n"
            "From this answer, return a tools array with only the features needed to build that website. "
            "Write each description in business/domain language that non-developers understand (no developer jargon)."
        )

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}",
            },
            json={
                "model": "gpt-4o-mini",
                "messages": [
                    {"role": "system", "content": _survey_tools_system(getattr(request, "locale", "en") or "en")},
                    {"role": "user", "content": user_content},
                ],
                "max_tokens": 1024,
                "temperature": 0.3,
                "response_format": {
                    "type": "json_schema",
                    "json_schema": {
                        "name": "survey_tools",
                        "strict": True,
                        "schema": SURVEY_TOOLS_JSON_SCHEMA,
                    },
                },
            },
        )

    if not response.is_success:
        try:
            err = response.json().get("error", {}).get("message", response.text)
        except Exception:
            err = response.text
        raise HTTPException(status_code=response.status_code, detail=err)

    data = response.json()
    raw = (data.get("choices", [{}])[0].get("message", {}).get("content") or "").strip()
    if not raw:
        raise HTTPException(status_code=500, detail="AI가 빈 응답을 반환했습니다.")

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"AI 응답 JSON 파싱 실패: {e}")

    tools = parsed.get("tools") or []
    fallback_desc = "Feature" if not locale.startswith("ko") else "기능"
    out = []
    for t in tools:
        reqs = [r for r in (t.get("requirements") or []) if r in ALLOWED_REQUIREMENTS]
        out.append(SurveyToolItem(
            id=int(t.get("id", 0)),
            description=(t.get("description") or "").strip() or fallback_desc,
            requirements=reqs,
        ))
    return SurveyToolsResponse(tools=out)


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
