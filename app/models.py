from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    query: str = Field(..., description="The user query or question")
    chapter_text: str = Field(default="", description="Current chapter text for immediate context")
    chapter_title: str = Field(default="", description="Current chapter title")
    book_title: str = Field(default="", description="Current book title")
    book_id: str = Field(default="", description="Unique identifier for the book in vector store")


class SourceChunk(BaseModel):
    text: str
    chapter_title: Optional[str] = ""
    score: Optional[float] = 0.0


class ChatResponse(BaseModel):
    answer: str
    sources: List[SourceChunk] = Field(default_factory=list)


class SynthesizeRequest(BaseModel):
    highlights: List[str] = Field(..., description="List of user highlights and notes")
    book_title: Optional[str] = Field(default="", description="Optional book title for context")


class SynthesizeResponse(BaseModel):
    summary: str
    takeaways: List[str] = Field(default_factory=list)


class DefineRequest(BaseModel):
    term: str = Field(..., description="Word or phrase to define")
    context: str = Field(default="", description="Contextual excerpt surrounding the term")
    book_title: Optional[str] = Field(default="", description="Book title for domain context")


class DefineResponse(BaseModel):
    term: str
    definition: str


class ChapterInput(BaseModel):
    id: Optional[str] = ""
    title: str = ""
    text: str = ""


class IndexBookRequest(BaseModel):
    book_id: str = Field(..., description="Unique book ID")
    book_title: str = Field(..., description="Title of the book")
    chapters: List[ChapterInput] = Field(..., description="List of book chapters")


class IndexBookResponse(BaseModel):
    status: str
    indexed_chunks: int
    book_id: str


class FeedbackRequest(BaseModel):
    query: str
    response: str
    feedback: str = Field(..., description="'positive' or 'negative'")
    comments: Optional[str] = None


class FeedbackResponse(BaseModel):
    status: str
    message: str

