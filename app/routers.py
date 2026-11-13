import logging
from fastapi import APIRouter, HTTPException
from app.models import (
    ChatRequest, ChatResponse,
    SynthesizeRequest, SynthesizeResponse,
    DefineRequest, DefineResponse,
    IndexBookRequest, IndexBookResponse,
    FeedbackRequest, FeedbackResponse
)
from app import ai_engine

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")


@router.post("/chat", response_model=ChatResponse)
async def chat_endpoint(payload: ChatRequest):
    try:
        result = await ai_engine.chat(
            query=payload.query,
            chapter_text=payload.chapter_text,
            chapter_title=payload.chapter_title,
            book_title=payload.book_title,
            book_id=payload.book_id
        )
        return ChatResponse(
            answer=result["answer"],
            sources=result["sources"]
        )
    except Exception as e:
        logger.error(f"Error in /chat endpoint: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/synthesize", response_model=SynthesizeResponse)
async def synthesize_endpoint(payload: SynthesizeRequest):
    try:
        result = await ai_engine.synthesize(
            highlights=payload.highlights,
            book_title=payload.book_title
        )
        return SynthesizeResponse(
            summary=result["summary"],
            takeaways=result["takeaways"]
        )
    except Exception as e:
        logger.error(f"Error in /synthesize endpoint: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/define", response_model=DefineResponse)
async def define_endpoint(payload: DefineRequest):
    try:
        definition = await ai_engine.define(
            term=payload.term,
            context=payload.context,
            book_title=payload.book_title
        )
        return DefineResponse(
            term=payload.term,
            definition=definition
        )
    except Exception as e:
        logger.error(f"Error in /define endpoint: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/index-book", response_model=IndexBookResponse)
async def index_book_endpoint(payload: IndexBookRequest):
    try:
        chapters_data = [ch.model_dump() for ch in payload.chapters]
        count = await ai_engine.index_book(
            book_id=payload.book_id,
            book_title=payload.book_title,
            chapters=chapters_data
        )
        return IndexBookResponse(
            status="success",
            indexed_chunks=count,
            book_id=payload.book_id
        )
    except Exception as e:
        logger.error(f"Error in /index-book endpoint: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/feedback", response_model=FeedbackResponse)
async def feedback_endpoint(payload: FeedbackRequest):
    try:
        logger.info(f"Feedback received for query '{payload.query[:30]}...': {payload.feedback}")
        return FeedbackResponse(
            status="success",
            message="Feedback recorded successfully"
        )
    except Exception as e:
        logger.error(f"Error in /feedback endpoint: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

