import base64
import json
import os
import threading
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional

import requests
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from azure.ai.inference import ChatCompletionsClient
from azure.ai.inference.models import SystemMessage, UserMessage
from azure.core.exceptions import HttpResponseError
from azure.core.credentials import AzureKeyCredential
from huggingface_hub import InferenceClient


load_dotenv()

GENERATED_DIR = Path(__file__).parent / "generated"
GENERATED_DIR.mkdir(parents=True, exist_ok=True)


class Scene(BaseModel):
    scene_number: int = Field(..., ge=1)
    setting: str
    dialogue_or_narration: str
    action_description: str
    visual_prompt: str


class StoryScript(BaseModel):
    title: str
    scenes: List[Scene]


class GenerateStoryRequest(BaseModel):
    story_text: str = Field(..., min_length=1, max_length=20_000)
    seed: int = 42
    generate_visuals: bool = True


class VisualAsset(BaseModel):
    scene_number: int
    type: Literal["video", "image", "unknown"] = "unknown"
    url: Optional[str] = None
    content_type: Optional[str] = None


class GenerateStoryResponse(BaseModel):
    script: StoryScript
    assets: List[VisualAsset] = []


def _get_github_models_client() -> ChatCompletionsClient:
    token = os.getenv("GITHUB_TOKEN")
    if not token:
        raise RuntimeError("Missing GITHUB_TOKEN in environment.")
    endpoint = os.getenv("GITHUB_MODELS_ENDPOINT", "https://models.github.ai/inference")
    return ChatCompletionsClient(endpoint=endpoint, credential=AzureKeyCredential(token))

def _get_hf_inference_client(timeout_seconds: int = 600) -> InferenceClient:
    token = os.getenv("HF_TOKEN")
    if not token:
        raise RuntimeError("Missing HF_TOKEN in environment.")
    provider = os.getenv("HF_PROVIDER", "zai-org")
    return InferenceClient(provider=provider, api_key=token, timeout=timeout_seconds)


def _director_system_prompt() -> str:
    return (
        "You are an expert film director and storyboard artist.\n"
        "Your job is to convert a free-form story into a scene-by-scene shooting script.\n"
        "\n"
        "Respond with a single valid JSON object (no markdown) that matches this schema exactly:\n"
        "{\n"
        '  "title": string,\n'
        '  "scenes": [\n'
        "    {\n"
        '      "scene_number": integer (starting at 1),\n'
        '      "setting": string,\n'
        '      "dialogue_or_narration": string,\n'
        '      "action_description": string,\n'
        '      "visual_prompt": string\n'
        "    }\n"
        "  ]\n"
        "}\n"
        "\n"
        "Constraints:\n"
        "- 5 to 10 scenes unless the story is extremely short.\n"
        "- visual_prompt must be vivid and concrete for image/video generation.\n"
        "- If details are missing/ambiguous, creatively fill in the gaps while staying consistent.\n"
        "- Keep characters consistent (appearance, clothing, age) across scenes.\n"
        "- Include camera/lighting/style cues in visual_prompt (e.g., 'wide shot', 'soft rim light', 'cinematic').\n"
    )


def generate_script_from_text(story_text: str) -> StoryScript:
    client = _get_github_models_client()
    model = os.getenv("GITHUB_MODELS_CHAT_MODEL", "openai/gpt-4.1")
    try:
        response = client.complete(
            messages=[
                SystemMessage(_director_system_prompt()),
                UserMessage(
                    "Convert the following story into the JSON schema exactly.\n\n"
                    f"STORY:\n{story_text}\n"
                ),
            ],
            temperature=0.0,
            top_p=1.0,
            model=model,
        )
    except HttpResponseError as e:
        msg = str(e)
        if "content_filter" in msg or "ResponsibleAIPolicyViolation" in msg:
            raise HTTPException(
                status_code=400,
                detail=(
                    "The script request was blocked by the model's content filter. "
                    "Try rephrasing your story (avoid explicit/unsafe content) and retry."
                ),
            )
        raise HTTPException(status_code=502, detail=f"LLM request failed: {msg}")
    raw = ((response.choices[0].message.content if response.choices else "") or "").strip()

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=502, detail=f"LLM returned non-JSON output: {str(e)}")
    try:
        return StoryScript.model_validate(data)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"LLM JSON did not match schema: {str(e)}")


def _save_binary_asset(content: bytes, content_type: str) -> str:
    ext = "bin"
    ct = (content_type or "").lower()
    if "video/mp4" in ct:
        ext = "mp4"
    elif "image/png" in ct:
        ext = "png"
    elif "image/jpeg" in ct or "image/jpg" in ct:
        ext = "jpg"
    filename = f"{uuid.uuid4().hex}.{ext}"
    path = GENERATED_DIR / filename
    path.write_bytes(content)
    return f"/generated/{filename}"


def call_text_to_video(prompt: str, seed: int, timeout_seconds: int = 600) -> VisualAsset:
    client = _get_hf_inference_client(timeout_seconds=timeout_seconds)
    model = os.getenv("HF_TEXT_TO_VIDEO_MODEL", "zai-org/CogVideoX-5b")

    # Some providers/models may ignore 'seed'; we still pass it for determinism when supported.
    kwargs: Dict[str, Any] = {"model": model}
    try:
        kwargs["seed"] = seed
    except Exception:
        pass

    max_retries = 3
    backoff_seconds = [10, 20, 30]

    last_error = None

    for attempt in range(max_retries + 1):
        try:
            video = client.text_to_video(prompt, **kwargs)
            if hasattr(video, "read"):
                blob = video.read()
            else:
                blob = bytes(video)
            url = _save_binary_asset(blob, "video/mp4")
            return VisualAsset(scene_number=0, type="video", url=url, content_type="video/mp4")
        except TimeoutError:
            raise HTTPException(
                status_code=504,
                detail="Video generation timed out (cold start can take minutes). Try again.",
            )
        except Exception as e:
            last_error = str(e)
            msg = str(e).lower()
            is_loading = ("503" in msg) or ("loading" in msg) or ("model is loading" in msg)
            is_forbidden = ("403" in msg) or ("forbidden" in msg) or ("insufficient permissions" in msg)
            if is_loading and attempt < max_retries:
                time.sleep(backoff_seconds[min(attempt, len(backoff_seconds) - 1)])
                continue
            if is_loading:
                raise HTTPException(
                    status_code=503,
                    detail="Model is loading (Scale-to-Zero cold start). Please retry in a moment.",
                )
            if is_forbidden:
                raise HTTPException(
                    status_code=403,
                    detail=(
                        "403 Forbidden from Hugging Face Inference Provider. "
                        "Your HF token likely lacks 'Inference Providers' permissions. "
                        "Create/update the token on Hugging Face with provider access enabled, "
                        "then set it as HF_TOKEN."
                    ),
                )
            raise HTTPException(status_code=502, detail=f"Video generation failed: {last_error}")

    raise HTTPException(
        status_code=502,
        detail=f"Video generation failed after retries: {last_error}",
    )


app = FastAPI(title="Narrative-to-Visual Story Agent")

frontend_origin = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/generated", StaticFiles(directory=str(GENERATED_DIR)), name="generated")

_self_ping_stop_event = threading.Event()


def _self_ping_worker() -> None:
    interval_seconds = max(int(os.getenv("SELF_PING_INTERVAL_SECONDS", "900")), 60)
    base_url = os.getenv("SELF_PING_URL") or os.getenv("RENDER_EXTERNAL_URL")
    if not base_url:
        return
    target = base_url.rstrip("/") + "/health"
    # Keep service warm by generating periodic internal traffic.
    while not _self_ping_stop_event.wait(interval_seconds):
        try:
            requests.get(target, timeout=10)
        except Exception:
            # Best effort keepalive only; ignore transient failures.
            pass


@app.on_event("startup")
def _startup_keepalive() -> None:
    enabled = os.getenv("ENABLE_SELF_PING", "true").strip().lower()
    if enabled not in {"1", "true", "yes", "on"}:
        return
    thread = threading.Thread(target=_self_ping_worker, name="self-ping-worker", daemon=True)
    thread.start()


@app.on_event("shutdown")
def _shutdown_keepalive() -> None:
    _self_ping_stop_event.set()


@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.post("/generate-story", response_model=GenerateStoryResponse)
def generate_story(req: GenerateStoryRequest) -> GenerateStoryResponse:
    script = generate_script_from_text(req.story_text)

    assets: List[VisualAsset] = []
    if req.generate_visuals:
        for scene in script.scenes:
            try:
                asset = call_text_to_video(scene.visual_prompt, seed=req.seed)
            except HTTPException as e:
                detail = e.detail if isinstance(e.detail, str) else str(e.detail)
                raise HTTPException(
                    status_code=e.status_code,
                    detail=f"Visual generation failed at scene {scene.scene_number}: {detail}",
                )
            asset.scene_number = scene.scene_number
            assets.append(asset)

    return GenerateStoryResponse(script=script, assets=assets)

