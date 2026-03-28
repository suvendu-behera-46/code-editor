# AI-Powered Browser IDE — Architecture Document

> Version 1.0 | March 2026

---

## Table of Contents

1. [System Overview](#system-overview)
2. [High-Level Architecture](#high-level-architecture)
3. [Frontend Architecture](#frontend-architecture)
4. [Backend Architecture](#backend-architecture)
5. [AI Layer](#ai-layer)
6. [GitHub Integration](#github-integration)
7. [CI/CD Pipeline](#cicd-pipeline)
8. [Data Flow](#data-flow)
9. [API Reference](#api-reference)
10. [Security](#security)
11. [Deployment](#deployment)
12. [Future Roadmap](#future-roadmap)

---

## System Overview

A fully web-based AI-powered code editor modeled after VS Code, running entirely in the browser. Users can edit files, select AI models to modify/explain/refactor code, connect GitHub repositories, and trigger CI/CD pipelines — all without leaving the browser.

### Core Capabilities

| Feature | Description |
|---|---|
| Monaco Editor | Full VS Code editing experience in-browser |
| File System | Create, read, update, delete files and folders |
| Multi-Model AI | Route requests to GPT-4o, Claude 3.5, Gemini 1.5 |
| AI Modes | Edit, Explain, Refactor, Generate |
| GitHub Integration | Clone, commit, push via GitHub REST API |
| CI/CD | Trigger and monitor GitHub Actions workflows |

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        BROWSER (Frontend)                        │
│                                                                   │
│  ┌─────────────┐  ┌──────────────────┐  ┌────────────────────┐  │
│  │  File Tree  │  │  Monaco Editor   │  │    AI Panel        │  │
│  │  (Explorer) │  │  (Tabs + Editor) │  │  (Chat + Apply)    │  │
│  └─────────────┘  └──────────────────┘  └────────────────────┘  │
│         │                  │                       │              │
│  ┌──────┴──────────────────┴───────────────────────┴──────────┐  │
│  │              Zustand Global State Store                      │  │
│  └────────────────────────────┬────────────────────────────────┘  │
│                               │ axios HTTP                         │
└───────────────────────────────┼─────────────────────────────────┘
                                │
                    ┌───────────▼──────────┐
                    │   FastAPI Backend    │
                    │   (Python 3.11+)     │
                    │                      │
                    │  /api/files   ─────► Local FS (workspace/)
                    │  /api/ai      ─────► LLM Providers
                    │  /api/github  ─────► GitHub REST API
                    │  /api/cicd    ─────► GitHub Actions API
                    └──────────────────────┘
                           │         │
              ┌────────────┘         └────────────────┐
              │                                        │
    ┌─────────▼─────────┐                  ┌──────────▼──────────┐
    │    LLM Providers  │                  │    GitHub REST API   │
    │                   │                  │                      │
    │  • OpenAI GPT-4o  │                  │  • Repos             │
    │  • Claude 3.5     │                  │  • Contents (CRUD)   │
    │  • Gemini 1.5     │                  │  • Commits/Pushes    │
    └───────────────────┘                  │  • Actions Workflows │
                                           └──────────────────────┘
```

---

## Frontend Architecture

### Technology Stack

| Technology | Purpose |
|---|---|
| React 18 | UI framework |
| Vite 5 | Build tool and dev server |
| Monaco Editor | Core code editor (same as VS Code) |
| Zustand | Global state management |
| Axios | HTTP client |

### Component Tree

```
App
├── TopBar                         # Title, model selector, action buttons
├── MainLayout
│   ├── LeftPanel
│   │   ├── FileTree               # Folder/file explorer
│   │   │   └── FileTreeItem[]     # Recursive file/folder nodes
│   │   └── GitHubPanel            # GitHub controls (toggleable)
│   ├── CenterPanel
│   │   ├── EditorTabs             # Open file tabs
│   │   ├── MonacoEditor           # The editor itself
│   │   └── WelcomeScreen          # Shown when no file is open
│   └── RightPanel (AIPanel)       # AI chat/command panel (toggleable)
└── StatusBar                      # File info, branch, cursor position
```

### State Management (Zustand Store)

```
EditorStore
├── fileTree: TreeNode[]           # Recursive file system tree
├── files: Map<path, content>      # Cached file contents
├── openTabs: string[]             # Paths of open tabs
├── activeFile: string | null      # Currently active tab
├── unsavedFiles: string[]         # Paths with unsaved changes
├── cursorPosition: {line, col}
│
├── aiPanelOpen: boolean
├── aiMode: 'edit'|'explain'|'refactor'|'generate'
├── selectedModel: string
├── aiPrompt: string
├── aiResponse: {result, mode} | null
├── aiLoading: boolean
│
├── githubPanelOpen: boolean
├── githubToken: string
├── repoOwner, repoName, branch
└── commitMessage: string
```

### Monaco Editor Configuration

- Theme: `vs-dark` (identical to VS Code)
- Language: auto-detected from file extension
- Keyboard shortcuts: Ctrl+S to save, Ctrl+Z undo, standard IDE bindings
- Auto-save: debounced 2 seconds after last keystroke

---

## Backend Architecture

### Technology Stack

| Technology | Purpose |
|---|---|
| FastAPI | REST API framework |
| Uvicorn | ASGI server |
| Pydantic v2 | Request/response validation |
| httpx | Async HTTP client for LLM APIs |
| GitPython | Git operations |
| aiofiles | Async file I/O |

### Directory Structure

```
backend/
├── main.py              # FastAPI app, CORS, router registration
├── config.py            # Settings (env vars, pydantic-settings)
├── models/
│   └── schemas.py       # All Pydantic request/response models
├── routers/
│   ├── files.py         # File CRUD endpoints
│   ├── ai.py            # AI routing endpoints
│   └── github.py        # GitHub integration endpoints
├── services/
│   ├── llm_service.py   # LLM provider routing
│   └── github_service.py # GitHub REST API wrapper
└── workspace/           # User's working directory (file storage)
```

### File System Security

All file operations validate that paths remain within the `workspace/` directory to prevent path traversal attacks:

```python
def get_safe_path(workspace_dir: str, user_path: str) -> str:
    safe = os.path.normpath(os.path.join(workspace_dir, user_path))
    if not safe.startswith(os.path.abspath(workspace_dir)):
        raise HTTPException(400, "Invalid path")
    return safe
```

---

## AI Layer

### Supported Models

| Provider | Models | API Base |
|---|---|---|
| OpenAI | gpt-4o, gpt-4-turbo, gpt-3.5-turbo | api.openai.com |
| Anthropic | claude-3-5-sonnet, claude-3-opus | api.anthropic.com |
| Google | gemini-1.5-pro, gemini-1.5-flash | generativelanguage.googleapis.com |

### AI Modes

| Mode | System Prompt Behavior | Response Type |
|---|---|---|
| **Edit** | Modify code per instruction. Return ONLY code. | Code block |
| **Explain** | Explain what this code does, clearly. | Markdown text |
| **Refactor** | Improve quality/readability. Return ONLY code. | Code block |
| **Generate** | Generate new code from description. | Code block |

### Request Flow

```
Frontend                   Backend                    LLM Provider
    │                          │                           │
    │─ POST /api/ai/edit ──────►│                           │
    │  {file_path, content,    │                           │
    │   prompt, model, mode}   │                           │
    │                          │─ build system prompt ─────►│
    │                          │  model routing            │
    │                          │◄─ streamed/complete resp ──│
    │◄─ {result, mode} ────────│                           │
    │                          │                           │
    │  [User clicks Apply]     │                           │
    │  → Replace editor        │                           │
    │    content               │                           │
```

### Model Routing Logic

```python
def route_to_provider(model: str):
    if model.startswith("gpt"):     → OpenAI API
    if model.startswith("claude"):  → Anthropic API
    if model.startswith("gemini"):  → Google Gemini API
```

---

## GitHub Integration

### Authentication

Uses GitHub Personal Access Tokens (PAT) or OAuth tokens. Token is stored in browser localStorage (never sent to external services other than GitHub).

### Supported Operations

| Operation | GitHub API Endpoint |
|---|---|
| List repos | GET /user/repos |
| Read file | GET /repos/{owner}/{repo}/contents/{path} |
| Create/Update file | PUT /repos/{owner}/{repo}/contents/{path} |
| Delete file | DELETE /repos/{owner}/{repo}/contents/{path} |
| List branches | GET /repos/{owner}/{repo}/branches |
| Get commit SHA | GET /repos/{owner}/{repo}/git/refs/heads/{branch} |

### Commit Flow

```
1. User edits files in Monaco editor
2. User clicks "Commit & Push"
3. Frontend sends changed files + commit message to backend
4. Backend uses GitHub Contents API to update each file
5. GitHub automatically creates a new commit on the target branch
6. GitHub Actions triggers automatically on push (if configured)
```

---

## CI/CD Pipeline

### GitHub Actions Integration

The backend can:
1. List workflow files (`.github/workflows/*.yml`)
2. Get recent workflow runs for a repo
3. Manually trigger a workflow via `workflow_dispatch`

### Example Workflow (auto-generated)

```yaml
name: CI/CD

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test

      - name: Build
        run: npm run build
```

---

## Data Flow

### File Edit with AI

```
┌────────────────────────────────────────────────────────────────┐
│                         Complete Flow                           │
│                                                                  │
│  1. User opens file       → GET /api/files/{path}               │
│                           ← file content                         │
│                                                                  │
│  2. File shown in Monaco  → Monaco renders with syntax HL       │
│                                                                  │
│  3. User types prompt     → State: aiPrompt = "add TypeScript"  │
│                                                                  │
│  4. User clicks "Run AI"  → POST /api/ai/edit                   │
│                             {content, prompt, model, mode}       │
│                           ← {result: "updated code..."}         │
│                                                                  │
│  5. Result shown in panel → AI panel displays result code       │
│                                                                  │
│  6. User clicks "Apply"   → Monaco content replaced             │
│                           → File marked as unsaved (●)           │
│                                                                  │
│  7. User presses Ctrl+S   → PUT /api/files/{path}               │
│                             {content: "updated code"}            │
│                           ← {success: true}                      │
│                                                                  │
│  8. (Optional) Push to GH → POST /api/github/commit             │
│                             {files, message, token, branch}      │
└────────────────────────────────────────────────────────────────┘
```

---

## API Reference

### Files API

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/files/tree` | Get full file tree |
| GET | `/api/files/read?path={p}` | Read file content |
| POST | `/api/files/create` | Create file or folder |
| PUT | `/api/files/save` | Save file content |
| DELETE | `/api/files/delete?path={p}` | Delete file/folder |
| POST | `/api/files/rename` | Rename/move file |

### AI API

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/ai/edit` | AI edit/explain/refactor |
| GET | `/api/ai/models` | List available models |

### GitHub API

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/github/commit` | Commit files to GitHub |
| GET | `/api/github/repos` | List user repositories |
| GET | `/api/github/branches` | List branches |
| POST | `/api/github/workflow/trigger` | Trigger workflow dispatch |
| GET | `/api/github/workflow/runs` | Get recent workflow runs |

---

## Security

### Input Validation
- All file paths validated against workspace root (no path traversal)
- API key inputs never logged or stored server-side
- GitHub tokens stored client-side only (localStorage)

### API Keys
- All LLM API keys stored in `.env` (never committed)
- Keys injected via environment variables only
- No API keys exposed to frontend

### CORS
- Strict CORS policy: only allowed origins (localhost:5173, localhost:3000)
- In production: configure to exact frontend domain

### OWASP Mitigations
- **Injection**: Path sanitization, no shell command construction from user input
- **Broken Access Control**: Workspace directory isolation
- **SSRF**: GitHub API calls only go to api.github.com; no user-controlled URLs
- **Cryptographic Failures**: HTTPS in production; no sensitive data in plaintext logs

---

## Deployment

### Local Development (Docker Compose)

```bash
# 1. Copy env file
cp .env.example .env
# Edit .env with your API keys

# 2. Start all services
docker-compose up -d

# Frontend: http://localhost:5173
# Backend:  http://localhost:8000
# API Docs: http://localhost:8000/docs
```

### Manual Setup

```bash
# Backend
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Frontend (new terminal)
cd frontend
npm install
npm run dev
```

### Production Deployment

| Component | Recommended Platform |
|---|---|
| Frontend | Vercel, Netlify, Cloudflare Pages |
| Backend | Railway, Render, AWS ECS, GCP Cloud Run |
| Workspace Storage | AWS EFS, GCP Filestore, or per-user S3 buckets |

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `OPENAI_API_KEY` | Optional* | OpenAI API key |
| `ANTHROPIC_API_KEY` | Optional* | Anthropic API key |
| `GEMINI_API_KEY` | Optional* | Google Gemini API key |
| `WORKSPACE_DIR` | No | Directory for file storage (default: `workspace`) |
| `ALLOWED_ORIGINS` | No | CORS allowed origins |

*At least one LLM key required for AI features.

---

## Future Roadmap

### Phase 1 (Current MVP)
- [x] Monaco Editor with file explorer
- [x] Create/read/update/delete files
- [x] Multi-model AI editing (GPT-4o, Claude, Gemini)
- [x] AI modes: Edit, Explain, Refactor, Generate
- [x] GitHub commit & push integration

### Phase 2
- [ ] Real-time collaboration (WebSockets + CRDT)
- [ ] Terminal emulator in browser (xterm.js + pty)
- [ ] Diff view (Monaco DiffEditor) for AI changes
- [ ] Per-user workspaces (authentication + isolated FS)
- [ ] File upload/download

### Phase 3
- [ ] AI multi-file context editing
- [ ] Plugin/extension system
- [ ] Docker-in-browser sandbox (CodeSandbox style)
- [ ] Persistent storage (PostgreSQL metadata + S3 files)
- [ ] Team workspaces and live cursors

### Phase 4
- [ ] AI agent mode (autonomous multi-step editing)
- [ ] RAG over codebase (vector DB + embeddings)
- [ ] Custom model fine-tuning integration
- [ ] VS Code extension compatibility layer

---

*Built with React, FastAPI, Monaco Editor, and multiple LLM providers.*
