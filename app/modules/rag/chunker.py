"""
Document Chunker: splitting strategies per document type.
"""


def chunk_document(text: str, doc_type: str) -> list[dict]:
    """Chunk a document based on its type. Returns list of {content, metadata}."""
    if doc_type == "precios":
        return _chunk_price_list(text)
    elif doc_type == "plano":
        return _chunk_floor_plan(text)
    elif doc_type == "faq":
        return _chunk_faq(text)
    else:
        return _chunk_generic(text)


def _chunk_generic(text: str, chunk_size: int = 1000, overlap: int = 200) -> list[dict]:
    """Simple sliding window chunking for generic documents."""
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunk_text = text[start:end]
        if chunk_text.strip():
            chunks.append({"content": chunk_text, "metadata": {}})
        start += chunk_size - overlap
    return chunks


def _chunk_price_list(text: str) -> list[dict]:
    """Chunk price lists by unit/row. Each unit gets its own chunk."""
    # TODO: Parse price list structure (CSV-like or table)
    # Each row = one chunk with metadata: unit, floor, price
    return _chunk_generic(text, chunk_size=500, overlap=50)


def _chunk_floor_plan(text: str) -> list[dict]:
    """Chunk floor plans by section/unit."""
    # TODO: Parse floor plan sections and extract unit metadata
    return _chunk_generic(text)


def _chunk_faq(text: str) -> list[dict]:
    """Chunk FAQs by question-answer pairs."""
    # TODO: Split by Q&A pattern (e.g., lines starting with "P:" or "R:")
    return _chunk_generic(text, chunk_size=500, overlap=0)
