"""
RAG Retrieval: fetches project documents from S3/Supabase and prepares them
as native PDF attachments for Claude's document understanding.

No text extraction, no embeddings, no chunking — Claude reads the PDFs directly.
"""

import base64
import logging
from typing import Any

from app.database import get_pool
from app.modules.storage import download_file

logger = logging.getLogger(__name__)

_pdf_cache: dict[str, dict[str, str]] = {}


async def get_developer_document_blocks(developer_id: str) -> list[dict[str, Any]]:
    """
    Fetch all active PDF documents across a developer's projects,
    download them from S3, and return Claude API content blocks.
    """
    pool = await get_pool()

    docs = await pool.fetch(
        """SELECT d.id, d.doc_type, d.filename, d.file_url, d.unit_identifier,
                  p.name AS project_name, p.slug AS project_slug
           FROM documents d
           JOIN projects p ON p.id = d.project_id
           WHERE p.developer_id = $1 AND d.is_active = TRUE
           ORDER BY p.name, d.doc_type, d.unit_identifier""",
        developer_id,
    )

    if not docs:
        return []

    blocks: list[dict[str, Any]] = []

    for doc in docs:
        doc_id = str(doc["id"])

        try:
            if doc_id in _pdf_cache:
                data_b64 = _pdf_cache[doc_id]["data_b64"]
            else:
                pdf_bytes = await download_file(doc["file_url"])

                if not pdf_bytes or not pdf_bytes[:5] == b"%PDF-":
                    logger.warning(
                        "Skipping invalid PDF %s (%s): %d bytes, header=%r",
                        doc_id, doc["filename"], len(pdf_bytes), pdf_bytes[:20],
                    )
                    continue

                data_b64 = base64.standard_b64encode(pdf_bytes).decode("utf-8")
                _pdf_cache[doc_id] = {"data_b64": data_b64}

            unit_info = f" - Unidad {doc['unit_identifier']}" if doc["unit_identifier"] else ""
            title = f"{doc['project_name']} | {doc['doc_type']}{unit_info}: {doc['filename']}"

            blocks.append({
                "type": "document",
                "source": {
                    "type": "base64",
                    "media_type": "application/pdf",
                    "data": data_b64,
                },
                "title": title,
            })

        except Exception as e:
            logger.error("Failed to download document %s (%s): %s", doc_id, doc["filename"], e)
            continue

    if blocks:
        blocks[-1]["cache_control"] = {"type": "ephemeral"}

    return blocks


def invalidate_document_cache(document_id: str) -> None:
    """Remove a document from the in-memory cache (call after update/delete)."""
    _pdf_cache.pop(document_id, None)


def clear_document_cache() -> None:
    """Clear the entire document cache."""
    _pdf_cache.clear()
