import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from app.routers import router as api_router
from app.config import settings

app = FastAPI(
    title="NovelStream AI",
    description="Intelligent, RAG-powered PDF reader backend",
    version="1.0.0"
)

# Enable CORS for cross-origin integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API routes
app.include_router(api_router)

# Mount static files
static_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "static")
if os.path.exists(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")


@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "app": "NovelStream AI",
        "environment": settings.ENVIRONMENT,
        "has_openrouter_key": bool(settings.OPENROUTER_API_KEY),
        "has_huggingface_key": bool(settings.HUGGINGFACE_API_KEY),
        "has_pinecone_key": bool(settings.PINECONE_API_KEY)
    }


@app.get("/")
async def root():
    index_path = os.path.join(static_dir, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"message": "NovelStream AI backend is running. Static files not found."}

