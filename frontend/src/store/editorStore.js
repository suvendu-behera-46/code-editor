import { create } from 'zustand';
import { api } from '../api';
import {
  fsReadFile, fsWriteFile, fsCreateDir, fsDeleteEntry,
  fsRenameEntry, fsBuildTree,
} from '../utils/fileSystemHelper';

const AI_MODES = ['edit', 'explain', 'refactor', 'generate'];

// Extract multiple proposed files from an AI text response
function extractPendingFilesFromText(rawText) {
  const files = [];
  const seen = new Set();

  // 1) Heading-backed code blocks: **path/file.ext**, ### path/file.ext, or "File: path/file.ext"
  const headingRe = /(?:^|\n)[ \t]*(?:\*{1,2}([^*\n`]+\.[a-zA-Z0-9]+)\*{0,2}|#{1,3}\s+([^\n]+\.[a-zA-Z0-9]+)|\*?(?:File|Filename|Path)[:\s]+([^\n*`]+\.[a-zA-Z0-9]+)\*?)[^\n]*\n[ \t]*```[^\n]*\n([\s\S]*?)```/g;
  let m;
  while ((m = headingRe.exec(rawText)) !== null) {
    const rawPath = (m[1] || m[2] || m[3])?.trim().replace(/[*`]/g, '');
    const content = m[4]?.trim() || '';
    if (rawPath && content && !seen.has(rawPath)) {
      seen.add(rawPath);
      files.push({ path: rawPath, content, filename: rawPath.split('/').pop(), status: 'pending' });
    }
  }

  // 2) Fallback: first comment line inside code block
  if (files.length === 0) {
    const codeRe = /```[ \t]*\w*[ \t]*\n([\s\S]*?)```/g;
    while ((m = codeRe.exec(rawText)) !== null) {
      const code = m[1];
      const firstLine = code.split('\n')[0];
      const match = firstLine.match(/^(?:#|\/\/|<!--)\s*(?:file[:\s]+|filename[:\s]+)?([/\w\-.]+\.[a-zA-Z0-9]+)/i);
      if (match && !seen.has(match[1])) {
        seen.add(match[1]);
        files.push({ path: match[1], content: code.trim(), filename: match[1].split('/').pop(), status: 'pending' });
      }
    }
  }

  return files;
}

export const useEditorStore = create((set, get) => ({
  // ── File System ─────────────────────────────────────────────────────────────
  fileTree: [],
  files: {},           // path → content (string)
  openTabs: [],
  activeFile: null,
  unsavedFiles: [],    // array of paths with unsaved changes
  selectedFolder: '',     // folder path context for new file/folder creation, '' = root
  workspacePath: '',      // display name of the open folder
  directoryHandle: null,  // FileSystemDirectoryHandle — set when user opens a local folder
  // ── Editor ──────────────────────────────────────────────────────────────────
  cursorPosition: { line: 1, column: 1 },
  inlineEditProposal: null, // { path, original, proposed } — diff shown inline in Monaco

  // ── AI ──────────────────────────────────────────────────────────────────────
  aiPanelOpen: true,
  aiMode: 'edit',          // edit | explain | refactor | generate
  aiTargetType: 'file',    // 'file' | 'folder' | 'agent'
  aiTargetFolder: '',      // workspace-relative path, '' = root
  selectedModel: 'groq/llama-3.3-70b-versatile',
  aiPrompt: '',
  aiResponse: null,        // { result, mode, model } | null
  pendingFiles: [],        // [{filename, path, content}] — AI-proposed, awaiting accept/skip
  pendingFolderPath: '',   // folder context for the pending batch
  aiLoading: false,
  aiError: null,
  // Agent mode state
  agentLog: [],            // [{type: 'info'|'success'|'error', text: string}]
  agentLoading: false,
  // Clarifying questions state
  clarifyingQuestions: [], // [{question: string, hint?: string}]
  clarifyingAnswers: {},   // { questionIndex: answer_text }
  showClarifyingDialog: false,

  // ── Chat (Copilot-style) ────────────────────────────────────────────────────
  chatMessages: [],   // [{id, role: 'user'|'assistant'|'error', content, timestamp}]
  chatLoading: false,

  // ── GitHub ──────────────────────────────────────────────────────────────────
  githubPanelOpen: false,
  githubToken: localStorage.getItem('gh_token') || '',
  githubUser: null,
  repoOwner: '',
  repoName: '',
  repoBranch: 'main',
  commitMessage: '',
  githubStatus: null,   // { type: 'success'|'error', message }

  // ── Terminal ─────────────────────────────────────────────────────────────────
  terminalOpen: true,
  terminalOutput: '',
  terminalHistory: [],       // [{code, language, timestamp, output}]
  terminalRunning: false,
  terminalError: null,

  // ─────────────────────────────────────────────────────────────────────────────
  // File Actions
  // ─────────────────────────────────────────────────────────────────────────────

  // Open a real local folder via native picker — all file ops then use the FS API directly
  openFolder: async () => {
    if (!window.showDirectoryPicker) {
      alert('Your browser does not support the File System Access API.\nUse Chrome or Edge 86+.');
      return;
    }
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      set({
        directoryHandle: handle,
        workspacePath: handle.name,
        fileTree: [],
        files: {},
        openTabs: [],
        activeFile: null,
        unsavedFiles: [],
      });
      await get().loadFileTree();
    } catch (err) {
      if (err.name !== 'AbortError') console.error('openFolder:', err);
    }
  },

  loadFileTree: async () => {
    const { directoryHandle } = get();
    try {
      if (directoryHandle) {
        const tree = await fsBuildTree(directoryHandle);
        set({ fileTree: tree });
      } else {
        const tree = await api.getFileTree();
        set({ fileTree: tree });
        try {
          const ws = await api.getWorkspace();
          set({ workspacePath: ws.path });
        } catch { /* non-critical */ }
      }
    } catch (err) {
      console.error('loadFileTree:', err);
    }
  },

  openFile: async (path) => {
    const { files, openTabs, directoryHandle } = get();
    if (files[path] === undefined) {
      try {
        const content = directoryHandle
          ? await fsReadFile(directoryHandle, path)
          : await api.readFile(path);
        set((state) => ({ files: { ...state.files, [path]: content } }));
      } catch (err) {
        console.error('openFile:', err);
        return;
      }
    }
    set((state) => ({
      openTabs: state.openTabs.includes(path) ? state.openTabs : [...state.openTabs, path],
      activeFile: path,
    }));
  },

  closeTab: (path) => {
    const { openTabs, activeFile } = get();
    const idx = openTabs.indexOf(path);
    const newTabs = openTabs.filter((t) => t !== path);
    const newUnsaved = get().unsavedFiles.filter((p) => p !== path);
    let newActive = activeFile;
    if (activeFile === path) {
      newActive = newTabs[Math.max(0, idx - 1)] ?? newTabs[0] ?? null;
    }
    set({ openTabs: newTabs, activeFile: newActive, unsavedFiles: newUnsaved });
  },

  setActiveFile: (path) => set({ activeFile: path }),

  setFileContent: (path, content) => {
    set((state) => ({
      files: { ...state.files, [path]: content },
      unsavedFiles: state.unsavedFiles.includes(path)
        ? state.unsavedFiles
        : [...state.unsavedFiles, path],
    }));
  },

  saveFile: async (path) => {
    const { files, directoryHandle } = get();
    const content = files[path];
    if (content === undefined) return;
    try {
      if (directoryHandle) {
        await fsWriteFile(directoryHandle, path, content);
      } else {
        await api.saveFile(path, content);
      }
      set((state) => ({
        unsavedFiles: state.unsavedFiles.filter((p) => p !== path),
      }));
    } catch (err) {
      console.error('saveFile:', err);
    }
  },

  // Write any content directly to a path (used by AIPanel "Apply in Editor")
  saveFileContent: async (path, content) => {
    const { directoryHandle } = get();
    if (directoryHandle) {
      await fsWriteFile(directoryHandle, path, content);
    } else {
      await api.saveFile(path, content);
    }
    set((state) => ({
      files: { ...state.files, [path]: content },
      unsavedFiles: state.unsavedFiles.filter((p) => p !== path),
    }));
  },

  createFile: async (path, content = '') => {
    const { directoryHandle } = get();
    if (directoryHandle) {
      await fsWriteFile(directoryHandle, path, content);
    } else {
      await api.createFile(path, content);
    }
    await get().loadFileTree();
  },

  createFolder: async (path) => {
    const { directoryHandle } = get();
    if (directoryHandle) {
      await fsCreateDir(directoryHandle, path);
    } else {
      await api.createFolder(path);
    }
    await get().loadFileTree();
  },

  setSelectedFolder: (path) => set({ selectedFolder: path }),

  setWorkspace: async (absPath) => {
    try {
      const result = await api.setWorkspace(absPath);
      set({ workspacePath: result.path, fileTree: [], files: {}, openTabs: [], activeFile: null, unsavedFiles: [] });
      await get().loadFileTree();
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || 'Failed to set workspace.';
      throw new Error(msg);
    }
  },

  deleteNode: async (path) => {
    const { openTabs, directoryHandle } = get();
    if (directoryHandle) {
      await fsDeleteEntry(directoryHandle, path);
    } else {
      await api.deleteFile(path);
    }
    if (openTabs.includes(path)) get().closeTab(path);
    await get().loadFileTree();
  },

  renameNode: async (oldPath, newPath) => {
    const { openTabs, activeFile, files, directoryHandle } = get();
    if (directoryHandle) {
      await fsRenameEntry(directoryHandle, oldPath, newPath);
    } else {
      await api.renameFile(oldPath, newPath);
    }

    const newTabs = openTabs.map((t) => (t === oldPath ? newPath : t));
    const newFiles = { ...files };
    if (newFiles[oldPath] !== undefined) {
      newFiles[newPath] = newFiles[oldPath];
      delete newFiles[oldPath];
    }
    set({
      openTabs: newTabs,
      activeFile: activeFile === oldPath ? newPath : activeFile,
      files: newFiles,
    });
    await get().loadFileTree();
  },

  setCursorPosition: (line, column) => set({ cursorPosition: { line, column } }),

  // ─────────────────────────────────────────────────────────────────────────────
  // Inline Edit (Copilot-style inline diff in Monaco)
  // ─────────────────────────────────────────────────────────────────────────────

  // Stage a proposed change for the active file — triggers inline diff view
  proposeInlineEdit: (path, proposed) => {
    const { files } = get();
    const original = files[path] ?? '';
    set({ inlineEditProposal: { path, original, proposed } });
  },

  // Accept the proposal: write content to disk and clear the diff
  acceptInlineEdit: async () => {
    const { inlineEditProposal } = get();
    if (!inlineEditProposal) return;
    const { path, proposed } = inlineEditProposal;
    set({ inlineEditProposal: null });
    await get().saveFileContent(path, proposed);
  },

  // Discard the proposal without applying anything
  discardInlineEdit: () => set({ inlineEditProposal: null }),

  setAIMode: (mode) => set({ aiMode: mode, aiResponse: null, pendingFiles: [], aiError: null }),
  setSelectedModel: (model) => set({ selectedModel: model }),
  setAIPrompt: (prompt) => set({ aiPrompt: prompt }),
  setAITargetType: (type) => set({ aiTargetType: type, aiResponse: null, pendingFiles: [], aiError: null, agentLog: [] }),
  setAITargetFolder: (folder) => set({ aiTargetFolder: folder }),
  toggleAIPanel: () => set((state) => ({ aiPanelOpen: !state.aiPanelOpen })),
  clearAIResponse: () => set({ aiResponse: null, pendingFiles: [], pendingFolderPath: '', aiError: null }),

  runAI: async () => {
    const { activeFile, files, aiMode, selectedModel, aiPrompt } = get();
    if (!aiPrompt.trim()) {
      set({ aiError: 'Enter a prompt.' });
      return;
    }
    set({ aiLoading: true, aiResponse: null, aiError: null });
    try {
      const content = activeFile ? (files[activeFile] ?? '') : '';
      const response = await api.editWithAI({
        file_path: activeFile || '',
        content,
        prompt: aiPrompt,
        model: selectedModel,
        mode: aiMode,
      });
      set({ aiResponse: response, aiLoading: false });
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || 'AI request failed.';
      set({ aiError: msg, aiLoading: false });
    }
  },

  applyAIResult: () => {
    const { aiResponse, activeFile } = get();
    if (!aiResponse || !activeFile) return;
    set((state) => ({
      files: { ...state.files, [activeFile]: aiResponse.result },
      unsavedFiles: state.unsavedFiles.includes(activeFile)
        ? state.unsavedFiles
        : [...state.unsavedFiles, activeFile],
    }));
  },

  saveAIGeneratedFile: async (filename) => {
    const { aiResponse } = get();
    if (!aiResponse || !filename?.trim()) return;
    const path = filename.trim();
    try {
      await api.saveFile(path, aiResponse.result);
      await get().loadFileTree();
      set((state) => ({
        files: { ...state.files, [path]: aiResponse.result },
        openTabs: state.openTabs.includes(path) ? state.openTabs : [...state.openTabs, path],
        activeFile: path,
      }));
    } catch (err) {
      console.error('saveAIGeneratedFile:', err);
    }
  },

  runAIFolder: async () => {
    const { aiTargetFolder, selectedModel, aiPrompt } = get();
    if (!aiPrompt.trim()) {
      set({ aiError: 'Enter a description of what to generate.' });
      return;
    }
    set({ aiLoading: true, pendingFiles: [], pendingFolderPath: '', aiError: null });
    try {
      const response = await api.generateInFolder({
        folder_path: aiTargetFolder,
        prompt: aiPrompt,
        model: selectedModel,
      });
      // Don’t write anything — surface as pending for user review
      set({
        pendingFiles: response.files,
        pendingFolderPath: response.folder_path,
        aiLoading: false,
      });
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || 'Folder generation failed.';
      set({ aiError: msg, aiLoading: false });
    }
  },

  // Accept a single pending file: write it to disk and open it
  acceptPendingFile: async (filePath, content) => {
    try {
      await api.saveFile(filePath, content);
      await get().loadFileTree();
      await get().openFile(filePath);
      set((state) => ({
        pendingFiles: state.pendingFiles.filter((f) => f.path !== filePath),
      }));
    } catch (err) {
      console.error('acceptPendingFile:', err);
    }
  },

  // Dismiss a single pending file without saving
  skipPendingFile: (filePath) => {
    set((state) => ({
      pendingFiles: state.pendingFiles.filter((f) => f.path !== filePath),
    }));
  },

  // Accept all pending files at once
  acceptAllPendingFiles: async () => {
    const { pendingFiles } = get();
    for (const f of pendingFiles) {
      try { await api.saveFile(f.path, f.content); } catch { /* skip errors */ }
    }
    await get().loadFileTree();
    if (pendingFiles.length > 0) await get().openFile(pendingFiles[0].path);
    set({ pendingFiles: [], pendingFolderPath: '' });
  },

  // Discard all pending files without saving
  discardAllPendingFiles: () => set({ pendingFiles: [], pendingFolderPath: '' }),

  // ─────────────────────────────────────────────────────────────────────────────
  // Agent Mode — autonomous scaffolding, writes all files immediately
  // ─────────────────────────────────────────────────────────────────────────────

  clearAgentLog: () => set({ agentLog: [] }),

  // Ask clarifying questions before running agent
  askClarifyingQuestions: async () => {
    const { aiPrompt, selectedModel } = get();
    if (!aiPrompt.trim()) {
      set({ aiError: 'Enter a description of what to build.' });
      return;
    }
    try {
      const response = await api.askClarifyingQuestions({
        prompt: aiPrompt,
        model: selectedModel,
      });
      set({
        clarifyingQuestions: response.questions,
        clarifyingAnswers: {},
        showClarifyingDialog: true,
      });
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || 'Failed to generate questions.';
      set({ aiError: msg });
    }
  },

  // Update answer for a specific question
  updateClarifyingAnswer: (questionIndex, answer) => {
    const { clarifyingAnswers } = get();
    set({
      clarifyingAnswers: {
        ...clarifyingAnswers,
        [questionIndex]: answer,
      },
    });
  },

  // Run agent with clarifying answers
  runAgentWithAnswers: async () => {
    const { aiTargetFolder, selectedModel, aiPrompt, clarifyingAnswers, clarifyingQuestions } = get();
    
    // Combine prompt with answers
    let combinedPrompt = aiPrompt;
    clarifyingQuestions.forEach((q, i) => {
      const answer = clarifyingAnswers[i];
      if (answer?.trim()) {
        combinedPrompt += `\n\n• ${q.question}\nAnswer: ${answer}`;
      }
    });

    // Close dialog and run agent
    set({ showClarifyingDialog: false, agentLoading: true, agentLog: [], aiError: null });
    
    try {
      const response = await api.agentRun({
        folder_path: aiTargetFolder,
        prompt: combinedPrompt,
        model: selectedModel,
      });
      await get().loadFileTree();
      if (response.created.length > 0) {
        await get().openFile(response.created[0]);
      }
      set({
        agentLog: [
          { type: 'success', text: response.summary },
          ...response.created.map((p) => ({ type: 'created', text: p })),
        ],
        agentLoading: false,
        clarifyingQuestions: [],
        clarifyingAnswers: {},
      });
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || 'Agent failed.';
      set({ agentLog: [{ type: 'error', text: msg }], agentLoading: false });
    }
  },

  closeClarifyingDialog: () => set({ showClarifyingDialog: false, clarifyingQuestions: [], clarifyingAnswers: {} }),

  // ─────────────────────────────────────────────────────────────────────────────
  // Chat Actions (Copilot-style)
  // ─────────────────────────────────────────────────────────────────────────────

  clearChat: () => set({ chatMessages: [] }),

  chatAcceptFile: async (msgId, filePath) => {
    const { chatMessages, directoryHandle } = get();
    const msg = chatMessages.find((m) => m.id === msgId);
    const file = msg?.pendingFiles?.find((f) => f.path === filePath);
    if (!file) return;
    try {
      if (directoryHandle) {
        await fsWriteFile(directoryHandle, file.path, file.content);
      } else {
        await api.saveFile(file.path, file.content);
      }
      await get().loadFileTree();
      await get().openFile(file.path);
      set((state) => ({
        chatMessages: state.chatMessages.map((m) =>
          m.id !== msgId ? m : {
            ...m,
            pendingFiles: m.pendingFiles.map((f) => f.path === filePath ? { ...f, status: 'accepted' } : f),
          }
        ),
      }));
    } catch (err) {
      const errText = err.message || 'Failed to save file.';
      set((state) => ({
        chatMessages: [
          ...state.chatMessages,
          { id: Date.now(), role: 'error', content: `Could not save **${filePath}**: ${errText}`, timestamp: new Date().toISOString() },
        ],
      }));
    }
  },

  chatSkipFile: (msgId, filePath) => {
    set((state) => ({
      chatMessages: state.chatMessages.map((m) =>
        m.id !== msgId ? m : {
          ...m,
          pendingFiles: m.pendingFiles.map((f) => f.path === filePath ? { ...f, status: 'skipped' } : f),
        }
      ),
    }));
  },

  chatAcceptAllFiles: async (msgId) => {
    const { chatMessages, directoryHandle } = get();
    const msg = chatMessages.find((m) => m.id === msgId);
    if (!msg?.pendingFiles) return;
    const pending = msg.pendingFiles.filter((f) => f.status === 'pending');

    const savedPaths = new Set();
    const failedPaths = [];

    for (const f of pending) {
      try {
        if (directoryHandle) {
          await fsWriteFile(directoryHandle, f.path, f.content);
        } else {
          await api.saveFile(f.path, f.content);
        }
        savedPaths.add(f.path);
      } catch (err) {
        const reason = err.message || 'unknown error';
        failedPaths.push(`${f.path} (${reason})`);
      }
    }

    await get().loadFileTree();

    // Open the first successfully saved file
    const firstSaved = pending.find((f) => savedPaths.has(f.path));
    if (firstSaved) await get().openFile(firstSaved.path);

    // Update statuses: only mark 'accepted' if actually saved
    set((state) => ({
      chatMessages: state.chatMessages.map((m) =>
        m.id !== msgId ? m : {
          ...m,
          pendingFiles: m.pendingFiles.map((f) => {
            if (f.status !== 'pending') return f;
            return { ...f, status: savedPaths.has(f.path) ? 'accepted' : 'pending' };
          }),
        }
      ),
    }));

    // Show error summary if any files failed
    if (failedPaths.length > 0) {
      set((state) => ({
        chatMessages: [
          ...state.chatMessages,
          {
            id: Date.now(),
            role: 'error',
            content: `Failed to save ${failedPaths.length} file(s):\n${failedPaths.map((p) => `• ${p}`).join('\n')}`,
            timestamp: new Date().toISOString(),
          },
        ],
      }));
    }
  },

  chatDiscardAllFiles: (msgId) => {
    set((state) => ({
      chatMessages: state.chatMessages.map((m) =>
        m.id !== msgId ? m : {
          ...m,
          pendingFiles: m.pendingFiles.map((f) => ({ ...f, status: f.status === 'pending' ? 'skipped' : f.status })),
        }
      ),
    }));
  },

  sendChatMessage: async (message) => {
    const { activeFile, files, selectedModel, chatMessages } = get();
    const userMsg = { id: Date.now(), role: 'user', content: message, timestamp: new Date().toISOString() };
    set({ chatMessages: [...chatMessages, userMsg], chatLoading: true });

    const lower = message.toLowerCase().replace(/^\/\w+\s*/, '');

    // ── Agent detection: route to generateInFolder ──────────────────────────
    // Slash commands always trigger agent mode
    const isSlashAgent = /^\/(?:generate|create|new|build|scaffold)\b/i.test(message.trim());

    // Natural language: any request to create/build a project, feature, or set of files
    const isNaturalAgent =
      /\b(create|build|generate|scaffold|set up|setup|implement|make|write|develop|add|start|crate|buid|generat)\b/.test(lower) &&
      /\b(backend|frontend|api|app|apps|application|project|server|service|endpoint|component|page|module|feature|fullstack|full.?stack|routes?|controllers?|models?|middleware|database|schema|rest|graphql|express|flask|django|react|vue|angular|next\.?js|separate|new|counter|todo|chat|auth|login|dashboard|portfolio|blog|shop|store|calculator|weather|notes?|timer|clock|game|quiz|form|crud)\b/.test(lower);

    // Also catch bare "create a X" / "build a X" patterns where X is any multi-word noun phrase
    const isBareCreatePattern = /\b(create|build|make|generate|write)\s+(?:a|an|the)?\s+\w+(?:\s+\w+){0,3}\s+(?:app|application|project|website|site|tool|program|script|service|api|server|component|feature|page)\b/i.test(message);

    const isAgentRequest = isSlashAgent || isNaturalAgent || isBareCreatePattern;

    if (isAgentRequest) {
      const basePrompt = message.replace(/^\/(?:generate|create|new|build|scaffold)\s*/i, '').trim() || message;

      // Enrich the prompt with currently open file context so AI understands the project
      let enrichedPrompt = basePrompt;
      if (activeFile) {
        const currentContent = files[activeFile] ?? '';
        enrichedPrompt = `${basePrompt}\n\nFor context, here is the currently open file (${activeFile}):\n\`\`\`\n${currentContent.slice(0, 3000)}\n\`\`\`\nUse this to understand the project structure and generate matching/compatible code.`;
      }

      // Extract a meaningful folder name from the prompt
      // Exclude ambiguous pronouns and generic words that aren't real folder names
      const EXCLUDED_WORDS = new Set(['this','that','the','a','an','my','our','your','it','its','new','here','there','existing','current','same','another']);
      const folderMatch = basePrompt.match(/\b(?:in|into|inside|under|named?|called?|folder)\s+["']?([\w][\w-]*)[\'"']?/i);
      const rawFolder = folderMatch ? folderMatch[1].toLowerCase() : '';
      // Also try to extract a name from phrases like "a backend called myapp" or "an app named myapp"
      const namedMatch = !rawFolder || EXCLUDED_WORDS.has(rawFolder)
        ? basePrompt.match(/\b(?:named?|called?)\s+["']?([\w][\w-]{1,})["']?/i)
        : null;
      const folder_path = (namedMatch ? namedMatch[1] : (EXCLUDED_WORDS.has(rawFolder) ? '' : rawFolder));

      try {
        const response = await api.generateInFolder({ folder_path, prompt: enrichedPrompt, model: selectedModel });
        const pendingFiles = (response.files || []).map((f) => ({ ...f, status: 'pending' }));
        const assistantMsg = {
          id: Date.now() + 1,
          role: 'assistant',
          content: pendingFiles.length > 0
            ? `I've prepared **${pendingFiles.length} file${pendingFiles.length > 1 ? 's' : ''}** — review and accept:`
            : 'No files were generated. Try being more specific.',
          pendingFiles,
          timestamp: new Date().toISOString(),
        };
        set((state) => ({ chatMessages: [...state.chatMessages, assistantMsg], chatLoading: false }));
      } catch (err) {
        const text = err.response?.data?.detail || err.message || 'Request failed.';
        set((state) => ({ chatMessages: [...state.chatMessages, { id: Date.now() + 1, role: 'error', content: text }], chatLoading: false }));
      }
      return;
    }

    // ── Single-file / explain / refactor path ───────────────────────────────
    const isRunQuery = /\b(run|execute|launch)\b/.test(lower) || /\bhow (do i|to) (run|start|launch|execute)\b/.test(lower);
    let mode = 'edit';
    if (isRunQuery) mode = 'explain';
    else if (message.startsWith('/explain') || lower.startsWith('explain') || lower.startsWith('what') || lower.startsWith('how does') || lower.startsWith('how do') || lower.startsWith('how to') || lower.startsWith('why')) mode = 'explain';
    else if (message.startsWith('/refactor') || lower.includes('refactor') || lower.includes('clean up')) mode = 'refactor';
    else if (!activeFile || message.startsWith('/test')) mode = 'generate';

    let prompt = message.trim();
    if (isRunQuery) {
      const target = activeFile ? `the file "${activeFile}"` : 'this project';
      prompt = `How do I run ${target}? Give me the exact terminal commands and any setup steps (e.g. installing dependencies). Explain what each command does. Do NOT rewrite the code.`;
    } else if (message.startsWith('/fix'))      prompt = ('Fix all bugs, errors, and issues. ' + message.replace(/^\/fix\s*/i, '')).trim();
    else if (message.startsWith('/explain'))  prompt = message.replace(/^\/explain\s*/i, '') || 'Explain what this code does in detail.';
    else if (message.startsWith('/refactor')) prompt = ('Refactor for better readability, maintainability, and quality. ' + message.replace(/^\/refactor\s*/i, '')).trim();
    else if (message.startsWith('/test'))     prompt = ('Write comprehensive unit tests. ' + message.replace(/^\/test\s*/i, '')).trim();
    else if (message.startsWith('/docs'))     prompt = ('Add clear documentation and comments. ' + message.replace(/^\/docs\s*/i, '')).trim();
    else if (message.startsWith('/optimize')) { mode = 'refactor'; prompt = ('Optimize for performance. ' + message.replace(/^\/optimize\s*/i, '')).trim(); }

    try {
      const content = activeFile ? (files[activeFile] ?? '') : '';
      const response = await api.editWithAI({ file_path: activeFile || '', content, prompt, model: selectedModel, mode });

      // ── Edit mode on an open file → propose inline diff automatically ────────
      // (just like VS Code Copilot — the diff appears in the editor, a brief
      //  confirmation message appears in the chat)
      if (mode === 'edit' && activeFile) {
        get().proposeInlineEdit(activeFile, response.result);
        const fname = activeFile.split('/').pop();
        const confirmMsg = {
          id: Date.now() + 1,
          role: 'assistant',
          content: `I've made inline changes to **${fname}** — review the diff in the editor above and click **✓ Accept** or **✗ Discard**.`,
          mode,
          pendingFiles: [],
          timestamp: new Date().toISOString(),
        };
        set((state) => ({ chatMessages: [...state.chatMessages, confirmMsg], chatLoading: false }));
        return;
      }

      // ── All other modes (explain / refactor / generate) ───────────────────
      // Try to extract multiple file proposals from the response
      const pendingFiles = extractPendingFilesFromText(response.result);

      const assistantMsg = {
        id: Date.now() + 1,
        role: 'assistant',
        content: response.result,
        mode,
        pendingFiles: pendingFiles.length > 1 ? pendingFiles : [],
        timestamp: new Date().toISOString(),
      };
      set((state) => ({ chatMessages: [...state.chatMessages, assistantMsg], chatLoading: false }));
    } catch (err) {
      const text = err.response?.data?.detail || err.message || 'Request failed.';
      set((state) => ({ chatMessages: [...state.chatMessages, { id: Date.now() + 1, role: 'error', content: text }], chatLoading: false }));
    }
  },

  runAgent: async () => {
    const { aiPrompt } = get();
    if (!aiPrompt.trim()) {
      set({ aiError: 'Enter a description of what to build.' });
      return;
    }
    // First ask clarifying questions
    await get().askClarifyingQuestions();
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // GitHub Actions
  // ─────────────────────────────────────────────────────────────────────────────

  setGithubToken: (token) => {
    localStorage.setItem('gh_token', token);
    set({ githubToken: token });
  },

  setGithubUser: (user) => set({ githubUser: user }),
  setRepoOwner: (v) => set({ repoOwner: v }),
  setRepoName: (v) => set({ repoName: v }),
  setRepoBranch: (v) => set({ repoBranch: v }),
  setCommitMessage: (v) => set({ commitMessage: v }),
  setGithubStatus: (status) => set({ githubStatus: status }),
  toggleGitHubPanel: () =>
    set((state) => ({ githubPanelOpen: !state.githubPanelOpen, aiPanelOpen: state.githubPanelOpen ? state.aiPanelOpen : false })),

  // ─────────────────────────────────────────────────────────────────────────────
  // Terminal Actions
  // ─────────────────────────────────────────────────────────────────────────────

  executeCode: async (code, language = 'python', cwd = null) => {
    set({ terminalRunning: true, terminalError: null });
    try {
      const response = await api.executeCode({ code, language, timeout: 60, cwd });
      let output = '';
      
      // For shell commands, show the command first
      if (language === 'shell' || language === 'bash' || language === 'cmd') {
        output = `$ ${code}\n`;
      }
      
      // Add stdout
      if (response.output) {
        output += response.output;
      }
      
      // Add stderr with error formatting
      if (response.error) {
        output += (response.output ? '' : '') + response.error;
      }
      
      // Add newline at end if output doesn't have one
      if (output && !output.endsWith('\n')) {
        output += '\n';
      }
      
      set((state) => ({
        terminalOutput: state.terminalOutput + output,
        terminalHistory: [
          ...state.terminalHistory,
          { code, language, timestamp: new Date().toISOString(), output },
        ],
        terminalRunning: false,
      }));
    } catch (err) {
      const errorMsg = `Error executing code: ${err.message}`;
      set((state) => ({
        terminalOutput: state.terminalOutput + `\n[ERROR] ${errorMsg}\n`,
        terminalError: errorMsg,
        terminalRunning: false,
      }));
    }
  },

  clearTerminal: () => set({ terminalOutput: '', terminalError: null }),

  toggleTerminal: () => set((state) => ({ terminalOpen: !state.terminalOpen })),
}));
