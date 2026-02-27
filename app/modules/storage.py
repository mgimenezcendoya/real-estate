"""
S3-compatible file storage: shared between Realia, NocoDB, and the RAG pipeline.
Supports Cloudflare R2, AWS S3, MinIO, etc.
"""

import hashlib
from datetime import datetime

import httpx

from app.config import get_settings


async def upload_file(
    file_bytes: bytes,
    project_slug: str,
    doc_type: str,
    filename: str,
) -> str:
    """Upload a file to S3 and return the full URL."""
    settings = get_settings()

    key = _build_key(project_slug, doc_type, filename)

    # TODO: Use aioboto3 or httpx with S3 signature for async upload
    # For now, this is a placeholder that returns the expected URL
    return f"{settings.s3_public_url}/{settings.s3_bucket_name}/{key}"


async def download_file(file_url: str) -> bytes:
    """Download a file from S3 by URL."""
    async with httpx.AsyncClient() as client:
        response = await client.get(file_url)
        response.raise_for_status()
        return response.content


async def generate_presigned_url(key: str, expires_in: int = 3600) -> str:
    """Generate a pre-signed URL for temporary access to a private file."""
    # TODO: Implement S3 pre-signed URL generation
    settings = get_settings()
    return f"{settings.s3_public_url}/{settings.s3_bucket_name}/{key}"


def _build_key(project_slug: str, doc_type: str, filename: str) -> str:
    """Build a structured S3 key: projects/{slug}/{doc_type}/{filename}"""
    safe_filename = filename.replace(" ", "_").lower()
    return f"projects/{project_slug}/{doc_type}/{safe_filename}"
