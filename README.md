# AI Code Editor

A web-based AI-powered IDE in the browser. Edit files with Monaco Editor (same engine as VS Code), ask AI models to modify/explain/refactor your code, and push directly to GitHub — all from a single browser tab.

---

## Features

- **Monaco Editor** — Full VS Code editing experience with syntax highlighting, IntelliSense, and keyboard shortcuts
- **File Explorer** — Create, rename, delete files and folders with a tree view
- **Multi-Model AI** — Switch between GPT-4o, Claude 3.5 Sonnet, Gemini 1.5 Pro and more
- **AI Modes** — Edit, Explain, Refactor, Generate
- **GitHub Integration** — Commit and push changes directly from the browser
- **CI/CD** — Trigger and monitor GitHub Actions workflows

---

## Quick Start

### Option 1: Docker Compose (Recommended)

```bash
git clone <this-repo>
cd code-editor
cp .env.example .env
# Edit .env and add your API keys
docker-compose up -d
```

Open http://localhost:5173

### Option 2: Manual Setup

**Backend (Python 3.11+)**

```bash
cd backend
python -m venv venv
source venv/bin/activate         # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env             # Add your API keys
uvicorn main:app --reload --port 8000
```

**Frontend (Node 18+)**

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173

---

## Configuration

Copy `.env.example` to `.env` in the `backend/` directory:

```env
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GEMINI_API_KEY=AI...
```

At least one API key is required for AI features. GitHub integration uses tokens stored in your browser — no server-side storage.

---

## Usage

### Editing Files

1. Create a file using the `+` button in the file explorer
2. Click a file to open it in the editor
3. Edit and press `Ctrl+S` to save

### Using AI

1. Open a file in the editor
2. Select an AI mode: **Edit**, **Explain**, **Refactor**, or **Generate**
3. Choose a model from the dropdown
4. Type your instruction (e.g. "Convert this to TypeScript")
5. Click **Run** — the AI response appears in the panel
6. Click **Apply** to replace the file with the AI result

### GitHub Integration

1. Click the GitHub icon in the top bar
2. Enter your [GitHub Personal Access Token](https://github.com/settings/tokens)
3. Enter your repository (owner/repo format)
4. Make changes, add a commit message, and click **Commit & Push**

---

## Project Structure

```
code-editor/
├── ARCHITECTURE.md        # Detailed architecture document
├── docker-compose.yml     # Docker setup
├── .env.example
├── backend/               # FastAPI backend
│   ├── main.py
│   ├── config.py
│   ├── requirements.txt
│   ├── routers/           # API endpoints
│   ├── services/          # LLM + GitHub services
│   └── workspace/         # File storage directory
└── frontend/              # React + Vite frontend
    └── src/
        ├── components/    # UI components
        ├── store/         # Zustand state
        ├── api/           # Backend API client
        └── utils/
```

---

## API Documentation

When the backend is running, visit http://localhost:8000/docs for the interactive Swagger UI.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Monaco Editor, Zustand, Axios |
| Backend | Python, FastAPI, Uvicorn, httpx, aiofiles |
| AI | OpenAI API, Anthropic API, Google Gemini API |
| Git | GitHub REST API |

---

## License

MIT
