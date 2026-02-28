"""
S3-compatible file storage: shared between Realia, NocoDB, and the RAG pipeline.
Supports Supabase Storage, Cloudflare R2, AWS S3, MinIO, etc.
"""

import logging

import boto3
from botocore.config import Config
import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)

_s3_client = None


def _get_s3_client():
    global _s3_client
    if _s3_client is None:
        settings = get_settings()
        _s3_client = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint_url,
            aws_access_key_id=settings.s3_access_key_id,
            aws_secret_access_key=settings.s3_secret_access_key,
            region_name=settings.s3_region or "us-east-1",
            config=Config(signature_version="s3v4"),
        )
    return _s3_client


async def upload_file(
    file_bytes: bytes,
    project_slug: str,
    doc_type: str,
    filename: str,
) -> str:
    """Upload a file to S3 and return the public URL."""
    if filename.lower().endswith(".pdf") and not file_bytes[:5] == b"%PDF-":
        raise ValueError(
            f"El archivo '{filename}' no es un PDF válido "
            f"({len(file_bytes)} bytes, header={file_bytes[:20]!r})"
        )

    settings = get_settings()
    key = _build_key(project_slug, doc_type, filename)

    content_type = "application/pdf" if filename.lower().endswith(".pdf") else "application/octet-stream"

    client = _get_s3_client()
    client.put_object(
        Bucket=settings.s3_bucket_name,
        Key=key,
        Body=file_bytes,
        ContentType=content_type,
    )

    public_url = f"{settings.s3_public_url}/{key}"
    logger.info("Uploaded %s (%d bytes) to %s", filename, len(file_bytes), public_url)
    return public_url


def get_presigned_url(key: str, expires_in: int = 3600) -> str:
    """Generate a pre-signed URL for temporary access (works for private buckets)."""
    settings = get_settings()
    client = _get_s3_client()
    url = client.generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.s3_bucket_name, "Key": key},
        ExpiresIn=expires_in,
    )
    return url


def get_url_for_file(file_url: str) -> str:
    """Get a working URL for a file. Tries public URL first, falls back to presigned."""
    settings = get_settings()
    if not settings.s3_public_url:
        key = file_url.rsplit("/", 1)[-1] if "/" in file_url else file_url
        return get_presigned_url(key)
    return file_url


async def download_file(file_url: str) -> bytes:
    """Download a file by URL."""
    async with httpx.AsyncClient() as client:
        response = await client.get(file_url)
        response.raise_for_status()
        return response.content


def _build_key(project_slug: str, doc_type: str, filename: str) -> str:
    """Build a structured S3 key: projects/{slug}/{filename}"""
    safe_filename = filename.replace(" ", "_").lower()
    return f"projects/{project_slug}/{safe_filename}"


def get_presigned_url_for_document(file_url: str) -> str:
    """Given a stored file_url, extract the key and generate a presigned URL."""
    settings = get_settings()
    prefix = f"{settings.s3_public_url}/"
    if file_url.startswith(prefix):
        key = file_url[len(prefix):]
    else:
        key = file_url
    return get_presigned_url(key)
