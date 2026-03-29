# AI Code Editor — Full Technical Documentation

> A browser-based VS Code–style code editor with GitHub Copilot–style AI Chat, inline diff editing, direct local filesystem access (File System Access API), multi-provider LLM support, GitHub integration, and a built-in code execution terminal.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [System Diagram](#2-system-diagram)
3. [Component Tree Diagram](#3-component-tree-diagram)
4. [Data Flow Diagrams](#4-data-flow-diagrams)
5. [Frontend — Components](#5-frontend--components)
6. [Frontend — Zustand Store](#6-frontend--zustand-store)
7. [Frontend — API Layer](#7-frontend--api-layer)
8. [Frontend — Utilities](#8-frontend--utilities)
9. [Backend — Routers & Endpoints](#9-backend--routers--endpoints)
10. [Backend — LLM Service](#10-backend--llm-service)
11. [Backend — Pydantic Schemas](#11-backend--pydantic-schemas)
12. [Backend — Configuration](#12-backend--configuration)
13. [File System Access: Two Modes](#13-file-system-access-two-modes)
14. [Inline Diff Workflow](#14-inline-diff-workflow)
15. [Chat Routing Logic](#15-chat-routing-logic)
16. [Deployment](#16-deployment)

---

## 1. Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           BROWSER  (React + Vite)                        │
│                                                                          │
│  ┌─────────────┐  ┌───────────────┐  ┌──────────────┐  ┌─────────────┐ │
│  │  FileTree   │  │ MonacoEditor  │  │   AIPanel    │  │  Terminal   │ │
│  │  (Explorer) │  │ (+ DiffEditor)│  │ (Copilot UI) │  │ (Execution) │ │
│  └─────────────┘  └───────────────┘  └──────────────┘  └─────────────┘ │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │                    Zustand  editorStore.js                         │  │
│  │  File state · AI state · Chat state · GitHub state · Diff state   │  │
│  └───────────────┬────────────────────────────┬───────────────────────┘  │
│                  │ File System Access API      │ fetch / axios            │
│                  │ (Chrome/Edge 86+)           │                          │
└──────────────────┼─────────────────────────────┼──────────────────────────┘
                   │                             │
          Local disk directly         ┌──────────▼──────────┐
          (no backend)                │  FastAPI  (port 8000)│
                                      │                      │
                                      │  /api/files/*        │
                                      │  /api/ai/*           │
                                      │  /api/github/*       │
                                      │  /api/execute/*      │
                                      └──────────┬───────────┘
                                                 │
                    ┌────────────────────────────┼───────────────────────┐
                    │                            │                       │
             ┌──────▼──────┐           ┌─────────▼──────┐     ┌────────▼───────┐
             │  LLM APIs   │           │ GitHub REST API │     │  OS subprocess │
             │             │           │  api.github.com │     │  (python/node/ │
             │ Groq (free) │           └────────────────┘     │   shell exec)  │
             │ Ollama(local│                                   └────────────────┘
             │ OpenAI      │
             │ Anthropic   │
             │ Google      │
             └─────────────┘
```

**Key design decisions:**

| Decision | Reason |
|---|---|
| File System Access API | Files read/written directly to user's local disk from the browser — no upload needed |
| FastAPI backend | LLM calls need server-side API keys; code execution needs OS subprocess |
| Zustand store | Single source of truth; all components subscribe selectively |
| Monaco DiffEditor | Shows inline AI changes before committing, exactly like VS Code Copilot |

---

## 2. System Diagram

```
╔═══════════════════════════════════════════════════════════════════╗
║                        FRONTEND  :5173                            ║
║                                                                   ║
║  App.jsx  ──────────────────────────────────────────────────────  ║
║  │                                                                ║
║  ├── TopBar.jsx          ← AI mode tabs, model selector           ║
║  │                                                                ║
║  ├── [LEFT PANEL]                                                 ║
║  │   └── FileTree.jsx    ← workspace explorer                     ║
║  │       └── FileTreeItem.jsx  (recursive)                        ║
║  │                                                                ║
║  ├── [CENTER PANEL]                                               ║
║  │   ├── EditorTabs.jsx  ← open file tabs                         ║
║  │   └── MonacoEditor.jsx                                         ║
║  │       ├── <Editor>    ← normal editing mode                    ║
║  │       └── <DiffEditor> ← inline AI diff mode (read-only)       ║
║  │                                                                ║
║  ├── [RIGHT PANEL]                                                ║
║  │   ├── AIPanel.jsx     ← Copilot Chat UI                        ║
║  │   └── GitHubPanel.jsx ← commit / workflow UI                   ║
║  │                                                                ║
║  └── [BOTTOM PANEL]                                               ║
║      ├── Terminal.jsx    ← code execution                         ║
║      └── StatusBar.jsx   ← cursor pos / language / model          ║
║                                                                   ║
║  ─────────────────────────────────────────────────────────────── ║
║  editorStore.js  (Zustand)                                        ║
║    directoryHandle ──► File System Access API ──► LOCAL DISK      ║
║    api.*          ──► /api/* ──► Backend                          ║
╚═══════════════════════════════════════════════════════════════════╝

╔═══════════════════════════════════════════════════════════════════╗
║                        BACKEND  :8000                             ║
║                                                                   ║
║  main.py  (FastAPI)                                               ║
║  │                                                                ║
║  ├── /api/files/*    files.py                                     ║
║  │     safe_path() enforces workspace boundary                    ║
║  │     get/set workspace runtime switching                        ║
║  │                                                                ║
║  ├── /api/ai/*       ai.py                                        ║
║  │     edit / generate-folder / agent / ask-questions             ║
║  │     └── llm_service.py                                         ║
║  │           _try_parse_json() — auto-repair bad escapes          ║
║  │           Groq · Ollama · OpenAI · Anthropic · Gemini          ║
║  │                                                                ║
║  ├── /api/github/*   github.py                                    ║
║  │     user · repos · branches · commit · workflows               ║
║  │     └── github_service.py                                      ║
║  │                                                                ║
║  └── /api/execute/*  execute.py                                   ║
║        python · javascript/node · shell                           ║
║                                                                   ║
║  workspace_state.py — runtime workspace path (mutable global)     ║
╚═══════════════════════════════════════════════════════════════════╝
```

---

## 3. Component Tree Diagram

```
App.jsx
├── TopBar/TopBar.jsx
│     props: aiMode, setAIMode, selectedModel, setSelectedModel,
│            toggleAIPanel, toggleGitHubPanel, githubUser
│
├── [LEFT]  FileTree/FileTree.jsx
│     props: fileTree, loadFileTree, createFile, createFolder,
│            openFile, selectedFolder, setSelectedFolder,
│            workspacePath, openFolder
│     │
│     └── FileTreeItem.jsx  (recursive)
│           props: node, depth, activeFile, openFile,
│                  deleteNode, renameNode,
│                  selectedFolder, setSelectedFolder
│
├── [CENTER]
│     ├── Editor/EditorTabs.jsx
│     │     props: openTabs, activeFile, unsavedFiles,
│     │            setActiveFile, closeTab
│     │
│     └── Editor/MonacoEditor.jsx
│           props: (from store) activeFile, files, setFileContent,
│                  saveFile, setCursorPosition,
│                  inlineEditProposal, acceptInlineEdit, discardInlineEdit
│           renders:
│             ├── <DiffEditor>  when inlineEditProposal.path === activeFile
│             │     original = inlineEditProposal.original
│             │     modified = inlineEditProposal.proposed
│             │     options: renderSideBySide=false (inline mode), readOnly
│             │     toolbar: [✓ Accept] [✗ Discard]
│             └── <Editor>      normal editing
│                   toolbar: [✨ Format]
│
├── [RIGHT]
│     ├── AIPanel/AIPanel.jsx
│     │     props: activeFile, selectedModel, chatMessages,
│     │            chatLoading, sendChatMessage, clearChat,
│     │            proposeInlineEdit, chatAcceptFile, chatSkipFile,
│     │            chatAcceptAllFiles, chatDiscardAllFiles
│     │     features:
│     │       - Slash command autocomplete (/fix /explain /refactor ...)
│     │       - Code blocks with [⟶ Show Diff] or [✓ Apply in Editor]
│     │       - Agent file review cards (Accept / Skip per file)
│     │
│     └── GitHub/GitHubPanel.jsx
│           props: githubToken, githubUser, repoOwner, repoName,
│                  repoBranch, commitMessage, files, openTabs
│
└── [BOTTOM]
      ├── Terminal/Terminal.jsx
      │     props: activeFile, files, fileTree, executeCode, clearTerminal
      │
      └── StatusBar/StatusBar.jsx
            props: activeFile, cursorPosition, selectedModel,
                   aiLoading, githubUser
```

---

## 4. Data Flow Diagrams

### 4a. Sending a Chat Message

```
User types message in AIPanel textarea
            │
            ▼
    sendChatMessage(message)       [editorStore.js]
            │
    ┌───────┴──────────────────────────────────┐
    │  Detect intent from message text          │
    │                                           │
    │  isSlashAgent?   /create /build /generate │
    │  isNaturalAgent? "create a react app"     │
    │  isBareCreate?   "build a counter app"    │
    └───────┬──────────────────┬────────────────┘
            │                  │
    [AGENT PATH]        [SINGLE-FILE PATH]
            │                  │
            ▼                  ▼
  api.generateInFolder()   detect mode:
  POST /api/ai/generate-   edit / explain /
  folder                   refactor / generate
            │                  │
            │            api.editWithAI()
            │            POST /api/ai/edit
            │                  │
            │            mode === 'edit'
            │            + activeFile open?
            │                  │
            │           ┌──────┴──────────┐
            │           │  YES            │  NO
            │           ▼                 ▼
            │    proposeInlineEdit()  append response
            │    ↓                   to chatMessages
            │    MonacoEditor
            │    switches to
            │    DiffEditor
            │
            ▼
  returns [{filename, path,
            content, status:'pending'}]
            │
            ▼
  Chat message with
  file review cards
  (Accept / Skip / Accept All)
```

### 4b. Accepting an Inline Diff

```
[MonacoEditor shows DiffEditor — green/red inline changes]
                    │
        User clicks [✓ Accept]
                    │
                    ▼
          acceptInlineEdit()         [editorStore.js]
                    │
          inlineEditProposal = { path, original, proposed }
                    │
                    ▼
          saveFileContent(path, proposed)
                    │
          ┌─────────┴──────────────┐
          │  directoryHandle set?  │
          ├────────────────────────┤
          │ YES              NO    │
          ▼                  ▼     │
   fsWriteFile()      api.saveFile()│
   (File System       PUT /api/    │
    Access API)       files/save   │
   → local disk       → backend/  │
                        workspace/ │
          └─────────┬──────────────┘
                    │
          set inlineEditProposal = null
          update files[path] in memory
          clear unsavedFiles
                    │
                    ▼
         MonacoEditor reverts to
         normal <Editor> with
         updated content
```

### 4c. Opening a Local Folder (File System Access API)

```
User clicks 📂 in FileTree
            │
            ▼
      openFolder()              [editorStore.js]
            │
            ▼
  window.showDirectoryPicker({ mode: 'readwrite' })
            │
    [Browser permission prompt]
            │
            ▼
  directoryHandle = FileSystemDirectoryHandle
  workspacePath = handle.name
  reset: fileTree, files, openTabs, activeFile
            │
            ▼
      loadFileTree()
            │
    fsBuildTree(directoryHandle)  [fileSystemHelper.js]
            │    recursive iteration via handle.entries()
            │    skips hidden files (starts with .)
            │    sorts: folders first, then alpha
            ▼
  fileTree = [{ name, path, type:'file'|'folder', children }]
            │
            ▼
  FileTree renders with native OS paths
  All subsequent reads/writes bypass backend entirely
```

### 4d. LLM Request Flow (Backend)

```
POST /api/ai/edit
{ file_path, content, prompt, model, mode }
            │
            ▼
      edit_with_ai()           [routers/ai.py]
            │
            ▼
      run_ai(model, content, prompt, mode)   [llm_service.py]
            │
    _dispatch_model(model)
            │
    ┌───────┼──────────────────────────────┐
    │ groq/ │ ollama/ │ gpt* │ claude* │ gemini*
    ▼       ▼         ▼      ▼         ▼
  Groq    Ollama   OpenAI Anthropic Google
  API     local    API    API       API
    └───────┴─────────┴──────┴─────────┘
                    │
            raw LLM text response
                    │
            return result string
                    │
            ▼
      AIEditResponse { result, mode, model }
            │
            ▼
  Frontend: proposeInlineEdit() or chat message
```

### 4e. Agent File Generation Flow

```
User: "create a react counter app"
            │
            ▼
  sendChatMessage()  detects isBareCreatePattern
            │
  folder_path extracted from message
            │
            ▼
  api.generateInFolder({ folder_path, prompt, model })
  POST /api/ai/generate-folder
            │
            ▼
  generate_in_folder()          [routers/ai.py]
  ├── scans existing files in folder for context
  ├── run_ai_folder_generate()  [llm_service.py]
  │     FOLDER_GENERATE_SYSTEM prompt:
  │     "Return ONLY a JSON array [{filename, content}]"
  │     _try_parse_json() — repairs bad escape sequences
  │     strips duplicate folder prefix from filenames
  └── returns AIFolderGenerateResponse
        { folder_path, files: [{filename, path, content}] }
            │
            ▼
  Chat message appears with file cards:
  ┌─────────────────────────────────┐
  │ 📁 3 files proposed             │
  │ [✓ Accept All] [✗ Discard All]  │
  │                                 │
  │ 📄 src/App.js    [✓ Accept][✗]  │
  │ 📄 src/index.js  [✓ Accept][✗]  │
  │ 📄 package.json  [✓ Accept][✗]  │
  └─────────────────────────────────┘
            │
  User clicks [✓ Accept] per file
            │
  chatAcceptFile(msgId, filePath)
  ├── directoryHandle? → fsWriteFile()  → local disk
  └── no handle?       → api.saveFile() → backend/workspace/
```

---

## 5. Frontend — Components

### App.jsx
Main layout orchestrator.

**Actions on mount:** `loadFileTree()` to populate the file explorer.

**Layout:**
```
┌──────────────────────────────────────────┐
│             TopBar                        │
├──────────┬───────────────────┬───────────┤
│          │                   │           │
│ FileTree │  EditorTabs       │ AIPanel   │
│          │  ──────────────── │    or     │
│          │  MonacoEditor     │ GitHub    │
│          │                   │ Panel     │
│          ├───────────────────┤           │
│          │  Terminal         │           │
│          ├───────────────────┴───────────┤
│          │  StatusBar                    │
└──────────┴───────────────────────────────┘
```

---

### FileTree.jsx

Explorer panel. Manages file/folder creation and import.

**Header buttons:**

| Button | Action |
|--------|--------|
| `+` | Prompt → `createFile(selectedFolder/name)` |
| `⊞` | Prompt → `createFolder(selectedFolder/name)` |
| `🏗` | Prompt → `createFolder(name)` (new root project) |
| `+📄` | `<input type="file" multiple>` → `api.saveFile` for each |
| `📂` | `openFolder()` → native OS directory picker |
| `↺` | `loadFileTree()` |

**Selected folder indicator:** Shows blue banner when a folder is selected (files/subfolders created inside it).

---

### MonacoEditor.jsx

Code editor. Switches between two modes:

**Normal mode (`<Editor>`):**
- `onChange` → `setFileContent` + auto-save after 2 s debounce
- `Ctrl+S` → `saveFile(activeFile)` immediately
- `Ctrl+Shift+F` → format document

**Diff mode (`<DiffEditor>`, when `inlineEditProposal.path === activeFile`):**
- `renderSideBySide: false` — inline (not split pane)
- `readOnly: true` — user can't type in the diff
- Toolbar becomes: `[✓ Accept]` → `acceptInlineEdit()` | `[✗ Discard]` → `discardInlineEdit()`

---

### AIPanel.jsx

Copilot Chat UI. Supports:

**Slash commands (with autocomplete popup):**

| Command | Behaviour |
|---------|-----------|
| `/fix` | Fix all bugs |
| `/explain` | Explain what the code does |
| `/refactor` | Improve readability and quality |
| `/generate` | Create code from description |
| `/test` | Write unit tests |
| `/docs` | Add documentation and comments |
| `/optimize` | Optimize for performance |

**Message types:**
- `user` — blue bubble (right)
- `assistant` — grey bubble with code blocks and action buttons
- `error` — red warning box

**Code block actions:**
- `📋 Copy` — copies code to clipboard
- `⟶ Show Diff` (if active file open) — calls `proposeInlineEdit()` → switches Monaco to diff view
- `✓ Apply in Editor` (if no file open) — creates a new untitled file

**Agent file review cards:** Shown when `msg.pendingFiles.length > 0`.

---

## 6. Frontend — Zustand Store

**File:** `frontend/src/store/editorStore.js`

### State Fields

#### File System
| Field | Type | Description |
|-------|------|-------------|
| `fileTree` | `Array` | Hierarchical workspace tree `[{name, path, type, children}]` |
| `files` | `Object` | `{ path: content }` map (in-memory cache) |
| `openTabs` | `Array<string>` | Paths of open editor tabs |
| `activeFile` | `string\|null` | Currently active tab path |
| `unsavedFiles` | `Array<string>` | Paths with unsaved changes (show `•` in tab) |
| `selectedFolder` | `string` | Folder context for new file/folder creation |
| `workspacePath` | `string` | Display name of current workspace |
| `directoryHandle` | `FileSystemDirectoryHandle\|null` | Set when user opens local folder via FS API |

#### Editor
| Field | Type | Description |
|-------|------|-------------|
| `cursorPosition` | `{line, column}` | Shown in status bar |
| `inlineEditProposal` | `{path, original, proposed}\|null` | Active diff proposal |

#### AI & Chat
| Field | Type | Description |
|-------|------|-------------|
| `chatMessages` | `Array` | `[{id, role, content, timestamp, pendingFiles?}]` |
| `chatLoading` | `boolean` | Spinner while waiting for LLM |
| `selectedModel` | `string` | Current LLM model ID |
| `aiPanelOpen` | `boolean` | Panel visibility |

### Actions

#### File Actions
```
openFolder()           → showDirectoryPicker → set directoryHandle
loadFileTree()         → fsBuildTree(handle) | api.getFileTree()
openFile(path)         → fsReadFile(handle, path) | api.readFile(path)
saveFile(path)         → fsWriteFile(handle, path) | api.saveFile(path)
saveFileContent(p, c)  → fsWriteFile | api.saveFile + update files[]
createFile(path)       → fsWriteFile | api.createFile + loadFileTree()
createFolder(path)     → fsCreateDir | api.createFolder + loadFileTree()
deleteNode(path)       → fsDeleteEntry | api.deleteFile + loadFileTree()
renameNode(old, new)   → fsRenameEntry | api.renameFile + update tabs
```

#### Inline Edit Actions
```
proposeInlineEdit(path, proposed)  → set inlineEditProposal
acceptInlineEdit()                 → saveFileContent(path, proposed) + clear
discardInlineEdit()                → clear inlineEditProposal
```

#### Chat Actions
```
sendChatMessage(msg)         → route to agent or single-file (see §15)
chatAcceptFile(id, path)     → save file + loadFileTree + openFile
chatSkipFile(id, path)       → mark skipped
chatAcceptAllFiles(id)       → save all pending + loadFileTree
chatDiscardAllFiles(id)      → mark all skipped
clearChat()                  → reset chatMessages
```

---

## 7. Frontend — API Layer

**File:** `frontend/src/api/index.js`  
**Base URL:** `/api` (Vite proxy → `http://localhost:8000`)

### Files Endpoints
| Method | Path | Store Action |
|--------|------|-------------|
| `GET` | `/files/tree` | `loadFileTree()` |
| `GET` | `/files/read?path=` | `openFile()` |
| `PUT` | `/files/save` | `saveFile()`, `saveFileContent()` |
| `POST` | `/files/create` | `createFile()`, `createFolder()` |
| `DELETE` | `/files/delete?path=` | `deleteNode()` |
| `POST` | `/files/rename` | `renameNode()` |
| `GET` | `/files/workspace` | `loadFileTree()` (gets display path) |
| `POST` | `/files/workspace` | `setWorkspace()` |

### AI Endpoints
| Method | Path | Store Action |
|--------|------|-------------|
| `GET` | `/ai/models` | (TopBar model list) |
| `POST` | `/ai/edit` | `sendChatMessage()` single-file path |
| `POST` | `/ai/generate-folder` | `sendChatMessage()` agent path |
| `POST` | `/ai/agent` | `runAgentWithAnswers()` |
| `POST` | `/ai/ask-questions` | `askClarifyingQuestions()` |

### GitHub Endpoints
| Method | Path | Used by |
|--------|------|---------|
| `GET` | `/github/user?token=` | GitHubPanel login |
| `GET` | `/github/repos?token=` | GitHubPanel repo list |
| `GET` | `/github/branches?token=&owner=&repo=` | GitHubPanel branch list |
| `POST` | `/github/commit` | GitHubPanel commit button |
| `GET` | `/github/workflows` | GitHubPanel workflows tab |
| `POST` | `/github/workflow-trigger` | GitHubPanel trigger button |

### Execute Endpoints
| Method | Path | Used by |
|--------|------|---------|
| `POST` | `/execute/execute` | `executeCode()` in Terminal |
| `GET` | `/execute/workspace-info` | Terminal info display |

---

## 8. Frontend — Utilities

### `languageDetect.js`
```
getLanguage(filename)  → Monaco language ID
                          js/jsx → 'javascript'
                          ts/tsx → 'typescript'
                          py     → 'python'
                          html   → 'html'
                          css/scss → 'css'
                          json   → 'json'
                          md     → 'markdown'
                          ...50+ mappings

getFileIcon(filename)  → emoji
                          .py → 🐍, .jsx → ⚛️, .ts → 🔷
                          .json → {}, .md → 📝, .css → 🎨
                          ...

getFolderIcon(isOpen)  → 📂 (open) | 📁 (closed)
```

### `fileSystemHelper.js`
Wraps the browser's [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API). All functions take a `FileSystemDirectoryHandle` as the first argument.

```
fsReadFile(handle, path)           → string (file content)
fsWriteFile(handle, path, content) → void (creates parent dirs automatically)
fsCreateDir(handle, path)          → void (mkdir -p equivalent)
fsDeleteEntry(handle, path)        → void (recursive)
fsRenameEntry(handle, old, new)    → void (read → write new → delete old)
fsBuildTree(handle, basePath)      → [{ name, path, type, children }]
                                       sorted: folders first, then alpha
                                       skips hidden files (starts with .)
```

> **Browser support:** Chrome 86+, Edge 86+. Firefox does not support `showDirectoryPicker`.  
> Does **not** require HTTPS on `localhost`.

---

## 9. Backend — Routers & Endpoints

**File structure:** `backend/routers/`  
**Mounted at:** `main.py` with prefix `/api`

### Files Router (`/api/files`)

| Method | Path | Body / Params | Response |
|--------|------|--------------|----------|
| `GET` | `/workspace` | — | `{ path }` |
| `POST` | `/workspace` | `{ path }` | `{ path }` |
| `GET` | `/tree` | — | Tree array |
| `GET` | `/read` | `?path=` | `{ path, content }` |
| `POST` | `/create` | `{ path, content, is_directory }` | `{ success, path, type }` |
| `PUT` | `/save` | `{ path, content }` | `{ success, path }` |
| `DELETE` | `/delete` | `?path=` | `{ success, path }` |
| `POST` | `/rename` | `{ old_path, new_path }` | `{ success, old_path, new_path }` |

**Security:** `safe_path(rel)` validates that the resolved absolute path starts with `get_workspace()`. Rejects any `../` traversal attempts with HTTP 400.

### AI Router (`/api/ai`)

| Method | Path | Body | Response |
|--------|------|------|----------|
| `GET` | `/models` | — | `[{ id, label, provider }]` |
| `POST` | `/edit` | `{ file_path, content, prompt, model, mode }` | `{ result, mode, model }` |
| `POST` | `/generate-folder` | `{ folder_path, prompt, model }` | `{ folder_path, files, model }` |
| `POST` | `/agent` | `{ folder_path, prompt, model }` | `{ folder_path, created, summary, model }` |
| `POST` | `/ask-questions` | `{ prompt, model }` | `{ questions, model }` |

**Mode values for `/edit`:** `edit` | `explain` | `refactor` | `generate`

### GitHub Router (`/api/github`)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/user` | Verify token, get authenticated user |
| `GET` | `/repos` | List user's repositories |
| `GET` | `/branches` | List branches for a repo |
| `POST` | `/commit` | Create a commit (multiple files at once) |
| `GET` | `/workflows` | List GitHub Actions workflows |
| `GET` | `/workflow-runs` | List recent workflow run history |
| `POST` | `/workflow-trigger` | Manually trigger a workflow dispatch |

### Execute Router (`/api/execute`)

| Method | Path | Body | Response |
|--------|------|------|----------|
| `POST` | `/execute` | `{ code, language, timeout, cwd? }` | `{ success, output, error, exit_code }` |
| `GET` | `/workspace-info` | — | `{ workspace_path, workspace_exists, absolute_path }` |

**Supported languages:** `python`, `javascript` (node), `shell` / `bash`

---

## 10. Backend — LLM Service

**File:** `backend/services/llm_service.py`

### Provider Routing

```
model string → provider
─────────────────────────────────────────────────────
gpt-*                → _call_openai()   (api.openai.com)
claude-*             → _call_anthropic()
gemini-*             → _call_gemini()   (generativelanguage.googleapis.com)
groq/<model>         → _call_groq()     (api.groq.com/openai — free tier)
ollama/<model>       → _call_ollama()   (localhost:11434 — local)
```

### System Prompts

| Prompt Constant | Mode | Instruction |
|----------------|------|-------------|
| `SYSTEM_PROMPTS['edit']` | edit | Return ONLY modified code, no fences |
| `SYSTEM_PROMPTS['explain']` | explain | Plain English + markdown |
| `SYSTEM_PROMPTS['refactor']` | refactor | Improve quality, preserve behaviour |
| `SYSTEM_PROMPTS['generate']` | generate | Create code from description |
| `FOLDER_GENERATE_SYSTEM` | folder gen | Return JSON array `[{filename, content}]` |
| `CLARIFY_SYSTEM_PROMPT` | clarifying | Return JSON `{ questions: [...] }` |
| `AGENT_SYSTEM_PROMPT` | agent | Return JSON `{ files: [...], summary }` |

### JSON Repair

The AI sometimes returns content with invalid JSON escape sequences (e.g. `\s`, `\d` from regex, `\n` that should be `\\n` inside a JSON string). The `_try_parse_json()` helper:

```
1. Try json.loads(text)           -- fast path
2. If fails: fix all \ not followed by a valid JSON escape char
   regex: r'\\(?!["\\\\/bfnrtu])' → replace with \\\\
3. Try json.loads(fixed)          -- repaired path
4. If still fails: raise HTTP 502 with raw response excerpt
```

---

## 11. Backend — Pydantic Schemas

**File:** `backend/models/schemas.py`

### File Schemas
```python
FileCreateRequest   { path: str, content: str, is_directory: bool }
FileSaveRequest     { path: str, content: str }
FileRenameRequest   { old_path: str, new_path: str }
FileNode            { name, path, type, children?: List[FileNode] }
WorkspaceSetRequest { path: str }
WorkspaceInfo       { path: str }
```

### AI Schemas
```python
AIEditRequest       { file_path, content, prompt, model, mode }
AIEditResponse      { result: str, mode: str, model: str }

AIFolderGenerateRequest  { folder_path, prompt, model }
AIFolderGenerateFile     { filename, path, content }
AIFolderGenerateResponse { folder_path, files: List[AIFolderGenerateFile], model }

AIAgentRequest      { folder_path, prompt, model }
AIAgentResponse     { folder_path, created: List[str], summary, model }

AIClarifyingQuestionsRequest  { prompt, model }
AIClarifyingQuestion          { question, hint?: str }
AIClarifyingQuestionsResponse { questions: List[AIClarifyingQuestion], model }

ModelInfo           { id, label, provider }
```

### GitHub Schemas
```python
GitHubCommitRequest  { token, owner, repo, branch, message,
                       files: List[{path, content}] }
GitHubCommitResponse { success, commit_sha, message }
WorkflowTriggerRequest { token, owner, repo, workflow_id, ref, inputs }
```

---

## 12. Backend — Configuration

**File:** `backend/config.py`  
**Method:** Pydantic `BaseSettings` — reads from `backend/.env`

```env
# Required for LLM features
GROQ_API_KEY=gsk_...          # Free at console.groq.com
OPENAI_API_KEY=sk-...         # Optional — OpenAI models
ANTHROPIC_API_KEY=sk-ant-...  # Optional — Claude models
GEMINI_API_KEY=AIza...        # Optional — Google models

# Optional — defaults shown
OLLAMA_BASE_URL=http://localhost:11434
WORKSPACE_DIR=workspace       # Relative to backend/ folder
```

**`workspace_state.py`** — mutable runtime state:
```python
_workspace = os.path.abspath(settings.workspace_dir)

get_workspace() → str    # current absolute workspace path
set_workspace(path) → str  # change workspace at runtime + mkdir
```

This allows `POST /api/files/workspace` to switch the workspace path without a server restart.

---

## 13. File System Access: Two Modes

```
                 ┌─────────────────────────────────────────┐
                 │         editorStore file actions         │
                 │                                          │
                 │   if (directoryHandle) {                 │
                 │     // File System Access API            │
                 │     fsWriteFile(handle, path, content)   │
                 │     → writes to LOCAL DISK directly      │
                 │   } else {                               │
                 │     // Backend API fallback              │
                 │     api.saveFile(path, content)          │
                 │     → PUT /api/files/save                │
                 │     → backend/workspace/                 │
                 │   }                                      │
                 └─────────────────────────────────────────┘
```

| Feature | FS API Mode (📂 Open Folder) | Backend Mode |
|---------|------------------------------|--------------|
| Open folder | Native OS picker | Text prompt for absolute path |
| File writes | Direct to chosen directory | To `backend/workspace/` |
| Performance | Instant (no network) | Network round-trip |
| Browser support | Chrome/Edge 86+ only | Any browser |
| Backend required | Only for AI & execution | Yes |

---

## 14. Inline Diff Workflow

```
Chat panel                     Editor                     Store
──────────                     ──────                     ─────

User sends edit request
        │
        ▼
sendChatMessage()
        │ isEdit + activeFile
        ▼
api.editWithAI() ─────────────────────────────────────────► /api/ai/edit
                                                                  │
                                                                  ▼
                                                            LLM returns
                                                            modified code
                                                                  │
        ◄─────────────────────────────────────────────────────────┘
        │
proposeInlineEdit(path, result)
        │                         set inlineEditProposal
        │                                │
        │               MonacoEditor detects:
        │               inlineEditProposal.path === activeFile
        │                                │
        │                                ▼
        │                       Render <DiffEditor>
        │                       original = files[path]
        │                       modified = proposed
        │                       renderSideBySide: false
        │                                │
"I've made inline changes               │ [✓ Accept] clicked
 to filename — review in                │
 editor above"                          ▼
                               acceptInlineEdit()
                                        │
                               saveFileContent(path, proposed)
                                        │
                               fsWriteFile | api.saveFile
                                        │
                               inlineEditProposal = null
                                        │
                                        ▼
                               <Editor> mode restored
                               with updated content
```

---

## 15. Chat Routing Logic

`sendChatMessage(message)` in `editorStore.js` classifies every message:

```
message
   │
   ├── isSlashAgent   /create | /build | /generate | /scaffold | /new
   │
   ├── isNaturalAgent  verb ∈ {create,build,generate,scaffold,setup,
   │                           implement,make,write,develop,add,start}
   │                  AND topic ∈ {app,project,api,backend,frontend,
   │                               component,counter,todo,chat,auth,
   │                               dashboard,react,express,flask,...}
   │
   ├── isBareCreate   "create/build/make a X [app|project|service|...]"
   │
   │                     → AGENT PATH
   │                       api.generateInFolder({ folder_path, prompt })
   │                       returns file cards in chat
   │
   ├── isRunQuery     run | execute | launch | "how do I run..."
   │                     → mode='explain', terminal-commands prompt
   │
   ├── /fix           → mode='edit', fix bugs
   ├── /explain       → mode='explain'
   ├── /refactor      → mode='refactor'
   ├── /test          → mode='generate', write tests
   ├── /docs          → mode='edit', add documentation
   ├── /optimize      → mode='refactor', performance
   │
   └── default
         mode='edit' + activeFile   → api.editWithAI()
                                      → proposeInlineEdit()  ✓ inline diff
         mode='generate' (no file)  → api.editWithAI()
                                      → code in chat message
```

---

## 16. Deployment

### Development

```bash
# Backend
cd backend
pip install -r requirements.txt
cp .env.example .env   # add your GROQ_API_KEY
./start_backend.sh     # starts uvicorn on :8000

# Frontend
cd frontend
npm install
npm run dev            # starts Vite on :5173
```

### Docker Compose

```bash
docker-compose up --build
# Backend  → http://localhost:8000
# Frontend → http://localhost:5173
```

**`docker-compose.yml` services:**

| Service | Build | Port | Volume |
|---------|-------|------|--------|
| `backend` | `./backend/Dockerfile` | `8000:8000` | `./backend/workspace:/app/workspace` |
| `frontend` | `./frontend/Dockerfile` | `5173:80` | — |

Frontend is served via nginx (see `frontend/nginx.conf`).  
API calls from the browser to `/api/*` are proxied to `http://backend:8000/api/*`.

### Environment Variables

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `GROQ_API_KEY` | ✅ (for free LLM) | — | Groq cloud inference |
| `OPENAI_API_KEY` | Optional | `""` | GPT-4o / GPT-3.5 |
| `ANTHROPIC_API_KEY` | Optional | `""` | Claude models |
| `GEMINI_API_KEY` | Optional | `""` | Gemini models |
| `OLLAMA_BASE_URL` | Optional | `http://localhost:11434` | Local Ollama server |
| `WORKSPACE_DIR` | Optional | `workspace` | Default workspace directory |

---

*Documentation generated for the code-editor project — March 2026*
