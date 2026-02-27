"""
RAG Retrieval: vector similarity search over document chunks,
filtered by project_id.
"""

from app.database import get_pool
from app.modules.rag.ingestion import generate_embedding


async def search_documents(
    project_id: str,
    query: str,
    top_k: int = 5,
    doc_type: str | None = None,
) -> list[dict]:
    """Search for relevant document chunks using vector similarity."""
    pool = await get_pool()

    query_embedding = await generate_embedding(query)

    type_filter = "AND d.doc_type = $4" if doc_type else ""
    params = [project_id, query_embedding, top_k]
    if doc_type:
        params.append(doc_type)

    rows = await pool.fetch(
        f"""
        SELECT
            dc.content,
            dc.metadata,
            d.doc_type,
            d.filename,
            dc.embedding <=> $2::vector AS distance
        FROM document_chunks dc
        JOIN documents d ON dc.document_id = d.id
        WHERE dc.project_id = $1
          AND d.is_active = TRUE
          {type_filter}
        ORDER BY dc.embedding <=> $2::vector
        LIMIT $3
        """,
        *params,
    )

    return [
        {
            "content": row["content"],
            "metadata": row["metadata"],
            "doc_type": row["doc_type"],
            "filename": row["filename"],
            "distance": row["distance"],
        }
        for row in rows
    ]


def format_context_for_prompt(chunks: list[dict]) -> str:
    """Format retrieved chunks into a context string for Claude."""
    if not chunks:
        return "No se encontro informacion relevante en los documentos del proyecto."

    parts = []
    for i, chunk in enumerate(chunks, 1):
        source = f"[{chunk['doc_type']} - {chunk['filename']}]"
        parts.append(f"Fuente {i} {source}:\n{chunk['content']}")

    return "\n\n---\n\n".join(parts)
