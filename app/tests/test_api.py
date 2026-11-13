import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app

pytestmark = pytest.mark.anyio


@pytest.fixture
def anyio_backend():
    return 'asyncio'


async def test_health_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["app"] == "NovelStream AI"


async def test_define_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.post("/api/define", json={
            "term": "reflow",
            "context": "NovelStream AI uses reflow to format broken PDF lines.",
            "book_title": "AI Reader Handbook"
        })
    assert response.status_code == 200
    data = response.json()
    assert data["term"] == "reflow"
    assert "definition" in data
    assert len(data["definition"]) > 0


async def test_chat_endpoint_mock_fallback():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.post("/api/chat", json={
            "query": "What is the main theme of this book?",
            "chapter_text": "This is a short sample chapter about machine learning and reading interfaces.",
            "chapter_title": "Chapter 1",
            "book_title": "Modern ML",
            "book_id": "test_book_1"
        })
    assert response.status_code == 200
    data = response.json()
    assert "answer" in data
    assert isinstance(data["sources"], list)


async def test_synthesize_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.post("/api/synthesize", json={
            "highlights": [
                "Reflow merges hyphenated lines into fluid paragraphs.",
                "Vector search allows cross-chapter information retrieval.",
                "Contextual glossaries reduce cognitive overload."
            ],
            "book_title": "Smart Readers"
        })
    assert response.status_code == 200
    data = response.json()
    assert "summary" in data
    assert "takeaways" in data
    assert isinstance(data["takeaways"], list)


async def test_index_book_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.post("/api/index-book", json={
            "book_id": "test_book_101",
            "book_title": "Intro to Data",
            "chapters": [
                {
                    "id": "ch1",
                    "title": "Introduction",
                    "text": "Data processing and indexing allows quick query retrieval across long texts."
                }
            ]
        })
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert data["book_id"] == "test_book_101"
    assert "indexed_chunks" in data


async def test_feedback_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.post("/api/feedback", json={
            "query": "Who is the protagonist?",
            "response": "The protagonist is Alice.",
            "feedback": "positive",
            "comments": "Accurate response"
        })
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
