import { create } from 'zustand';
import { api } from '../api';

const AI_MODES = ['edit', 'explain', 'refactor', 'generate'];

export const useEditorStore = create((set, get) => ({
  // ── File System ─────────────────────────────────────────────────────────────
  fileTree: [],
  files: {},           // path → content (string)
  openTabs: [],
  activeFile: null,
  unsavedFiles: [],    // array of paths with unsaved changes

  // ── Editor ──────────────────────────────────────────────────────────────────
  cursorPosition: { line: 1, column: 1 },

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

  loadFileTree: async () => {
    try {
      const tree = await api.getFileTree();
      set({ fileTree: tree });
    } catch (err) {
      console.error('loadFileTree:', err);
    }
  },

  openFile: async (path) => {
    const { files, openTabs } = get();
    if (files[path] === undefined) {
      try {
        const content = await api.readFile(path);
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
    const content = get().files[path];
    if (content === undefined) return;
    try {
      await api.saveFile(path, content);
      set((state) => ({
        unsavedFiles: state.unsavedFiles.filter((p) => p !== path),
      }));
    } catch (err) {
      console.error('saveFile:', err);
    }
  },

  createFile: async (path) => {
    await api.createFile(path, '');
    await get().loadFileTree();
  },

  createFolder: async (path) => {
    await api.createFolder(path);
    await get().loadFileTree();
  },

  deleteNode: async (path) => {
    const { openTabs } = get();
    await api.deleteFile(path);
    if (openTabs.includes(path)) get().closeTab(path);
    await get().loadFileTree();
  },

  renameNode: async (oldPath, newPath) => {
    const { openTabs, activeFile, files } = get();
    await api.renameFile(oldPath, newPath);

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
  // AI Actions
  // ─────────────────────────────────────────────────────────────────────────────

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
