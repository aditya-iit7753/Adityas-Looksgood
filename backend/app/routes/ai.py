import json
from pathlib import Path
import tempfile
import urllib.error
import urllib.request
import mimetypes
import uuid
import re
import base64
import math
import struct
import textwrap
import wave
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from pydantic import BaseModel
from app.config import GENERATED_STORAGE_DIR, OPENAI_API_KEY, OPENAI_MODEL
from app.auth import get_current_user
from app.database import get_db
from app.models import Post, Product, User
from app.utils.ffmpeg_setup import ensure_ffmpeg
from app.utils.video_generator import create_short_video
from app.utils.commerce import apply_post_product_tags, parse_product_ids
from sqlalchemy.orm import Session

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    import speech_recognition as sr  # type: ignore[import-not-found]
else:
    try:
        import speech_recognition as sr  # type: ignore[import-not-found]
    except Exception:
        sr = None  # type: ignore[assignment]

AI_IMPORT_ERRORS: list[str] = []

if sr is None:
    AI_IMPORT_ERRORS.append("speech_recognition: package not installed")

ensure_ffmpeg()

try:
    from pydub import AudioSegment
except Exception:
    AudioSegment = None

if TYPE_CHECKING:
    import imageio_ffmpeg as imageio_ffmpeg  # type: ignore[import-not-found]
else:
    try:
        import imageio_ffmpeg  # type: ignore[import-not-found]
    except Exception:
        imageio_ffmpeg = None  # type: ignore[assignment]

try:
    from app.ai.person_detector import detect_person
except Exception as exc:
    AI_IMPORT_ERRORS.append(f"person_detector: {exc}")

    def detect_person(_image_path: str) -> bool:
        return True

try:
    from app.ai.style_classifier import classify_style
except Exception as exc:
    AI_IMPORT_ERRORS.append(f"style_classifier: {exc}")

    def classify_style(_image_path: str) -> str:
        return "casual outfit"

try:
    from app.ai.outfit_recommender import recommend
except Exception as exc:
    AI_IMPORT_ERRORS.append(f"outfit_recommender: {exc}")

    def recommend(style: str):
        return {
            "top": "Oversized T-shirt",
            "bottom": "Denim jeans",
            "shoes": "Sneakers",
            "note": f"Fallback suggestion for {style or 'casual outfit'}",
        }

AI_AVAILABLE = True
AI_IMPORT_ERROR = "; ".join(AI_IMPORT_ERRORS) if AI_IMPORT_ERRORS else None

router = APIRouter()

GENERATED_DIR = GENERATED_STORAGE_DIR
GENERATED_DIR.mkdir(parents=True, exist_ok=True)
SUPPORTED_STUDIO_KINDS = {"image", "audio", "video", "content", "text"}

try:
    from PIL import Image, ImageDraw, ImageFont, ImageEnhance, ImageFilter, ImageOps  # pyright: ignore[reportMissingImports]

    PIL_AVAILABLE = True
except Exception:
    PIL_AVAILABLE = False


class AssistantRequest(BaseModel):
    prompt: str
    history: list[dict] | None = None


class AssistantResponse(BaseModel):
    reply: str
    provider: str


class EnhanceCreationRequest(BaseModel):
    prompt: str
    caption: str | None = None
    vibe: str | None = None
    platform: str | None = "social"


class EnhanceCreationResponse(BaseModel):
    improved_caption: str
    hook_line: str
    creative_tips: list[str]
    hashtags: list[str]
    provider: str


class MoodReelsRequest(BaseModel):
    mood_text: str | None = None
    recent_captions: list[str] | None = None
    want_to_create: bool = True


class MoodReelsResponse(BaseModel):
    detected_mood: str
    confidence: float
    reel_feed_focus: list[str]
    recommended_filters: list[str]
    reel_ideas: list[dict]
    upcoming_trends: list[dict]
    creation_prompts: list[str]
    provider: str


class SmartCoachResponse(BaseModel):
    persona: str
    confidence: float
    mood_signal: str
    visual_style_signal: str
    nlp_tags: list[str]
    insights: list[str]
    best_post_windows: list[str]
    quick_actions: list[dict]
    ease_features: list[str]
    provider: str


class StudioGenerateRequest(BaseModel):
    prompt: str
    kind: Literal["image", "audio", "video", "content", "text"] = "content"
    source_url: str | None = None
    style: str | None = None


class StudioGenerateResponse(BaseModel):
    kind: str
    provider: str
    model: str
    title: str
    caption: str
    content_text: str
    hashtags: list[str]
    asset_url: str | None = None
    preview_image_url: str | None = None
    audio_url: str | None = None
    video_url: str | None = None
    publish_media_url: str | None = None


class StudioPublishRequest(BaseModel):
    media_url: str
    caption: str | None = None


@router.post("/generate-look")
async def generate_look(image: UploadFile = File(...)):
    temp_dir = Path(tempfile.gettempdir())
    path = str(temp_dir / f"{uuid.uuid4()}.jpg")
    with open(path, "wb") as f:
        f.write(await image.read())

    if not detect_person(path):
        return {"error": "No person detected"}

    style = classify_style(path)
    outfit = recommend(style)

    return {
        "detected_style": style,
        "outfit_suggestion": outfit,
        "confidence": 0.93,
    }


def _fallback_creation_enhance(prompt: str, caption: str | None = None, vibe: str | None = None):
    base_caption = (caption or "").strip() or "Own your look and wear your confidence."
    base_vibe = (vibe or "").strip() or "fresh and stylish"
    idea = (prompt or "").strip() or "make this creation stand out"
    improved = f"{base_caption} {idea.capitalize()} with a {base_vibe} vibe."
    improved = improved[:220]
    return {
        "improved_caption": improved,
        "hook_line": "Scroll-stopping style starts now.",
        "creative_tips": [
            "Use bright natural light or soft key light to keep colors crisp.",
            "Keep your first 2 seconds dynamic with a close-to-wide transition.",
            "Match caption tone with outfit mood and end with a clear call-to-action.",
        ],
        "hashtags": ["#LooksGood", "#FashionReel", "#StyleInspo", "#OOTD", "#CreatorStyle"],
    }


def _extract_json_object(text: str) -> dict | None:
    raw = str(text or "").strip()
    if not raw:
        return None

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass

    fenced = re.search(r"\{[\s\S]*\}", raw)
    if not fenced:
        return None

    try:
        return json.loads(fenced.group(0))
    except json.JSONDecodeError:
        return None


def _safe_filename_fragment(value: str, max_len: int = 34) -> str:
    cleaned = re.sub(r"[^a-z0-9]+", "-", str(value or "").strip().lower()).strip("-")
    return cleaned[:max_len] or "asset"


def _is_video_url(value: str) -> bool:
    text = str(value or "").strip().lower()
    if not text:
        return False
    return bool(re.search(r"\.(mp4|mov|m4v|webm|avi|mkv)(\?|$)", text))


def _is_audio_url(value: str) -> bool:
    text = str(value or "").strip().lower()
    if not text:
        return False
    return bool(re.search(r"\.(mp3|wav|m4a|aac|ogg)(\?|$)", text))


def _clean_hashtags(values: list | None, fallback: list[str] | None = None) -> list[str]:
    cleaned: list[str] = []
    for value in values or []:
        tag = str(value or "").strip().replace(" ", "")
        if not tag:
            continue
        if not tag.startswith("#"):
            tag = f"#{tag.lstrip('#')}"
        cleaned.append(tag[:40])
        if len(cleaned) >= 6:
            break
    if cleaned:
        return cleaned
    return list(fallback or ["#LooksGood", "#CreatorTools", "#StudioMode"])


def _fallback_studio_metadata(kind: str, prompt: str, style: str | None = None, source_hint: str | None = None) -> dict:
    clean_kind = str(kind or "content").strip().lower()
    clean_prompt = str(prompt or "").strip() or "Create a polished creator-ready result"
    clean_style = str(style or "").strip() or "bold"
    clean_source = str(source_hint or "").strip()
    source_note = f" Inspired by source: {clean_source}." if clean_source else ""

    title_map = {
        "image": "Visual Concept",
        "video": "Video Concept",
        "audio": "Audio Concept",
        "text": "Caption Concept",
        "content": "Creator Concept",
    }
    title = f"{title_map.get(clean_kind, 'Creator Concept')} - {_safe_filename_fragment(clean_prompt, 20).replace('-', ' ').title()}"
    caption = f"{clean_prompt}. Styled in a {clean_style} direction.{source_note}".strip()
    content_text = (
        f"Hook: {clean_prompt}\n"
        f"Direction: {clean_style}\n"
        "Structure: start strong, show transformation, close with call-to-action."
    )
    tags = ["#LooksGood", "#StudioBuild", "#CreatorFlow", "#TrendReady", "#MakeItPop"]
    return {
        "title": title[:120],
        "caption": caption[:320],
        "content_text": content_text[:1200],
        "hashtags": tags,
    }


def _openai_studio_metadata(kind: str, prompt: str, style: str | None = None, source_hint: str | None = None) -> dict | None:
    if not OPENAI_API_KEY:
        return None

    payload = {
        "model": OPENAI_MODEL,
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are a multimodal creator engine for LooksGood. "
                    "Return ONLY JSON with keys: title, caption, content_text, hashtags. "
                    "caption <= 260 chars. hashtags must be an array of 4-6 tags starting with #."
                ),
            },
            {
                "role": "user",
                "content": json.dumps(
                    {
                        "kind": kind,
                        "prompt": prompt,
                        "style": style or "",
                        "source_hint": source_hint or "",
                    }
                ),
            },
        ],
        "temperature": 0.6,
    }

    req = urllib.request.Request(
        url="https://api.openai.com/v1/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {OPENAI_API_KEY}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=25) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
            parsed = _extract_json_object(content)
            if not parsed:
                return None
            title = str(parsed.get("title") or "").strip()
            caption = str(parsed.get("caption") or "").strip()
            content_text = str(parsed.get("content_text") or "").strip()
            hashtags = _clean_hashtags(parsed.get("hashtags"))
            if not title or not caption:
                return None
            return {
                "title": title[:120],
                "caption": caption[:320],
                "content_text": (content_text or caption)[:1200],
                "hashtags": hashtags,
            }
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, ValueError):
        return None


def _save_uploaded_asset(data: bytes, filename: str | None = None, content_type: str | None = None) -> Path:
    suffix = Path(filename or "").suffix.lower()
    mime = str(content_type or "").lower()
    if not suffix:
        if "video" in mime:
            suffix = ".mp4"
        elif "audio" in mime:
            suffix = ".wav"
        elif "image" in mime:
            suffix = ".png"
        else:
            suffix = ".bin"
    path = GENERATED_DIR / f"source-{uuid.uuid4().hex}{suffix}"
    with open(path, "wb") as file:
        file.write(data)
    return path


def _write_prompt_poster(prompt: str, title: str) -> Path:
    safe_title = str(title or "LooksGood Studio").strip()[:120]
    safe_prompt = str(prompt or "").strip()[:420] or "Create a premium creator-ready result."

    if PIL_AVAILABLE:
        width = 1080
        height = 1350
        image = Image.new("RGB", (width, height), color="#10213A")
        draw = ImageDraw.Draw(image)
        font = ImageFont.load_default()

        for y in range(height):
            ratio = y / max(1, height - 1)
            r = int(16 + (42 * ratio))
            g = int(34 + (96 * ratio))
            b = int(58 + (142 * ratio))
            draw.line([(0, y), (width, y)], fill=(r, g, b))

        draw.rectangle([(64, 80), (1016, 1260)], outline=(194, 231, 255), width=3)
        draw.text((96, 120), safe_title, fill=(234, 247, 255), font=font)
        wrapped = textwrap.wrap(safe_prompt, width=44)
        y_cursor = 210
        for line in wrapped[:14]:
            draw.text((96, y_cursor), line, fill=(228, 240, 252), font=font)
            y_cursor += 38
        draw.text((96, 1170), "LooksGood Studio", fill=(189, 223, 245), font=font)

        out_path = GENERATED_DIR / f"studio-{uuid.uuid4().hex}.png"
        image.save(out_path, format="PNG")
        return out_path

    # Fallback when PIL is unavailable.
    esc_title = safe_title.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    esc_prompt = safe_prompt.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    out_path = GENERATED_DIR / f"studio-{uuid.uuid4().hex}.svg"
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350">
<defs>
<linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0%" stop-color="#14274A"/>
<stop offset="100%" stop-color="#2C7DAA"/>
</linearGradient>
</defs>
<rect width="1080" height="1350" fill="url(#g)"/>
<rect x="64" y="80" width="952" height="1180" fill="none" stroke="#C2E7FF" stroke-width="3"/>
<text x="96" y="140" fill="#EAF7FF" font-size="36" font-family="Arial">{esc_title}</text>
<foreignObject x="96" y="200" width="860" height="900">
<div xmlns="http://www.w3.org/1999/xhtml" style="font-family:Arial;color:#E4F0FC;font-size:28px;line-height:1.4;">{esc_prompt}</div>
</foreignObject>
<text x="96" y="1210" fill="#BDE0F5" font-size="26" font-family="Arial">LooksGood Studio</text>
</svg>"""
    out_path.write_text(svg, encoding="utf-8")
    return out_path


def _openai_generate_image_asset(prompt: str) -> Path | None:
    if not OPENAI_API_KEY:
        return None
    payload = {
        "model": "gpt-image-1",
        "prompt": str(prompt or "").strip() or "A professional fashion creator visual",
        "size": "1024x1024",
    }
    req = urllib.request.Request(
        url="https://api.openai.com/v1/images/generations",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {OPENAI_API_KEY}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=35) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        entries = data.get("data", [])
        if not entries:
            return None
        first = entries[0]
        b64 = first.get("b64_json")
        if b64:
            raw = base64.b64decode(b64)
            path = GENERATED_DIR / f"studio-{uuid.uuid4().hex}.png"
            with open(path, "wb") as file:
                file.write(raw)
            return path
        url = str(first.get("url") or "").strip()
        if url:
            with urllib.request.urlopen(url, timeout=25) as img_resp:
                raw = img_resp.read()
            path = GENERATED_DIR / f"studio-{uuid.uuid4().hex}.png"
            with open(path, "wb") as file:
                file.write(raw)
            return path
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, ValueError, base64.binascii.Error):
        return None
    return None


def _openai_generate_audio_asset(prompt: str) -> Path | None:
    if not OPENAI_API_KEY:
        return None
    payload = {
        "model": "gpt-4o-mini-tts",
        "voice": "alloy",
        "input": str(prompt or "").strip() or "A stylish creator voiceover",
        "format": "mp3",
    }
    req = urllib.request.Request(
        url="https://api.openai.com/v1/audio/speech",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {OPENAI_API_KEY}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=35) as resp:
            audio_bytes = resp.read()
        if not audio_bytes:
            return None
        out_path = GENERATED_DIR / f"studio-{uuid.uuid4().hex}.mp3"
        with open(out_path, "wb") as file:
            file.write(audio_bytes)
        return out_path
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        return None


def _fallback_generate_audio_asset(prompt: str) -> Path:
    # Simple synth tone fallback so audio generation remains available offline.
    duration_seconds = 7
    sample_rate = 22050
    total_samples = duration_seconds * sample_rate
    base = 220 + (sum(ord(ch) for ch in str(prompt or "")) % 180)

    out_path = GENERATED_DIR / f"studio-{uuid.uuid4().hex}.wav"
    with wave.open(str(out_path), "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)

        for i in range(total_samples):
            t = i / sample_rate
            freq = base + (25 * math.sin(2 * math.pi * 0.35 * t))
            envelope = 0.8 - (0.4 * (i / max(1, total_samples)))
            sample = int(13000 * envelope * math.sin(2 * math.pi * freq * t))
            wav_file.writeframesraw(struct.pack("<h", sample))
    return out_path


def _create_video_asset_from_image(image_path: Path | None) -> Path | None:
    if image_path is None:
        return None
    if image_path.suffix.lower() not in {".png", ".jpg", ".jpeg"}:
        return None
    out_path = GENERATED_DIR / f"studio-{uuid.uuid4().hex}.mp4"
    try:
        create_short_video(str(image_path), str(out_path))
    except Exception:
        return None
    if not out_path.exists():
        return None
    return out_path


def _generated_asset_url(request: Request, path: Path | None) -> str | None:
    if path is None:
        return None
    return f"{str(request.base_url).rstrip('/')}/generated/{path.name}"


def _apply_face_filter(image_path: Path, filter_name: str) -> Path:
    if not PIL_AVAILABLE:
        return image_path

    image = Image.open(image_path).convert("RGB")
    name = str(filter_name or "glow").strip().lower()

    if name in {"noir", "mono", "bw"}:
        filtered = ImageOps.grayscale(image).convert("RGB")
        filtered = ImageEnhance.Contrast(filtered).enhance(1.2)
    elif name in {"warm", "sunset"}:
        r, g, b = image.split()
        r = r.point(lambda i: min(255, int(i * 1.08)))
        b = b.point(lambda i: max(0, int(i * 0.96)))
        filtered = Image.merge("RGB", (r, g, b))
        filtered = ImageEnhance.Color(filtered).enhance(1.12)
    elif name in {"cool", "ice"}:
        r, g, b = image.split()
        r = r.point(lambda i: max(0, int(i * 0.96)))
        b = b.point(lambda i: min(255, int(i * 1.08)))
        filtered = Image.merge("RGB", (r, g, b))
        filtered = ImageEnhance.Color(filtered).enhance(1.12)
    elif name in {"vivid", "pop"}:
        filtered = ImageEnhance.Color(image).enhance(1.35)
        filtered = ImageEnhance.Contrast(filtered).enhance(1.1)
    else:  # glow / default
        soft = image.filter(ImageFilter.GaussianBlur(6))
        filtered = Image.blend(image, soft, 0.35)
        filtered = ImageEnhance.Brightness(filtered).enhance(1.05)

    out_path = GENERATED_DIR / f"face-filter-{uuid.uuid4().hex}.jpg"
    filtered.save(out_path, format="JPEG", quality=92)
    return out_path


def _apply_background_change(image_path: Path, prompt: str | None = None) -> Path:
    if not PIL_AVAILABLE:
        return image_path

    base = Image.open(image_path).convert("RGB")
    width, height = base.size
    bg_image = None

    if prompt:
        try:
            poster_path = _write_prompt_poster(prompt, "Auto Background")
            bg_image = Image.open(poster_path).convert("RGB")
        except Exception:
            bg_image = None

    if bg_image is None:
        bg_image = base.filter(ImageFilter.GaussianBlur(18))

    bg_image = bg_image.resize((width, height))

    mask = Image.new("L", (width, height), 0)
    draw = ImageDraw.Draw(mask)
    margin_x = int(width * 0.12)
    margin_y = int(height * 0.08)
    draw.ellipse([margin_x, margin_y, width - margin_x, height - margin_y], fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(30))

    composite = Image.composite(base, bg_image, mask)
    out_path = GENERATED_DIR / f"background-change-{uuid.uuid4().hex}.jpg"
    composite.save(out_path, format="JPEG", quality=92)
    return out_path


def _apply_avatar_3d(image_path: Path, style: str | None = None) -> Path:
    if not PIL_AVAILABLE:
        return image_path

    image = Image.open(image_path).convert("RGB")
    name = str(style or "toon").strip().lower()

    if name in {"toon", "cartoon"}:
        base = ImageOps.posterize(image, bits=4)
        base = base.filter(ImageFilter.SMOOTH_MORE)
        edges = image.filter(ImageFilter.EDGE_ENHANCE_MORE)
        filtered = Image.blend(base, edges, 0.25)
    elif name in {"neon", "cyber"}:
        base = ImageEnhance.Color(image).enhance(1.4)
        base = ImageEnhance.Contrast(base).enhance(1.2)
        overlay = Image.new("RGB", base.size, (64, 140, 255))
        filtered = Image.blend(base, overlay, 0.18)
    elif name in {"soft", "dreamy"}:
        base = image.filter(ImageFilter.GaussianBlur(3))
        filtered = Image.blend(image, base, 0.4)
        filtered = ImageEnhance.Brightness(filtered).enhance(1.06)
    else:  # glossy / default
        filtered = ImageEnhance.Color(image).enhance(1.2)
        filtered = ImageEnhance.Sharpness(filtered).enhance(1.1)

    out_path = GENERATED_DIR / f"avatar-3d-{uuid.uuid4().hex}.jpg"
    filtered.save(out_path, format="JPEG", quality=92)
    return out_path


def _guess_uploaded_kind(path: Path | None, content_type: str | None = None) -> str:
    mime = str(content_type or "").lower()
    suffix = (path.suffix.lower() if path else "").lower()
    if "video" in mime or suffix in {".mp4", ".mov", ".m4v", ".webm", ".avi", ".mkv"}:
        return "video"
    if "audio" in mime or suffix in {".mp3", ".wav", ".m4a", ".aac", ".ogg"}:
        return "audio"
    return "image"


def _build_studio_generation(
    request: Request,
    kind: str,
    prompt: str,
    style: str | None = None,
    source_url: str | None = None,
    uploaded_path: Path | None = None,
    uploaded_content_type: str | None = None,
) -> dict:
    clean_kind = str(kind or "content").strip().lower()
    if clean_kind not in SUPPORTED_STUDIO_KINDS:
        clean_kind = "content"

    clean_prompt = str(prompt or "").strip() or "Create a polished creator-ready result"
    clean_style = str(style or "").strip()
    clean_source_url = str(source_url or "").strip()

    openai_meta = _openai_studio_metadata(clean_kind, clean_prompt, clean_style, clean_source_url or None)
    meta = openai_meta or _fallback_studio_metadata(clean_kind, clean_prompt, clean_style, clean_source_url or None)
    provider = "openai" if openai_meta else "fallback"
    model_name = OPENAI_MODEL if openai_meta else "looksbook-studio-v1"

    image_path: Path | None = None
    video_path: Path | None = None
    audio_path: Path | None = None

    uploaded_kind = _guess_uploaded_kind(uploaded_path, uploaded_content_type) if uploaded_path else None
    if uploaded_path and uploaded_kind == "image":
        image_path = uploaded_path
    if uploaded_path and uploaded_kind == "video":
        video_path = uploaded_path
    if uploaded_path and uploaded_kind == "audio":
        audio_path = uploaded_path

    remote_image_url = clean_source_url if clean_source_url and not _is_video_url(clean_source_url) and not _is_audio_url(clean_source_url) else None
    remote_video_url = clean_source_url if clean_source_url and _is_video_url(clean_source_url) else None
    remote_audio_url = clean_source_url if clean_source_url and _is_audio_url(clean_source_url) else None

    if clean_kind == "image":
        if image_path is None and remote_image_url is None:
            image_path = _openai_generate_image_asset(f"{clean_prompt}. Style: {clean_style or 'editorial'}")
            if image_path is not None:
                provider = "openai"
                model_name = "gpt-image-1"
            else:
                image_path = _write_prompt_poster(clean_prompt, meta["title"])
        if video_path is None:
            video_path = _create_video_asset_from_image(image_path)

    elif clean_kind == "video":
        if video_path is None and remote_video_url is None:
            if image_path is None and remote_image_url is None:
                image_path = _openai_generate_image_asset(f"{clean_prompt}. Cinematic poster frame.")
                if image_path is not None:
                    provider = "openai"
                    model_name = "gpt-image-1"
                else:
                    image_path = _write_prompt_poster(clean_prompt, meta["title"])
            if image_path is None and remote_image_url:
                image_path = _write_prompt_poster(clean_prompt, meta["title"])
            video_path = _create_video_asset_from_image(image_path)

    elif clean_kind == "audio":
        if audio_path is None and remote_audio_url is None:
            audio_path = _openai_generate_audio_asset(clean_prompt)
            if audio_path is not None:
                provider = "openai"
                model_name = "gpt-4o-mini-tts"
            else:
                audio_path = _fallback_generate_audio_asset(clean_prompt)
        if image_path is None and remote_image_url is None:
            image_path = _write_prompt_poster(clean_prompt, meta["title"])
        if video_path is None:
            video_path = _create_video_asset_from_image(image_path)

    else:  # content/text
        if image_path is None and remote_image_url is None:
            image_path = _write_prompt_poster(meta.get("content_text") or clean_prompt, meta["title"])
        if video_path is None:
            video_path = _create_video_asset_from_image(image_path)

    image_url = _generated_asset_url(request, image_path) or remote_image_url
    video_url = _generated_asset_url(request, video_path) or remote_video_url
    audio_url = _generated_asset_url(request, audio_path) or remote_audio_url

    if clean_kind == "video":
        asset_url = video_url or image_url
    elif clean_kind == "audio":
        asset_url = audio_url
    else:
        asset_url = image_url or video_url

    publish_media_url = video_url or image_url or remote_video_url or remote_image_url or audio_url
    hashtags = _clean_hashtags(meta.get("hashtags"))

    return {
        "kind": clean_kind,
        "provider": provider,
        "model": model_name,
        "title": str(meta.get("title") or "LooksGood Studio").strip()[:120],
        "caption": str(meta.get("caption") or clean_prompt).strip()[:320],
        "content_text": str(meta.get("content_text") or clean_prompt).strip()[:1200],
        "hashtags": hashtags,
        "asset_url": asset_url,
        "preview_image_url": image_url,
        "audio_url": audio_url,
        "video_url": video_url,
        "publish_media_url": publish_media_url,
    }


@router.post("/face-filter", response_model=StudioGenerateResponse)
async def face_filter(
    request: Request,
    image: UploadFile = File(...),
    filter_name: str = Form(default="glow"),
):
    payload = await image.read()
    if not payload:
        raise HTTPException(status_code=400, detail="Image file is empty")

    source_path = _save_uploaded_asset(payload, image.filename, image.content_type)
    try:
        output_path = _apply_face_filter(source_path, filter_name)
    except Exception:
        output_path = source_path

    image_url = _generated_asset_url(request, output_path)
    clean_filter = str(filter_name or "glow").strip().title()
    return {
        "kind": "image",
        "provider": "face-filter",
        "model": "lsg-face-filter-v1",
        "title": f"{clean_filter} Face Filter",
        "caption": f"Applied {clean_filter} face filter.",
        "content_text": "",
        "hashtags": ["#LooksGood", "#FaceFilter"],
        "asset_url": image_url,
        "preview_image_url": image_url,
        "audio_url": None,
        "video_url": None,
        "publish_media_url": image_url,
    }


@router.post("/background-change", response_model=StudioGenerateResponse)
async def background_change(
    request: Request,
    image: UploadFile = File(...),
    prompt: str = Form(default=""),
    style: str = Form(default=""),
):
    payload = await image.read()
    if not payload:
        raise HTTPException(status_code=400, detail="Image file is empty")

    source_path = _save_uploaded_asset(payload, image.filename, image.content_type)
    clean_prompt = str(prompt or "").strip() or str(style or "").strip()
    try:
        output_path = _apply_background_change(source_path, clean_prompt or None)
    except Exception:
        output_path = source_path

    image_url = _generated_asset_url(request, output_path)
    title = "Auto Background"
    return {
        "kind": "image",
        "provider": "background-change",
        "model": "lsg-background-v1",
        "title": title,
        "caption": clean_prompt or "Auto background change.",
        "content_text": "",
        "hashtags": ["#LooksGood", "#BackgroundChange"],
        "asset_url": image_url,
        "preview_image_url": image_url,
        "audio_url": None,
        "video_url": None,
        "publish_media_url": image_url,
    }


@router.post("/avatar-3d", response_model=StudioGenerateResponse)
async def avatar_3d(
    request: Request,
    image: UploadFile = File(...),
    style: str = Form(default="toon"),
):
    payload = await image.read()
    if not payload:
        raise HTTPException(status_code=400, detail="Image file is empty")

    source_path = _save_uploaded_asset(payload, image.filename, image.content_type)
    try:
        output_path = _apply_avatar_3d(source_path, style)
    except Exception:
        output_path = source_path

    image_url = _generated_asset_url(request, output_path)
    style_label = str(style or "toon").strip().title()
    return {
        "kind": "image",
        "provider": "avatar-3d",
        "model": "lsg-avatar-3d-v1",
        "title": f"{style_label} 3D Avatar",
        "caption": f"Generated {style_label} 3D avatar.",
        "content_text": "",
        "hashtags": ["#LooksGood", "#3DAvatar"],
        "asset_url": image_url,
        "preview_image_url": image_url,
        "audio_url": None,
        "video_url": None,
        "publish_media_url": image_url,
    }


MOOD_KEYWORDS = {
    "energetic": ["energetic", "hype", "pump", "dance", "party", "fast", "workout", "excited"],
    "confident": ["confident", "boss", "power", "sharp", "winner", "strong", "bold", "clean fit"],
    "chill": ["chill", "calm", "relaxed", "soft", "minimal", "easy", "cozy", "slow"],
    "romantic": ["romantic", "date", "dreamy", "sweet", "love", "soft glam", "elegant"],
    "focused": ["focused", "productive", "study", "work mode", "discipline", "routine"],
    "bold": ["bold", "edgy", "street", "statement", "experimental", "loud", "high contrast"],
}

MOOD_FILTERS = {
    "energetic": ["popular", "latest"],
    "confident": ["popular", "all"],
    "chill": ["latest", "all"],
    "romantic": ["latest", "popular"],
    "focused": ["latest", "all"],
    "bold": ["popular", "all"],
    "balanced": ["all", "latest"],
}

MOOD_FEED_FOCUS = {
    "energetic": ["high-tempo transitions", "dance hooks", "quick cuts"],
    "confident": ["power poses", "clean fashion edits", "authority voiceovers"],
    "chill": ["soft aesthetic edits", "slow pan shots", "minimal captions"],
    "romantic": ["warm lighting", "dreamy closeups", "date-night styling"],
    "focused": ["routine breakdown reels", "how-to fashion utility", "value-first hooks"],
    "bold": ["streetwear transitions", "contrast styling", "statement accessories"],
    "balanced": ["mix of latest and popular", "style variety", "creator education"],
}

TREND_LIBRARY = [
    {
        "name": "1-Second Fit Transition",
        "momentum": "rising",
        "best_for_moods": ["energetic", "confident", "bold"],
        "why_it_is_coming": "Short attention hooks keep retention high in the first 2 seconds.",
        "best_post_window": "evening",
        "audio_style": "beat drop or hard cut",
    },
    {
        "name": "POV Styling Story",
        "momentum": "rising",
        "best_for_moods": ["romantic", "chill", "focused"],
        "why_it_is_coming": "Story-first captions are being rewarded with longer watch time.",
        "best_post_window": "afternoon",
        "audio_style": "soft vocal + low percussion",
    },
    {
        "name": "Color Match Challenge",
        "momentum": "hot",
        "best_for_moods": ["bold", "confident", "energetic"],
        "why_it_is_coming": "Challenge format drives comments and creator duets.",
        "best_post_window": "evening",
        "audio_style": "trending upbeat remix",
    },
    {
        "name": "Capsule Wardrobe 3-Look Reel",
        "momentum": "rising",
        "best_for_moods": ["focused", "chill", "balanced"],
        "why_it_is_coming": "Educational fashion formats are seeing stronger saves and shares.",
        "best_post_window": "morning",
        "audio_style": "clean instrumental",
    },
    {
        "name": "Before/After Style Upgrade",
        "momentum": "hot",
        "best_for_moods": ["confident", "bold", "balanced"],
        "why_it_is_coming": "Transformation stories produce high completion and replay rates.",
        "best_post_window": "night",
        "audio_style": "cinematic rise + impact",
    },
]


def _clean_string_list(values: list | None, max_items: int = 8) -> list[str]:
    if not isinstance(values, list):
        return []
    clean: list[str] = []
    for value in values:
        text = str(value or "").strip()
        if not text:
            continue
        clean.append(text)
        if len(clean) >= max_items:
            break
    return clean


def _detect_mood_fallback(text: str) -> tuple[str, float]:
    source = f" {str(text or '').strip().lower()} "
    if not source.strip():
        return "balanced", 0.52

    scores = {mood: 0 for mood in MOOD_KEYWORDS}
    for mood, keywords in MOOD_KEYWORDS.items():
        for kw in keywords:
            needle = kw.lower().strip()
            if not needle:
                continue
            if f" {needle} " in source:
                scores[mood] += 3
            elif needle in source:
                scores[mood] += 1

    best_mood = max(scores, key=scores.get)
    best_score = scores[best_mood]
    if best_score <= 0:
        return "balanced", 0.5
    confidence = min(0.95, 0.55 + (best_score * 0.06))
    return best_mood, round(confidence, 2)


def _build_mood_reel_plan_fallback(detected_mood: str, confidence: float, want_to_create: bool) -> dict:
    mood = detected_mood if detected_mood in MOOD_FILTERS else "balanced"

    matching = [trend for trend in TREND_LIBRARY if mood in trend.get("best_for_moods", [])]
    remaining = [trend for trend in TREND_LIBRARY if trend not in matching]
    picked = (matching + remaining)[:4]

    reel_ideas = []
    for idx, trend in enumerate(picked, start=1):
        hook_line = f"{trend['name']}: start with a visual hook in the first second."
        hashtags = ["#LooksGood", "#ReelTips", "#FashionCreator", "#TrendingNow", "#StyleInspo"]
        reel_ideas.append(
            {
                "id": idx,
                "title": trend["name"],
                "hook_line": hook_line,
                "concept": f"Build a {mood} reel around {trend['name'].lower()} and keep transitions clean.",
                "audio_style": trend["audio_style"],
                "best_post_window": trend["best_post_window"],
                "hashtags": hashtags,
                "sample_caption": f"{hook_line} {' '.join(hashtags)}",
            }
        )

    upcoming_trends = [
        {
            "name": trend["name"],
            "momentum": trend["momentum"],
            "why_it_is_coming": trend["why_it_is_coming"],
            "best_post_window": trend["best_post_window"],
        }
        for trend in picked
    ]

    creation_prompts = []
    if want_to_create:
        creation_prompts = [
            f"Create a {mood} fashion reel using {trend['name'].lower()} with {trend['audio_style']} audio."
            for trend in picked[:3]
        ]

    return {
        "detected_mood": mood,
        "confidence": confidence,
        "reel_feed_focus": MOOD_FEED_FOCUS.get(mood, MOOD_FEED_FOCUS["balanced"]),
        "recommended_filters": MOOD_FILTERS.get(mood, MOOD_FILTERS["balanced"]),
        "reel_ideas": reel_ideas,
        "upcoming_trends": upcoming_trends,
        "creation_prompts": creation_prompts,
    }


def _openai_mood_reel_plan(
    mood_text: str,
    recent_captions: list[str],
    want_to_create: bool,
    fallback: dict,
) -> dict | None:
    if not OPENAI_API_KEY:
        return None

    system_prompt = (
        "You are an AI content strategist for short-form fashion reels. "
        "Detect the user's mood and suggest matching reel feed focus, content ideas, and upcoming trends. "
        "Return ONLY JSON with keys: detected_mood, confidence, reel_feed_focus, recommended_filters, "
        "reel_ideas, upcoming_trends, creation_prompts. "
        "reel_ideas and upcoming_trends must be arrays of objects."
    )
    user_payload = {
        "mood_text": mood_text,
        "recent_captions": recent_captions[:8],
        "want_to_create": bool(want_to_create),
    }
    payload = {
        "model": OPENAI_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": json.dumps(user_payload)},
        ],
        "temperature": 0.45,
    }

    req = urllib.request.Request(
        url="https://api.openai.com/v1/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {OPENAI_API_KEY}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=25) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            content = (
                data.get("choices", [{}])[0]
                .get("message", {})
                .get("content", "")
            )
            parsed = _extract_json_object(content)
            if not parsed or not isinstance(parsed, dict):
                return None

            result = {
                "detected_mood": str(parsed.get("detected_mood") or fallback["detected_mood"]).strip().lower(),
                "confidence": float(parsed.get("confidence") or fallback["confidence"]),
                "reel_feed_focus": _clean_string_list(parsed.get("reel_feed_focus"), max_items=5)
                or fallback["reel_feed_focus"],
                "recommended_filters": _clean_string_list(parsed.get("recommended_filters"), max_items=3)
                or fallback["recommended_filters"],
                "reel_ideas": parsed.get("reel_ideas") if isinstance(parsed.get("reel_ideas"), list) else fallback["reel_ideas"],
                "upcoming_trends": parsed.get("upcoming_trends")
                if isinstance(parsed.get("upcoming_trends"), list)
                else fallback["upcoming_trends"],
                "creation_prompts": _clean_string_list(parsed.get("creation_prompts"), max_items=5)
                or fallback["creation_prompts"],
            }
            if not result["detected_mood"]:
                result["detected_mood"] = fallback["detected_mood"]
            if not isinstance(result["confidence"], float):
                result["confidence"] = fallback["confidence"]
            result["confidence"] = max(0.0, min(1.0, result["confidence"]))
            return result
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, ValueError):
        return None


SMART_KEYWORD_GROUPS = {
    "streetwear": ["street", "urban", "sneaker", "oversized", "hoodie", "cargo"],
    "minimal": ["minimal", "clean", "neutral", "simple", "soft"],
    "luxury": ["luxury", "premium", "elegant", "chic", "gold", "silk"],
    "sporty": ["gym", "workout", "sport", "athleisure", "run", "training"],
    "vintage": ["vintage", "retro", "classic", "oldschool", "nostalgia"],
}

POSITIVE_WORDS = {"love", "fire", "wow", "slay", "fresh", "clean", "best", "confident", "happy", "good", "amazing"}
NEGATIVE_WORDS = {"bad", "hate", "tired", "sad", "boring", "stuck", "confused", "low", "hard"}

DEFAULT_COACH_ACTIONS = [
    {"label": "Create Reel", "route": "Upload", "voice_command": "Hey LSG, create a new reel"},
    {"label": "Open AI Studio", "route": "AIAgent", "voice_command": "Hey LSG, open AI studio"},
    {"label": "Explore Trends", "route": "Reels", "voice_command": "Hey LSG, open reels"},
]


def _tokenize_words(text: str) -> list[str]:
    return re.findall(r"[a-z0-9#@']+", str(text or "").lower())


def _extract_nlp_tags(captions: list[str], max_tags: int = 6) -> list[str]:
    blocked = {"the", "and", "for", "with", "this", "that", "from", "your", "looks", "looksgood"}
    scores: dict[str, int] = {}
    for caption in captions:
        for token in _tokenize_words(caption):
            clean = token.strip("#@")
            if len(clean) < 4 or clean in blocked:
                continue
            scores[clean] = scores.get(clean, 0) + 1
    ordered = sorted(scores.items(), key=lambda item: item[1], reverse=True)
    return [f"#{tag}" for tag, _count in ordered[:max_tags]] or ["#style", "#creator", "#reels"]


def _detect_mood_signal(captions: list[str]) -> str:
    text = " ".join(captions).lower()
    pos = sum(1 for word in POSITIVE_WORDS if word in text)
    neg = sum(1 for word in NEGATIVE_WORDS if word in text)
    if pos - neg >= 2:
        return "high-energy confidence"
    if neg - pos >= 2:
        return "recovery mode"
    return "balanced creator flow"


def _detect_persona(captions: list[str], visual_style_signal: str) -> str:
    text = " ".join(captions).lower()
    scores = {name: 0 for name in SMART_KEYWORD_GROUPS}
    for persona, keywords in SMART_KEYWORD_GROUPS.items():
        for kw in keywords:
            if kw in text:
                scores[persona] += 1
    best = max(scores, key=scores.get) if scores else "minimal"
    if scores.get(best, 0) <= 0:
        best = "minimal"
    if str(visual_style_signal or "").strip():
        return f"{best} x {visual_style_signal.strip().lower()}"
    return best


def _openai_smart_coach(
    username: str,
    captions: list[str],
    post_count: int,
    visual_style_signal: str,
    fallback: dict,
) -> dict | None:
    if not OPENAI_API_KEY:
        return None

    payload = {
        "model": OPENAI_MODEL,
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are LooksGood AI Coach. Return ONLY JSON with keys: persona, confidence, mood_signal, "
                    "nlp_tags, insights, best_post_windows, quick_actions, ease_features. "
                    "quick_actions must be 3 items with keys label, route, voice_command. "
                    "Allowed route values: Upload, AIAgent, Reels, Discover, Profile, Chat, Feed, Settings."
                ),
            },
            {
                "role": "user",
                "content": json.dumps(
                    {
                        "username": username,
                        "post_count": post_count,
                        "recent_captions": captions[:16],
                        "visual_style_signal": visual_style_signal,
                    }
                ),
            },
        ],
        "temperature": 0.4,
    }

    req = urllib.request.Request(
        url="https://api.openai.com/v1/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {OPENAI_API_KEY}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=22) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, ValueError):
        return None

    parsed = _extract_json_object(content)
    if not isinstance(parsed, dict):
        return None

    confidence_raw = parsed.get("confidence")
    try:
        confidence = float(confidence_raw)
    except (TypeError, ValueError):
        confidence = fallback["confidence"]

    quick_actions = parsed.get("quick_actions")
    if not isinstance(quick_actions, list):
        quick_actions = fallback["quick_actions"]
    else:
        normalized_actions = []
        allowed_routes = {"Upload", "AIAgent", "Reels", "Discover", "Profile", "Chat", "Feed", "Settings"}
        for item in quick_actions[:3]:
            if not isinstance(item, dict):
                continue
            route = str(item.get("route") or "").strip()
            if route not in allowed_routes:
                route = "Feed"
            normalized_actions.append(
                {
                    "label": str(item.get("label") or "Open").strip()[:24] or "Open",
                    "route": route,
                    "voice_command": str(item.get("voice_command") or f"Hey LSG, open {route.lower()}").strip()[:80],
                }
            )
        quick_actions = normalized_actions or fallback["quick_actions"]

    return {
        "persona": str(parsed.get("persona") or fallback["persona"]).strip()[:80],
        "confidence": max(0.0, min(1.0, confidence)),
        "mood_signal": str(parsed.get("mood_signal") or fallback["mood_signal"]).strip()[:80],
        "visual_style_signal": fallback["visual_style_signal"],
        "nlp_tags": _clean_hashtags(parsed.get("nlp_tags"), fallback=fallback["nlp_tags"]),
        "insights": _clean_string_list(parsed.get("insights"), max_items=4) or fallback["insights"],
        "best_post_windows": _clean_string_list(parsed.get("best_post_windows"), max_items=3) or fallback["best_post_windows"],
        "quick_actions": quick_actions,
        "ease_features": _clean_string_list(parsed.get("ease_features"), max_items=4) or fallback["ease_features"],
    }


def _download_image_for_style_probe(image_url: str) -> str | None:
    clean = str(image_url or "").strip()
    if not clean.lower().startswith(("http://", "https://")):
        return None
    suffix = Path(clean.split("?")[0]).suffix.lower()
    if suffix not in {".jpg", ".jpeg", ".png", ".webp"}:
        suffix = ".jpg"
    target = Path(tempfile.gettempdir()) / f"style-probe-{uuid.uuid4().hex}{suffix}"
    req = urllib.request.Request(url=clean, headers={"User-Agent": "LooksGood/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=12) as resp:
            payload = resp.read()
        if not payload:
            return None
        with open(target, "wb") as file:
            file.write(payload)
        return str(target)
    except (urllib.error.URLError, TimeoutError, ValueError):
        return None


def _build_smart_coach_fallback(
    username: str,
    captions: list[str],
    post_count: int,
    visual_style_signal: str,
) -> dict:
    persona = _detect_persona(captions, visual_style_signal)
    mood = _detect_mood_signal(captions)
    tags = _extract_nlp_tags(captions, max_tags=6)
    cadence = "daily" if post_count >= 18 else "3x/week" if post_count >= 8 else "2x/week"

    insights = [
        f"Your strongest creator persona is {persona}.",
        f"Your current mood signal is {mood}.",
        f"Recommended posting cadence: {cadence} for better retention.",
        "Use voice shortcut 'Hey LSG' for hands-free navigation and publishing.",
    ]

    windows = ["7:30 PM - 9:30 PM", "12:00 PM - 1:30 PM", "8:00 AM - 9:00 AM"]
    ease_features = [
        "Voice-first navigation with Hey LSG commands",
        "AI caption and hashtag optimization",
        "One-tap smart actions from home feed",
        "Adaptive trend recommendations based on your mood",
    ]

    return {
        "persona": persona,
        "confidence": 0.71,
        "mood_signal": mood,
        "visual_style_signal": visual_style_signal or "casual outfit",
        "nlp_tags": tags,
        "insights": insights,
        "best_post_windows": windows,
        "quick_actions": DEFAULT_COACH_ACTIONS,
        "ease_features": ease_features,
    }


def _openai_enhance_creation(prompt: str, caption: str | None = None, vibe: str | None = None, platform: str | None = None) -> dict:
    if not OPENAI_API_KEY:
        return _fallback_creation_enhance(prompt, caption, vibe)

    system_prompt = (
        "You are a fashion creator assistant. Improve user content for social media. "
        "Return ONLY JSON with keys: improved_caption, hook_line, creative_tips, hashtags. "
        "Rules: improved_caption <= 220 chars, hook_line <= 80 chars, "
        "creative_tips = array of 3 concise strings, hashtags = array of 5 strings that start with #."
    )

    user_prompt = {
        "prompt": (prompt or "").strip(),
        "existing_caption": (caption or "").strip(),
        "vibe": (vibe or "").strip(),
        "platform": (platform or "social").strip(),
    }

    payload = {
        "model": OPENAI_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": json.dumps(user_prompt)},
        ],
        "temperature": 0.6,
    }

    req = urllib.request.Request(
        url="https://api.openai.com/v1/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {OPENAI_API_KEY}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=25) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            content = (
                data.get("choices", [{}])[0]
                .get("message", {})
                .get("content", "")
            )
            parsed = _extract_json_object(content)
            if not parsed:
                return _fallback_creation_enhance(prompt, caption, vibe)

            improved_caption = str(parsed.get("improved_caption") or "").strip()
            hook_line = str(parsed.get("hook_line") or "").strip()
            creative_tips = parsed.get("creative_tips") or []
            hashtags = parsed.get("hashtags") or []

            clean_tips = [str(x).strip() for x in creative_tips if str(x).strip()][:3]
            clean_tags = [str(x).strip() for x in hashtags if str(x).strip()]
            clean_tags = [tag if tag.startswith("#") else f"#{tag.lstrip('#')}" for tag in clean_tags][:5]

            if not improved_caption or not hook_line or not clean_tips or not clean_tags:
                return _fallback_creation_enhance(prompt, caption, vibe)

            return {
                "improved_caption": improved_caption[:220],
                "hook_line": hook_line[:80],
                "creative_tips": clean_tips,
                "hashtags": clean_tags,
            }
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        return _fallback_creation_enhance(prompt, caption, vibe)


def _fallback_help_reply(prompt: str) -> str:
    q = (prompt or "").strip().lower()
    if "start" in q or "begin" in q or "first" in q:
        return (
            "Start with Login or Sign Up, then open Create from Feed. "
            "Choose Image or Use Camera, then Create Reel or Publish Story."
        )
    if "camera" in q or "live" in q:
        return (
            "Use Camera is available in Upload and Profile. "
            "Capture a photo, review it, then upload/save."
        )
    if "upload" in q or "story" in q or "post" in q:
        return (
            "Go to Create, select or capture an image, add optional caption, "
            "then publish as Story or generate a reel."
        )
    if "ai" in q or "generate" in q or "outfit" in q:
        return (
            "Open Create, pick a photo, tap Create Reel, then Generate Look "
            "to get an outfit recommendation."
        )
    return (
        "I can help with Login, Feed, Upload, Camera, AI Generate, Stories, and Profile. "
        "Try asking: How do I upload from camera?"
    )


def _openai_assistant_reply(prompt: str, history: list[dict] | None = None) -> str:
    if not OPENAI_API_KEY:
        return _fallback_help_reply(prompt)

    system_prompt = (
        "You are LooksGood Assistant inside a fashion app. "
        "Give short, practical, step-by-step guidance for using app features. "
        "Focus on: login/signup, feed, upload, camera capture, AI generate, stories, profile editing."
    )

    messages = [{"role": "system", "content": system_prompt}]
    if history:
        for item in history[-6:]:
            role = item.get("role")
            content = item.get("text") or item.get("content")
            if role in {"user", "assistant"} and content:
                messages.append({"role": role, "content": str(content)})
    messages.append({"role": "user", "content": prompt})

    payload = {
        "model": OPENAI_MODEL,
        "messages": messages,
        "temperature": 0.3,
    }

    req = urllib.request.Request(
        url="https://api.openai.com/v1/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {OPENAI_API_KEY}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return (
                data.get("choices", [{}])[0]
                .get("message", {})
                .get("content", "")
                .strip()
            ) or _fallback_help_reply(prompt)
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        return _fallback_help_reply(prompt)


@router.post("/studio/generate", response_model=StudioGenerateResponse)
async def studio_generate(data: StudioGenerateRequest, request: Request):
    kind = str(data.kind or "content").strip().lower()
    if kind not in SUPPORTED_STUDIO_KINDS:
        raise HTTPException(status_code=400, detail="Unsupported generation kind")

    return _build_studio_generation(
        request=request,
        kind=kind,
        prompt=data.prompt,
        style=data.style,
        source_url=data.source_url,
    )


@router.post("/studio/generate-with-upload", response_model=StudioGenerateResponse)
async def studio_generate_with_upload(
    request: Request,
    prompt: str = Form(...),
    kind: str = Form("content"),
    style: str = Form(default=""),
    source_url: str = Form(default=""),
    file: UploadFile | None = File(default=None),
):
    clean_kind = str(kind or "content").strip().lower()
    if clean_kind not in SUPPORTED_STUDIO_KINDS:
        raise HTTPException(status_code=400, detail="Unsupported generation kind")

    uploaded_path: Path | None = None
    uploaded_type: str | None = None
    if file is not None:
        payload = await file.read()
        if not payload:
            raise HTTPException(status_code=400, detail="Uploaded file is empty")
        uploaded_path = _save_uploaded_asset(payload, file.filename, file.content_type)
        uploaded_type = file.content_type

    return _build_studio_generation(
        request=request,
        kind=clean_kind,
        prompt=prompt,
        style=style,
        source_url=source_url or None,
        uploaded_path=uploaded_path,
        uploaded_content_type=uploaded_type,
    )



def _ensure_products_owned(db: Session, user_id: int, product_ids: list[int]) -> None:
    if not product_ids:
        return
    products = (
        db.query(Product)
        .filter(Product.id.in_(product_ids), Product.creator_user_id == user_id)
        .all()
    )
    if len(products) != len(set(product_ids)):
        raise HTTPException(status_code=400, detail="One or more product IDs are invalid")

@router.post("/studio/publish")
def studio_publish(
    data: StudioPublishRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    media_url = str(data.media_url or "").strip()
    if not media_url.lower().startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="media_url must be a valid URL")

    post = Post(
        user_id=current_user.id,
        media_url=media_url,
        caption=str(data.caption or "").strip()[:500],
    )
    db.add(post)
    db.flush()
    product_ids_list = parse_product_ids(data.product_ids)
    if product_ids_list:
        _ensure_products_owned(db, current_user.id, product_ids_list)
        apply_post_product_tags(db, post.id, product_ids_list)
    db.commit()
    db.refresh(post)
    return {"status": "published", "post_id": post.id, "media_url": media_url}


@router.post("/assistant", response_model=AssistantResponse)
async def assistant_help(data: AssistantRequest):
    reply = _openai_assistant_reply(data.prompt, data.history)
    provider = "openai" if OPENAI_API_KEY else "fallback"
    return {"reply": reply, "provider": provider}


@router.post("/enhance-creation", response_model=EnhanceCreationResponse)
async def enhance_creation(data: EnhanceCreationRequest):
    result = _openai_enhance_creation(
        prompt=data.prompt,
        caption=data.caption,
        vibe=data.vibe,
        platform=data.platform,
    )
    provider = "openai" if OPENAI_API_KEY else "fallback"
    return {**result, "provider": provider}


@router.post("/mood-reels", response_model=MoodReelsResponse)
async def mood_reels(data: MoodReelsRequest):
    mood_text = str(data.mood_text or "").strip()
    recent_captions = _clean_string_list(data.recent_captions, max_items=8)
    combined_text = " | ".join([mood_text] + recent_captions).strip(" |")

    detected_mood, confidence = _detect_mood_fallback(combined_text)
    fallback_plan = _build_mood_reel_plan_fallback(
        detected_mood=detected_mood,
        confidence=confidence,
        want_to_create=bool(data.want_to_create),
    )
    provider = "fallback"
    plan = fallback_plan

    openai_plan = _openai_mood_reel_plan(
        mood_text=combined_text,
        recent_captions=recent_captions,
        want_to_create=bool(data.want_to_create),
        fallback=fallback_plan,
    )
    if openai_plan:
        plan = openai_plan
        provider = "openai"

    return {**plan, "provider": provider}


@router.get("/smart-coach", response_model=SmartCoachResponse)
def smart_coach(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    posts = (
        db.query(Post)
        .filter(Post.user_id == current_user.id)
        .order_by(Post.created_at.desc())
        .limit(24)
        .all()
    )
    captions = [str(post.caption or "").strip() for post in posts if str(post.caption or "").strip()]
    username = str(current_user.email or "creator").split("@")[0]

    visual_style_signal = "casual outfit"
    avatar_url = str(getattr(current_user.profile, "avatar_url", "") or "").strip() if getattr(current_user, "profile", None) else ""
    local_avatar = _download_image_for_style_probe(avatar_url) if avatar_url else None
    if local_avatar:
        try:
            visual_style_signal = str(classify_style(local_avatar) or visual_style_signal).strip() or visual_style_signal
        except Exception:
            pass
        finally:
            try:
                Path(local_avatar).unlink(missing_ok=True)
            except Exception:
                pass

    fallback = _build_smart_coach_fallback(
        username=username,
        captions=captions,
        post_count=len(posts),
        visual_style_signal=visual_style_signal,
    )

    openai_result = _openai_smart_coach(
        username=username,
        captions=captions,
        post_count=len(posts),
        visual_style_signal=visual_style_signal,
        fallback=fallback,
    )

    result = openai_result or fallback
    provider = "openai" if openai_result else "fallback"
    return {
        **result,
        "provider": provider,
    }


class LSGCommandRequest(BaseModel):
    text: str
    screen: str | None = None


def _safe_voice_text(value: str) -> str:
    return str(value or "").strip().replace("\n", " ")[:800]


def _extract_after_keyword(text: str, keyword_pattern: str) -> str:
    match = re.search(keyword_pattern, text, flags=re.IGNORECASE)
    if not match:
        return ""
    return str(match.group(1) or "").strip(" .,!?:;\"'")


def _fallback_lsg_parse(text: str, screen: str | None = None) -> dict:
    q = _safe_voice_text(text)
    lower = q.lower()
    current_screen = str(screen or "").strip() or "unknown"

    bio_text = _extract_after_keyword(
        q,
        r"(?:set|change|update)\s+(?:my\s+)?bio\s+(?:to|as)\s+(.+)$",
    )
    if bio_text:
        return {
            "intent": "update_bio",
            "confidence": 0.78,
            "action": {"type": "update_bio", "bio": bio_text[:500]},
            "reply": "Updating your bio now.",
        }

    follow_target = _extract_after_keyword(
        q,
        r"(?:follow|add friend|friend request(?: to)?|send friend request(?: to)?)\s+@?([a-zA-Z0-9_.@-]+)",
    )
    if follow_target:
        return {
            "intent": "follow_user",
            "confidence": 0.8,
            "action": {"type": "follow_user", "username": follow_target.lstrip("@")},
            "reply": f"Trying to follow {follow_target.lstrip('@')} now.",
        }

    message_match = re.search(
        r"(?:message|chat with|send message to)\s+@?([a-zA-Z0-9_.@-]+)(?:\s+(.+))?$",
        q,
        flags=re.IGNORECASE,
    )
    if message_match:
        message_target = str(message_match.group(1) or "").strip()
        message_text = str(message_match.group(2) or "").strip(" .,!?:;\"'")
        action = {"type": "send_message", "username": message_target.lstrip("@")}
        if message_text:
            action["message"] = message_text[:800]
        return {
            "intent": "send_message",
            "confidence": 0.72,
            "action": action,
            "reply": f"Opening chat with {message_target.lstrip('@')}.",
        }

    if "profile pic" in lower or "profile photo" in lower or "change photo" in lower:
        return {
            "intent": "open_profile_photo",
            "confidence": 0.74,
            "action": {"type": "open_profile_photo"},
            "reply": "Opening profile so you can change your picture.",
        }

    if "upload" in lower and "reel" in lower:
        return {
            "intent": "create_reel",
            "confidence": 0.74,
            "action": {"type": "create_reel"},
            "reply": "Opening upload so you can post a reel.",
        }

    if "upload" in lower or "new post" in lower or ("create" in lower and "post" in lower):
        return {
            "intent": "create_post",
            "confidence": 0.7,
            "action": {"type": "create_post"},
            "reply": "Opening upload so you can create a new post.",
        }

    settings_changes: dict[str, bool] = {}
    if "private account" in lower or "make my account private" in lower or "make account private" in lower:
        off = any(key in lower for key in ("turn off", "disable", "off", "public"))
        settings_changes["is_private_account"] = False if off else True
    if "activity status" in lower or "online status" in lower or "show activity" in lower:
        off = any(key in lower for key in ("turn off", "hide", "disable", "off"))
        settings_changes["show_activity_status"] = False if off else True
    if "message request" in lower or "message requests" in lower:
        off = any(key in lower for key in ("turn off", "disable", "off", "block"))
        settings_changes["allow_message_requests"] = False if off else True

    if settings_changes:
        return {
            "intent": "update_settings",
            "confidence": 0.72,
            "action": {"type": "update_settings", **settings_changes},
            "reply": "Updating your settings now.",
        }

    route_map = [
        ("reels", "Reels"),
        ("profile", "Profile"),
        ("discover", "Discover"),
        ("people", "Discover"),
        ("chat", "Chat"),
        ("message", "Chat"),
        ("settings", "Settings"),
        ("notification", "Notifications"),
        ("upload", "Upload"),
        ("feed", "Feed"),
        ("home", "Feed"),
        ("ai", "AIAgent"),
        ("assistant", "AIAgent"),
        ("trend", "Trends"),
        ("trends", "Trends"),
        ("agent", "AppAgent"),
        ("command", "AppAgent"),
    ]
    for key, route in route_map:
        if key in lower:
            return {
                "intent": "navigate",
                "confidence": 0.68,
                "action": {"type": "navigate", "route": route},
                "reply": f"Opening {route}.",
            }

    return {
        "intent": "unknown",
        "confidence": 0.35,
        "action": {"type": "unknown", "screen": current_screen},
        "reply": "I did not fully catch that. Try saying: open trends, follow @username, set my bio to ..., or message @username hello.",
    }


def _openai_lsg_parse(text: str, screen: str | None = None) -> dict | None:
    if not OPENAI_API_KEY:
        return None

    allowed_intents = {
        "navigate",
        "update_bio",
        "update_settings",
        "follow_user",
        "open_profile_photo",
        "create_post",
        "create_reel",
        "send_message",
        "unknown",
    }
    allowed_routes = [
        "Feed",
        "Reels",
        "Discover",
        "Profile",
        "Chat",
        "Settings",
        "Upload",
        "Notifications",
        "AIAgent",
        "Trends",
        "AppAgent",
    ]

    messages = [
        {
            "role": "system",
            "content": (
                "You are LSG voice assistant intent parser for a fashion social app. "
                "Return ONLY JSON with keys: intent, confidence, action, reply. "
                "Allowed intents: navigate, update_bio, update_settings, follow_user, open_profile_photo, create_post, create_reel, send_message, unknown. "
                "action must include a 'type' matching intent. "
                "For navigate use route names only from: Feed, Reels, Discover, Profile, Chat, Settings, Upload, Notifications, AIAgent, Trends, AppAgent. "
                "For follow_user/send_message include username; send_message may include message. "
                "For update_bio include bio. "
                "For update_settings include any of: is_private_account, show_activity_status, allow_message_requests."
            ),
        },
        {
            "role": "user",
            "content": json.dumps({"text": _safe_voice_text(text), "screen": str(screen or "").strip()}),
        },
    ]

    payload_candidates = [
        {
            "model": OPENAI_MODEL,
            "messages": messages,
            "temperature": 0.05,
            "response_format": {"type": "json_object"},
        },
        {
            "model": OPENAI_MODEL,
            "messages": messages,
            "temperature": 0.12,
        },
    ]

    for payload in payload_candidates:
        req = urllib.request.Request(
            url="https://api.openai.com/v1/chat/completions",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {OPENAI_API_KEY}",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=22) as resp:
                data = json.loads(resp.read().decode("utf-8"))
        except (
            urllib.error.HTTPError,
            urllib.error.URLError,
            TimeoutError,
            json.JSONDecodeError,
            ValueError,
        ):
            continue

        content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
        parsed = _extract_json_object(content)
        if not parsed:
            try:
                parsed = json.loads(str(content or "").strip())
            except (TypeError, ValueError, json.JSONDecodeError):
                parsed = None
        if not parsed:
            continue

        intent = str(parsed.get("intent") or "").strip().lower()
        action = parsed.get("action") if isinstance(parsed.get("action"), dict) else {}
        reply = str(parsed.get("reply") or "").strip()
        confidence_raw = parsed.get("confidence")
        try:
            confidence = float(confidence_raw)
        except (TypeError, ValueError):
            confidence = 0.5

        if intent not in allowed_intents:
            intent = "unknown"
        if "type" not in action or not str(action.get("type") or "").strip():
            action["type"] = intent

        action_type = str(action.get("type") or "").strip().lower()
        if action_type not in allowed_intents:
            action = {"type": "unknown"}
            intent = "unknown"
        elif action_type == "navigate":
            route = str(action.get("route") or "").strip()
            normalized_route = next((r for r in allowed_routes if r.lower() == route.lower()), "")
            if not normalized_route:
                action = {"type": "unknown"}
                intent = "unknown"
            else:
                action["route"] = normalized_route
                action["type"] = "navigate"

        return {
            "intent": intent,
            "confidence": max(0.0, min(1.0, confidence)),
            "action": action,
            "reply": reply or "Done.",
        }

    return None


def _build_openai_multipart_audio_body(
    audio_bytes: bytes,
    filename: str,
    content_type: str,
    model: str = "whisper-1",
) -> tuple[bytes, str]:
    boundary = f"----LSGBoundary{uuid.uuid4().hex}"
    chunks: list[bytes] = []

    def add_field(name: str, value: str):
        chunks.append(f"--{boundary}\r\n".encode("utf-8"))
        chunks.append(f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode("utf-8"))
        chunks.append(str(value).encode("utf-8"))
        chunks.append(b"\r\n")

    add_field("model", model)
    chunks.append(f"--{boundary}\r\n".encode("utf-8"))
    chunks.append(
        f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'.encode("utf-8")
    )
    chunks.append(f"Content-Type: {content_type}\r\n\r\n".encode("utf-8"))
    chunks.append(audio_bytes)
    chunks.append(b"\r\n")
    chunks.append(f"--{boundary}--\r\n".encode("utf-8"))

    return b"".join(chunks), boundary


def _openai_transcribe_audio(audio_bytes: bytes, filename: str, content_type: str) -> str | None:
    if not OPENAI_API_KEY or not audio_bytes:
        return None

    safe_filename = filename or f"lsg-{uuid.uuid4().hex}.m4a"
    safe_content_type = content_type or mimetypes.guess_type(safe_filename)[0] or "audio/m4a"

    body, boundary = _build_openai_multipart_audio_body(
        audio_bytes=audio_bytes,
        filename=safe_filename,
        content_type=safe_content_type,
        model="whisper-1",
    )
    req = urllib.request.Request(
        url="https://api.openai.com/v1/audio/transcriptions",
        data=body,
        headers={
            "Authorization": f"Bearer {OPENAI_API_KEY}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=40) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
            text = str(payload.get("text") or "").strip()
            return text or None
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, ValueError):
        return None


def _fallback_transcribe_audio(audio_bytes: bytes, filename: str, content_type: str) -> str | None:
    if not audio_bytes or sr is None or AudioSegment is None or imageio_ffmpeg is None:
        return None

    guessed_suffix = Path(filename or "").suffix.lower()
    if not guessed_suffix:
        guessed_ext = mimetypes.guess_extension(content_type or "") or ".m4a"
        guessed_suffix = guessed_ext if guessed_ext.startswith(".") else f".{guessed_ext}"
    if not guessed_suffix:
        guessed_suffix = ".m4a"

    temp_input_path = None
    temp_wav_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=guessed_suffix) as temp_in:
            temp_in.write(audio_bytes)
            temp_input_path = temp_in.name

        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as temp_out:
            temp_wav_path = temp_out.name

        AudioSegment.converter = imageio_ffmpeg.get_ffmpeg_exe()
        segment = AudioSegment.from_file(temp_input_path)
        segment = segment.set_channels(1).set_frame_rate(16000)
        segment.export(temp_wav_path, format="wav")

        recognizer = sr.Recognizer()
        with sr.AudioFile(temp_wav_path) as source:
            audio_data = recognizer.record(source)

        try:
            text = recognizer.recognize_google(audio_data)
            return str(text or "").strip() or None
        except sr.UnknownValueError:
            return None
        except sr.RequestError:
            return None
    except Exception:
        return None
    finally:
        for path in (temp_input_path, temp_wav_path):
            if path:
                try:
                    Path(path).unlink(missing_ok=True)
                except Exception:
                    pass


@router.post("/lsg/transcribe")
async def lsg_transcribe(
    audio: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    _ = current_user
    audio_bytes = await audio.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Audio file is empty")

    transcript = _openai_transcribe_audio(
        audio_bytes=audio_bytes,
        filename=str(audio.filename or ""),
        content_type=str(audio.content_type or ""),
    )
    provider = "openai"
    if not transcript:
        transcript = _fallback_transcribe_audio(
            audio_bytes=audio_bytes,
            filename=str(audio.filename or ""),
            content_type=str(audio.content_type or ""),
        )
        provider = "google_fallback" if transcript else provider
    if not transcript:
        raise HTTPException(
            status_code=503,
            detail="Voice transcription is unavailable right now. You can type the command as fallback.",
        )

    return {"transcript": transcript, "provider": provider}


@router.post("/lsg/command")
async def lsg_command(
    data: LSGCommandRequest,
    current_user: User = Depends(get_current_user),
):
    _ = current_user
    text = _safe_voice_text(data.text)
    if not text:
        raise HTTPException(status_code=400, detail="Voice command text is required")

    parsed = _openai_lsg_parse(text=text, screen=data.screen)
    provider = "openai" if parsed else "fallback"
    if not parsed:
        parsed = _fallback_lsg_parse(text=text, screen=data.screen)

    return {
        "transcript": text,
        "intent": parsed.get("intent", "unknown"),
        "confidence": float(parsed.get("confidence", 0.3)),
        "action": parsed.get("action") if isinstance(parsed.get("action"), dict) else {"type": "unknown"},
        "reply": str(parsed.get("reply") or "Done.").strip(),
        "provider": provider,
    }






