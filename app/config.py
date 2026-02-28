from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    environment: str = "development"
    secret_key: str = ""

    # Database
    database_url: str = "postgresql://user:password@localhost:5432/realia"

    # Anthropic
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-haiku-4-5-20251001"

    # OpenAI (Whisper + embeddings)
    openai_api_key: str = ""

    # WhatsApp — provider selection
    whatsapp_provider: str = "twilio"  # "twilio" for dev, "meta" for production

    # WhatsApp Cloud API (Meta) — used when whatsapp_provider=meta
    whatsapp_token: str = ""
    whatsapp_phone_number_id: str = ""
    whatsapp_verify_token: str = ""

    # Twilio WhatsApp Sandbox — used when whatsapp_provider=twilio
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_whatsapp_number: str = ""  # e.g. +14155238886

    # Chatwoot (deprecated — kept for backward compat)
    chatwoot_base_url: str = ""
    chatwoot_api_token: str = ""
    chatwoot_account_id: str = ""

    # Telegram Handoff Bot
    telegram_bot_token: str = ""
    telegram_chat_id: str = ""

    # S3-compatible storage (Supabase Storage, Cloudflare R2, AWS S3)
    s3_endpoint_url: str = ""
    s3_access_key_id: str = ""
    s3_secret_access_key: str = ""
    s3_bucket_name: str = "realia-docs"
    s3_public_url: str = ""
    s3_region: str = ""

    # Dev: force a specific developer (useful when all projects share the Twilio sandbox number)
    active_developer_id: str = ""

    # Dev: phone number that acts as developer (leave empty to always route as lead)
    dev_phone: str = ""

    # NocoDB
    nocodb_base_url: str = ""
    nocodb_api_token: str = ""

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


_settings: Settings | None = None


def get_settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings


def reload_settings() -> Settings:
    """Force reload settings from .env (called on module reload by uvicorn --reload)."""
    global _settings
    _settings = None
    return get_settings()
