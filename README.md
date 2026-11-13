# NovelStream AI 📖✨

NovelStream AI is an intelligent, RAG-powered PDF reader built to eliminate common reading friction:
1. **Broken PDF Reflow**: Smart text reflow engine fixes mid-word line hyphenations, merges scattered lines, and preserves clean paragraph hierarchies.
2. **Jargon Overload**: Instant, contextual AI-powered glossary tailored to the exact book passage.
3. **Complex Sentence Explanations**: Reader-level "Explain this" instant assistant.
4. **Scattered Highlights**: Automatic note synthesis compiling quotes into concise takeaways.
5. **Cross-Chapter Q&A**: RAG-powered vector search embedding the entire book into Pinecone, allowing you to ask queries across chapters without spoiler loss.

---

## 🚀 Free Tier Architecture (Zero Cost)

NovelStream AI uses **only free-tier APIs and infrastructure**:
- **LLM**: [OpenRouter](https://openrouter.ai/) (`meta-llama/llama-3.1-8b-instruct:free`)
- **Embeddings**: [HuggingFace Inference API](https://huggingface.co/) (`sentence-transformers/all-MiniLM-L6-v2`, 384 dimensions)
- **Vector Database**: [Pinecone Free Tier](https://www.pinecone.io/) (Serverless Starter index, 384 dimensions)
- **Frontend**: Vanilla ES6 JavaScript, Tailwind CSS (CDN), PDF.js (CDN), IndexedDB. Zero build step, zero heavy frameworks.
- **Backend**: FastAPI + Uvicorn + Pydantic v2 + HTTPX.

---

## 🛠️ Getting Free API Keys

1. **OpenRouter API Key**:
   - Sign up at [OpenRouter.ai](https://openrouter.ai/).
   - Go to **Keys** and create a free key. Free models like `meta-llama/llama-3.1-8b-instruct:free` require no billing.
2. **HuggingFace API Key**:
   - Create a free account on [Hugging Face](https://huggingface.co/).
   - Navigate to **Settings > Access Tokens** and generate a token with `read` permissions.
3. **Pinecone API Key**:
   - Create a free account at [Pinecone](https://www.pinecone.io/).
   - Copy your default API key from the dashboard.

---

## 💻 Local Setup & Execution

### 1. Clone & Enter Directory
```bash
cd novelstream
```

### 2. Create Virtual Environment
```bash
python -m venv venv
# On Windows
.\venv\Scripts\activate
# On Linux/macOS
source venv/bin/activate
```

### 3. Install Requirements
```bash
pip install -r requirements.txt
```

### 4. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Fill in your API keys (if left blank, NovelStream AI operates smoothly with mock embeddings and mock responses for local testing):
```env
OPENROUTER_API_KEY=your_openrouter_key
HUGGINGFACE_API_KEY=your_huggingface_key
PINECONE_API_KEY=your_pinecone_key
PINECONE_INDEX_NAME=novelstream
ENVIRONMENT=development
```

### 5. Run the Application
```bash
uvicorn app.main:app --reload --port 8000
```
Open your browser at `http://localhost:8000`.

### 6. Run Tests
```bash
pytest app/tests/ -v
```

---

## ☁️ Deployment to Render.com

This repository is ready to deploy directly to [Render](https://render.com/) with zero Docker configuration:

1. Push your repository to GitHub.
2. Log into Render, click **New > Blueprint**.
3. Select your repository. Render will automatically detect `render.yaml`.
4. Add your `OPENROUTER_API_KEY`, `HUGGINGFACE_API_KEY`, and `PINECONE_API_KEY` under the Environment Variables section in Render.
5. Click **Apply** to deploy!

---

## 📂 Project Structure

```
novelstream/
├── README.md                  # Project documentation & free key guides
├── .gitignore                 # Standard clean ignore file
├── .env.example               # Template environment configuration
├── requirements.txt           # Python dependencies
├── render.yaml                # Render.com blueprint configuration
├── app/
│   ├── __init__.py
│   ├── main.py                # FastAPI application & static mounting
│   ├── config.py              # Pydantic BaseSettings
│   ├── ai_engine.py           # Embeddings, Pinecone, RAG & LLM logic
│   ├── routers.py             # API endpoints (/chat, /synthesize, /define, etc.)
│   ├── models.py              # Pydantic v2 schemas
│   └── tests/
│       ├── __init__.py
│       └── test_api.py        # Automated test suite
├── static/
│   ├── index.html             # Single-page application shell
│   ├── styles.css             # Typography, theme support, custom scrollbars
│   ├── db.js                  # Client-side IndexedDB persistence
│   ├── reflow.js              # Smart line-merging & hyphenation reflow engine
│   ├── app.js                 # PDF handling, navigation & reader state
│   ├── ai.js                  # Chat, highlight toolbar & glossary handlers
│   ├── manifest.json          # PWA configuration
│   └── sw.js                  # Service Worker for offline asset caching
└── .github/
    └── workflows/
        └── ci.yml             # Automated GitHub Actions test pipeline
```

