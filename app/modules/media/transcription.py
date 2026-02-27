"""
Audio Transcription: uses OpenAI Whisper API to transcribe audio messages.
"""

import httpx

from app.config import get_settings


async def transcribe_audio(audio_bytes: bytes, language: str = "es") -> str:
    """Transcribe audio using OpenAI Whisper API."""
    settings = get_settings()

    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://api.openai.com/v1/audio/transcriptions",
            headers={"Authorization": f"Bearer {settings.openai_api_key}"},
            files={"file": ("audio.ogg", audio_bytes, "audio/ogg")},
            data={"model": "whisper-1", "language": language},
        )
        result = response.json()
        return result.get("text", "")
