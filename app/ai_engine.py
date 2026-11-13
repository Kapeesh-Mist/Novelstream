import asyncio
import logging
from typing import List, Dict, Any, Optional
import httpx
from app.config import settings

logger = logging.getLogger(__name__)

# Global Pinecone index instance cache
_pinecone_index = None


def init_pinecone():
    """
    Initializes Pinecone client and ensures the index exists.
    Index dimensions: 384, metric: cosine.
    Returns index instance or None if no API key is provided.
    """
    global _pinecone_index
    if not settings.PINECONE_API_KEY:
        logger.info("PINECONE_API_KEY is not set. Pinecone vector operations will operate in mock mode.")
        return None

    if _pinecone_index is not None:
        return _pinecone_index

    try:
        from pinecone import Pinecone, ServerlessSpec
        pc = Pinecone(api_key=settings.PINECONE_API_KEY)
        index_name = settings.PINECONE_INDEX_NAME

        existing_indexes = [idx.name for idx in pc.list_indexes()]
        if index_name not in existing_indexes:
            logger.info(f"Creating Pinecone index '{index_name}' with dimension 384...")
            pc.create_index(
                name=index_name,
                dimension=384,
                metric="cosine",
                spec=ServerlessSpec(
                    cloud="aws",
                    region="us-east-1"
                )
            )
        _pinecone_index = pc.Index(index_name)
        return _pinecone_index
    except Exception as e:
        logger.warning(f"Failed to initialize Pinecone: {e}. Falling back to in-memory/mock mode.")
        return None


async def get_embedding(text: str) -> List[float]:
    """
    POST to HuggingFace Inference API (sentence-transformers/all-MiniLM-L6-v2).
    Returns list of 384 floats. If no key, returns [0.0]*384. Includes 503 retry logic.
    """
    if not settings.HUGGINGFACE_API_KEY or not text.strip():
        return [0.0] * 384

    url = "https://api-inference.huggingface.co/models/sentence-transformers/all-MiniLM-L6-v2"
    #url = "https://api-inference.huggingface.co/pipeline/feature-extraction/sentence-transformers/all-MiniLM-L6-v2"
    headers = {
        "Authorization": f"Bearer {settings.HUGGINGFACE_API_KEY}",
        "Content-Type": "application/json"
    }
    payload = {"inputs": text, "options": {"wait_for_model": True}}

    for attempt in range(3):
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                res = await client.post(url, headers=headers, json=payload)
                if res.status_code == 200:
                    data = res.json()
                    # Handle single sentence vs list response
                    if isinstance(data, list):
                        if len(data) > 0 and isinstance(data[0], list):
                            return data[0]
                        return data
                    return [0.0] * 384
                elif res.status_code == 503:
                    logger.warning(f"HuggingFace model loading (503), retrying attempt {attempt + 1}/3...")
                    await asyncio.sleep(2.0 * (attempt + 1))
                    continue
                else:
                    logger.warning(f"HuggingFace embedding error: {res.status_code} - {res.text}")
                    break
        except Exception as err:
            logger.warning(f"HuggingFace request failed: {err}")
            await asyncio.sleep(1.0)

    return [0.0] * 384


async def index_book(book_id: str, book_title: str, chapters: List[Dict[str, Any]]) -> int:
    """
    Splits chapter text into ~500 character chunks, calculates embeddings,
    and upserts into Pinecone with metadata.
    """
    index = init_pinecone()
    total_chunks = 0
    records = []

    for chapter_idx, chapter in enumerate(chapters):
        ch_title = chapter.get("title", f"Chapter {chapter_idx + 1}")
        text = chapter.get("text", "")
        if not text:
            continue

        # Split into ~500 character chunks with small overlap
        chunk_size = 500
        overlap = 50
        start = 0
        chunk_num = 0

        while start < len(text):
            end = min(start + chunk_size, len(text))
            # Adjust to word boundary if not end of text
            if end < len(text):
                last_space = text.rfind(" ", start, end)
                if last_space > start:
                    end = last_space

            chunk_text = text[start:end].strip()
            if chunk_text:
                chunk_id = f"{book_id}_ch{chapter_idx}_ck{chunk_num}"
                embedding = await get_embedding(chunk_text)
                
                metadata = {
                    "book_id": book_id,
                    "book_title": book_title,
                    "chapter_title": ch_title,
                    "text": chunk_text
                }
                records.append({
                    "id": chunk_id,
                    "values": embedding,
                    "metadata": metadata
                })
                total_chunks += 1
                chunk_num += 1

            start = end + 1 if end < len(text) else len(text)

    if index and records:
        try:
            # Batch upsert in chunks of 50
            for i in range(0, len(records), 50):
                batch = records[i:i + 50]
                index.upsert(vectors=batch)
        except Exception as e:
            logger.warning(f"Failed upserting vectors to Pinecone: {e}")

    return total_chunks


async def search_relevant_chunks(query: str, book_id: str, top_k: int = 3) -> List[Dict[str, Any]]:
    """
    Embed query and search Pinecone with {book_id: book_id} filter.
    Returns list of matched chunks with metadata.
    """
    if not query.strip():
        return []

    index = init_pinecone()
    if not index or not settings.PINECONE_API_KEY:
        # Fallback empty or mock chunk
        return []

    try:
        query_vec = await get_embedding(query)
        result = index.query(
            vector=query_vec,
            top_k=top_k,
            filter={"book_id": book_id} if book_id else None,
            include_metadata=True
        )
        matches = []
        for match in result.get("matches", []):
            meta = match.get("metadata", {})
            matches.append({
                "text": meta.get("text", ""),
                "chapter_title": meta.get("chapter_title", ""),
                "score": float(match.get("score", 0.0))
            })
        return matches
    except Exception as e:
        logger.warning(f"Error querying Pinecone: {e}")
        return []


async def call_llm(prompt: str, max_tokens: int = 500) -> str:
    """
    POST to OpenRouter (meta-llama/llama-3.1-8b-instruct:free).
    Fallback to mock string if no key or error.
    """
    if not settings.OPENROUTER_API_KEY:
        return (
            "This is a demonstration response from NovelStream AI. "
            "To enable live AI inference with Llama 3.1, configure your free OPENROUTER_API_KEY in the environment."
        )

    url = "https://openrouter.ai/api/v1/chat/completions"
    
    headers = {
        "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://novelstream.onrender.com",
        "X-Title": "NovelStream AI"
    }
    payload = {
        "model": "mistralai/mistral-7b-instruct:free",
        "messages": [
            {"role": "system", "content": "You are NovelStream AI, a friendly, insightful, and precise literary assistant helping readers analyze and understand books."},
            {"role": "user", "content": prompt}
        ],
        "max_tokens": max_tokens,
        "temperature": 0.4
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            res = await client.post(url, headers=headers, json=payload)
            if res.status_code == 200:
                data = res.json()
                return data["choices"][0]["message"]["content"].strip()
            else:
                logger.warning(f"OpenRouter returned status {res.status_code}: {res.text}")
                return f"[NovelStream AI Fallback] Unable to complete request with OpenRouter (Status {res.status_code})."
    except Exception as e:
        logger.warning(f"OpenRouter connection failed: {e}")
        return f"[NovelStream AI Fallback] Error contacting OpenRouter: {str(e)}"


async def chat(query: str, chapter_text: str = "", chapter_title: str = "", book_title: str = "", book_id: str = "") -> Dict[str, Any]:
    """
    Searches chunks across the whole book, synthesizes with immediate chapter context,
    and returns an answer along with reference source chunks.
    """
    sources = []
    if book_id:
        sources = await search_relevant_chunks(query, book_id=book_id, top_k=3)

    # Format relevant chunk excerpts
    retrieved_text = "\n\n".join([
        f"[Relevant Section - {s.get('chapter_title', 'Book Passage')}]: {s.get('text', '')}"
        for s in sources if s.get("text")
    ])

    # Crop current chapter context to prevent context window overflow
    trimmed_chapter = chapter_text[:2500] if chapter_text else ""

    prompt = f"""You are assisting a reader with the book "{book_title or 'Current Book'}".
Current Chapter: "{chapter_title or 'Unknown'}"

Current Chapter Excerpt:
{trimmed_chapter or 'No immediate chapter excerpt provided.'}

Retrieved Cross-Chapter Passages (from RAG search across the entire book):
{retrieved_text or 'No cross-chapter passages matched.'}

Reader Query:
{query}

Please provide a clear, accurate, and insightful response answering the reader's question. Reference relevant details from the excerpts if applicable."""

    answer = await call_llm(prompt, max_tokens=600)
    return {
        "answer": answer,
        "sources": sources
    }


async def synthesize(highlights: List[str], book_title: str = "") -> Dict[str, Any]:
    """
    LLM prompt to synthesize reader highlights and notes into a coherent summary and 3 key takeaways.
    """
    if not highlights:
        return {
            "summary": "No highlights provided to synthesize.",
            "takeaways": []
        }

    formatted_highlights = "\n".join([f"- {h}" for h in highlights])
    prompt = f"""The reader has recorded the following highlights and notes from the book "{book_title or 'their reading'}":

{formatted_highlights}

Synthesize these highlights into:
1. A concise overview summary (1-2 paragraphs).
2. Exactly 3 key takeaways or themes.

Format your response exactly as:
SUMMARY: <overview text>
TAKEAWAYS:
1. <takeaway 1>
2. <takeaway 2>
3. <takeaway 3>"""

    llm_output = await call_llm(prompt, max_tokens=500)

    # Parse output
    summary = ""
    takeaways = []

    if "TAKEAWAYS:" in llm_output:
        parts = llm_output.split("TAKEAWAYS:")
        summary = parts[0].replace("SUMMARY:", "").strip()
        takeaways_raw = parts[1].strip().split("\n")
        for line in takeaways_raw:
            cleaned = line.strip().lstrip("1234567890.- ")
            if cleaned:
                takeaways.append(cleaned)
    else:
        summary = llm_output
        takeaways = [
            "Consistent thematic focus throughout highlighted passages.",
            "Key narrative or conceptual progression captured.",
            "Synthesized note for future study and recall."
        ]

    return {
        "summary": summary,
        "takeaways": takeaways[:3]
    }


async def define(term: str, context: str = "", book_title: str = "") -> str:
    """
    LLM prompt to define a term or concept in 1-2 concise, accessible sentences,
    tailored to the reading context.
    """
    prompt = f"""Explain or define the term "{term}" as it appears in this context:
Context: "{context}"
Book: "{book_title or 'Literature'}"

Provide a clear, accurate definition in 1 to 2 sentences. Focus on how the term is used in this passage."""

    definition = await call_llm(prompt, max_tokens=150)
    return definition

