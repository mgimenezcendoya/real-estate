"""
RAG Ingestion: processes documents (PDF), chunks them, generates embeddings,
and stores them in pgvector. Files are stored in S3 and referenced by URL.
"""

from app.database import get_pool
from app.modules.rag.chunker import chunk_document
from app.modules.storage import upload_file


async def ingest_document(
    project_id: str,
    project_slug: str,
    doc_type: str,
    filename: str,
    content: bytes,
    unit_identifier: str | None = None,
    floor: int | None = None,
    source: str = "whatsapp",
    uploaded_by: str | None = None,
) -> dict:
    """Full ingestion: upload to S3, version, extract, chunk, embed."""
    pool = await get_pool()

    # Upload to S3
    file_url = await upload_file(content, project_slug, doc_type, filename)

    # Deactivate previous version (same doc_type + unit if applicable)
    if unit_identifier:
        await pool.execute(
            "UPDATE documents SET is_active = FALSE WHERE project_id = $1 AND doc_type = $2 AND unit_identifier = $3 AND is_active = TRUE",
            project_id, doc_type, unit_identifier,
        )
    else:
        await pool.execute(
            "UPDATE documents SET is_active = FALSE WHERE project_id = $1 AND doc_type = $2 AND unit_identifier IS NULL AND is_active = TRUE",
            project_id, doc_type,
        )

    # Create document record
    doc = await pool.fetchrow(
        """
        INSERT INTO documents (project_id, doc_type, filename, file_url, file_size_bytes, unit_identifier, floor, source, uploaded_by, rag_status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'processing')
        RETURNING id, version
        """,
        project_id, doc_type, filename, file_url, len(content),
        unit_identifier, floor, source, uploaded_by,
    )
    document_id = str(doc["id"])

    try:
        text = await extract_text_from_pdf(content)
        chunks = chunk_document(text, doc_type)

        for chunk in chunks:
            chunk_meta = chunk.get("metadata", {})
            if unit_identifier:
                chunk_meta["unit"] = unit_identifier
            if floor:
                chunk_meta["floor"] = floor

            embedding = await generate_embedding(chunk["content"])
            await pool.execute(
                "INSERT INTO document_chunks (document_id, project_id, content, embedding, metadata) VALUES ($1, $2, $3, $4, $5)",
                document_id, project_id, chunk["content"], embedding, chunk_meta,
            )

        await pool.execute("UPDATE documents SET rag_status = 'ready' WHERE id = $1", document_id)
        return {"document_id": document_id, "chunks_created": len(chunks), "file_url": file_url}

    except Exception:
        await pool.execute("UPDATE documents SET rag_status = 'error' WHERE id = $1", document_id)
        raise


async def find_document_for_sharing(
    project_id: str,
    doc_type: str,
    unit_identifier: str | None = None,
) -> dict | None:
    """Find an active document for sending to a lead via WhatsApp."""
    pool = await get_pool()
    if unit_identifier:
        row = await pool.fetchrow(
            "SELECT * FROM documents WHERE project_id = $1 AND doc_type = $2 AND unit_identifier = $3 AND is_active = TRUE ORDER BY version DESC LIMIT 1",
            project_id, doc_type, unit_identifier,
        )
    else:
        row = await pool.fetchrow(
            "SELECT * FROM documents WHERE project_id = $1 AND doc_type = $2 AND is_active = TRUE ORDER BY version DESC LIMIT 1",
            project_id, doc_type,
        )
    return dict(row) if row else None


async def list_available_documents(project_id: str, doc_type: str | None = None) -> list[dict]:
    """List all active documents for a project, optionally filtered by type."""
    pool = await get_pool()
    if doc_type:
        rows = await pool.fetch(
            "SELECT doc_type, filename, unit_identifier, floor, file_url FROM documents WHERE project_id = $1 AND doc_type = $2 AND is_active = TRUE ORDER BY doc_type, unit_identifier",
            project_id, doc_type,
        )
    else:
        rows = await pool.fetch(
            "SELECT doc_type, filename, unit_identifier, floor, file_url FROM documents WHERE project_id = $1 AND is_active = TRUE ORDER BY doc_type, unit_identifier",
            project_id,
        )
    return [dict(r) for r in rows]


async def extract_text_from_pdf(content: bytes) -> str:
    """Extract text from a PDF file."""
    # TODO: Implement PDF text extraction (pypdf, pdfplumber, or similar)
    return ""


async def generate_embedding(text: str) -> list[float]:
    """Generate an embedding vector using OpenAI text-embedding-3-small."""
    # TODO: Call OpenAI embeddings API
    return [0.0] * 1536
