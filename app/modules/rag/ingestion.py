"""
RAG Ingestion: uploads documents to S3 and registers them in the database.
PDF content is read natively by Claude at query time — no text extraction needed.
"""

from app.database import get_pool
from app.modules.storage import upload_file
from app.modules.rag.retrieval import invalidate_document_cache


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
    """Upload document to S3 and register in DB with version control."""
    pool = await get_pool()

    file_url = await upload_file(content, project_slug, doc_type, filename)

    # Deactivate previous version and invalidate its cache
    if unit_identifier:
        old_docs = await pool.fetch(
            "SELECT id FROM documents WHERE project_id = $1 AND doc_type = $2 AND unit_identifier = $3 AND is_active = TRUE",
            project_id, doc_type, unit_identifier,
        )
        await pool.execute(
            "UPDATE documents SET is_active = FALSE WHERE project_id = $1 AND doc_type = $2 AND unit_identifier = $3 AND is_active = TRUE",
            project_id, doc_type, unit_identifier,
        )
    else:
        old_docs = await pool.fetch(
            "SELECT id FROM documents WHERE project_id = $1 AND doc_type = $2 AND unit_identifier IS NULL AND is_active = TRUE",
            project_id, doc_type,
        )
        await pool.execute(
            "UPDATE documents SET is_active = FALSE WHERE project_id = $1 AND doc_type = $2 AND unit_identifier IS NULL AND is_active = TRUE",
            project_id, doc_type,
        )

    for old in old_docs:
        invalidate_document_cache(str(old["id"]))

    doc = await pool.fetchrow(
        """
        INSERT INTO documents (project_id, doc_type, filename, file_url, file_size_bytes, unit_identifier, floor, source, uploaded_by, rag_status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'ready')
        RETURNING id, version
        """,
        project_id, doc_type, filename, file_url, len(content),
        unit_identifier, floor, source, uploaded_by,
    )

    return {"document_id": str(doc["id"]), "file_url": file_url}


async def find_document_for_sharing(
    developer_id: str,
    doc_type: str,
    unit_identifier: str | None = None,
    project_slug: str | None = None,
) -> dict | None:
    """Find an active document across all developer projects for sharing via WhatsApp."""
    pool = await get_pool()

    base = """
        SELECT d.* FROM documents d
        JOIN projects p ON p.id = d.project_id
        WHERE p.developer_id = $1 AND d.doc_type = $2 AND d.is_active = TRUE
    """
    params: list = [developer_id, doc_type]

    if unit_identifier:
        base += " AND d.unit_identifier = $3"
        params.append(unit_identifier)

    if project_slug:
        idx = len(params) + 1
        base += f" AND LOWER(REPLACE(p.name, ' ', '-')) = ${idx}"
        params.append(project_slug.lower())

    base += " ORDER BY d.version DESC LIMIT 1"
    row = await pool.fetchrow(base, *params)
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
