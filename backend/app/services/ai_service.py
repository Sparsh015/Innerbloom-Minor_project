"""Groq-backed wellness assistant with crisis guardrails.

The API key stays server-side. Messages are only sent to Groq to generate a
reply; they are never logged here.
"""
from __future__ import annotations

import httpx

from app.core.config import get_settings


class AIServiceError(RuntimeError):
    """The LLM provider is unconfigured or temporarily unavailable."""


CRISIS_KEYWORDS: tuple[str, ...] = (
    "suicide",
    "suicidal",
    "kill myself",
    "killing myself",
    "end my life",
    "take my own life",
    "self harm",
    "self-harm",
    "hurt myself",
    "cut myself",
    "want to die",
    "better off dead",
    "no reason to live",
    "end it all",
)

CRISIS_RESOURCES: list[str] = [
    "Tele-MANAS: 14416 (India, 24x7)",
    "KIRAN: 1800-599-0019 (India, 24x7)",
    "Emergency: 112",
]

MAX_REPLY_CHARS = 180

SYSTEM_PROMPT = """You are InnerBloom's wellness companion — a warm, emotionally attuned friend who texts naturally.

HARD LIMIT: Every reply MUST be 180 characters or fewer, including spaces and punctuation. Count before answering.

How to respond:
- ALWAYS acknowledge and validate the user's feeling first. Make them feel heard before anything else.
- Do NOT correct, coach, or jump to solutions unless the user explicitly asks for advice.
- Default to warm validation, then one gentle follow-up question. No suggestions by default.
- If they do ask for help, offer ONE small, indirect idea ("Maybe a slow breath could help?") instead of a direct instruction, and leave the choice to them.
- Sound human and casual, like a caring friend: "that sounds", "I get it", "no wonder". Avoid clinical or preachy words.
- Never lecture, moralize, or say "you should".
- No bullet points, lists, headings, or paragraphs.
- Do not repeat or restate the user's message.
- Skip emojis unless they replace words.

Examples:
User: "had a rough day" -> "That sounds really draining. I'm here—what happened?"
User: "i'm anxious" -> "Anxiety can feel so heavy. Want to talk about what's on your mind?"
User: "i feel lonely" -> "Loneliness really stings. I'm glad you told me—how long has it felt like this?"
User: "any exam tips?" -> "Exam pressure is a lot. Maybe short focus blocks could ease it? Want to try?"

Safety:
- Never diagnose, prescribe, or claim to be a therapist or doctor.
- For persistent or severe distress, gently suggest talking to someone trusted or a professional within 180 characters.
- If someone mentions self-harm, suicide, or immediate danger, urge them to contact emergency services or a trusted person right away (safety messages may exceed the character limit)."""


def _shorten_reply(text: str, limit: int = MAX_REPLY_CHARS) -> str:
    """Hard guarantee: trim to `limit` chars at a clean sentence/word boundary."""
    text = text.strip()
    if len(text) <= limit:
        return text

    window = text[:limit]
    for punct in (". ", "! ", "? "):
        cut = window.rfind(punct)
        if cut >= limit // 2:
            return window[: cut + 1].strip()

    cut = window.rfind(" ")
    if cut > 0:
        return window[:cut].rstrip(" ,;:-") + "…"
    return window.rstrip() + "…"


def detect_crisis(text: str) -> bool:
    lowered = text.lower()
    return any(keyword in lowered for keyword in CRISIS_KEYWORDS)


def crisis_reply() -> str:
    return (
        "I'm really sorry you're feeling this way. You deserve support right now. "
        "Please reach out to someone you trust, or contact one of these free, "
        "confidential helplines: " + " | ".join(CRISIS_RESOURCES) + ". "
        "If you are in immediate danger, call 112 now. I'm here for you, but I am "
        "not a substitute for professional care."
    )


async def _call_groq(history: list[dict[str, str]], message: str) -> str:
    settings = get_settings()
    if not settings.ai_configured:
        raise AIServiceError(
            "The wellness assistant is not configured yet. Add GROQ_API_KEY to the backend."
        )

    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    messages.extend(history[-settings.AI_CONTEXT_MESSAGES:])
    messages.append({"role": "user", "content": message})

    payload = {
        "model": settings.GROQ_MODEL,
        "messages": messages,
        "max_tokens": settings.AI_MAX_TOKENS,
        "temperature": settings.AI_TEMPERATURE,
    }
    if "gpt-oss" in settings.GROQ_MODEL:
        payload["reasoning_effort"] = "low"

    try:
        async with httpx.AsyncClient(timeout=settings.AI_TIMEOUT_SECONDS) as client:
            response = await client.post(
                settings.GROQ_API_URL,
                headers={"Authorization": f"Bearer {settings.GROQ_API_KEY}"},
                json=payload,
            )
        response.raise_for_status()
        data = response.json()
        content = data["choices"][0]["message"]["content"]
        if not isinstance(content, str) or not content.strip():
            raise AIServiceError("The wellness assistant returned an empty response.")
        return _shorten_reply(content)
    except AIServiceError:
        raise
    except (httpx.HTTPError, KeyError, IndexError, TypeError, ValueError) as exc:
        raise AIServiceError(
            "The wellness assistant is temporarily unavailable. Please try again."
        ) from exc


async def generate_reply(history: list[dict[str, str]], message: str) -> str:
    return await _call_groq(history, message)
