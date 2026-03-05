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
    org_id: str | None = None,
) -> str:
    """Upload a file to S3 and return the public URL."""
    if filename.lower().endswith(".pdf") and not file_bytes[:5] == b"%PDF-":
        raise ValueError(
            f"El archivo '{filename}' no es un PDF válido "
            f"({len(file_bytes)} bytes, header={file_bytes[:20]!r})"
        )

    settings = get_settings()
    key = _build_key(project_slug, doc_type, filename, org_id=org_id)

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


def _build_key(project_slug: str, doc_type: str, filename: str, org_id: str | None = None) -> str:
    """Build a structured S3 key.

    With org_id:    orgs/{org_id}/projects/{slug}/{filename}
    Without org_id: projects/{slug}/{filename}  (legacy fallback)
    """
    safe_filename = filename.replace(" ", "_").lower()
    if org_id:
        return f"orgs/{org_id}/projects/{project_slug}/{safe_filename}"
    return f"projects/{project_slug}/{safe_filename}"


async def upload_obra_foto(
    file_bytes: bytes,
    project_slug: str,
    filename: str,
    scope: str = "general",
    identifier: str | None = None,
    org_id: str | None = None,
) -> str:
    """Upload an obra photo with structured path based on scope.

    With org_id:
      general → orgs/{org_id}/projects/{slug}/obra/general/{filename}
      unit    → orgs/{org_id}/projects/{slug}/obra/unidades/{identifier}/{filename}
      floor   → orgs/{org_id}/projects/{slug}/obra/pisos/p{identifier}/{filename}
    Without org_id (legacy fallback): projects/{slug}/obra/...
    """
    settings = get_settings()
    safe_filename = filename.replace(" ", "_").lower()
    prefix = f"orgs/{org_id}/projects/{project_slug}" if org_id else f"projects/{project_slug}"

    if scope == "unit" and identifier:
        key = f"{prefix}/obra/unidades/{identifier}/{safe_filename}"
    elif scope == "floor" and identifier:
        key = f"{prefix}/obra/pisos/p{identifier}/{safe_filename}"
    else:
        key = f"{prefix}/obra/general/{safe_filename}"

    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    content_type = {
        "jpg": "image/jpeg", "jpeg": "image/jpeg",
        "png": "image/png", "webp": "image/webp",
        "heic": "image/heic", "heif": "image/heic",
    }.get(ext, "application/octet-stream")

    client = _get_s3_client()
    client.put_object(
        Bucket=settings.s3_bucket_name,
        Key=key,
        Body=file_bytes,
        ContentType=content_type,
    )

    public_url = f"{settings.s3_public_url}/{key}"
    logger.info("Uploaded obra foto %s (%d bytes) to %s", filename, len(file_bytes), public_url)
    return public_url


def get_presigned_url_for_document(file_url: str) -> str:
    """Given a stored file_url, extract the key and generate a presigned URL."""
    settings = get_settings()
    prefix = f"{settings.s3_public_url}/"
    if file_url.startswith(prefix):
        key = file_url[len(prefix):]
    else:
        key = file_url
    return get_presigned_url(key)


async def upload_factura_pdf(
    file_bytes: bytes,
    org_id: str,
    project_slug: str,
    filename: str,
) -> str:
    """Upload a factura PDF with org-hierarchical path.

    Path: orgs/{org_id}/projects/{project_slug}/facturas/{YYYY}/{MM}/{ts}_{filename}
    """
    import time
    from datetime import datetime as _dt

    if not file_bytes[:5] == b"%PDF-":
        raise ValueError(f"El archivo '{filename}' no es un PDF válido")

    settings = get_settings()
    safe_filename = filename.replace(" ", "_").lower()
    now = _dt.utcnow()
    ts = int(time.time())
    key = (
        f"orgs/{org_id}/projects/{project_slug}/facturas/"
        f"{now.year}/{now.month:02d}/{ts}_{safe_filename}"
    )

    client = _get_s3_client()
    client.put_object(
        Bucket=settings.s3_bucket_name,
        Key=key,
        Body=file_bytes,
        ContentType="application/pdf",
    )

    public_url = f"{settings.s3_public_url}/{key}"
    logger.info("Uploaded factura PDF %s (%d bytes) to %s", filename, len(file_bytes), public_url)
    return public_url
