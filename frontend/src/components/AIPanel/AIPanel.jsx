import React, { useMemo } from 'react';
import { useEditorStore } from '../../store/editorStore';

/** Recursively collect all folder paths from the file tree. */
function getFolders(nodes, acc = []) {
  for (const node of nodes) {
    if (node.type === 'folder') {
      acc.push(node.path);
      if (node.children) getFolders(node.children, acc);
    }
  }
  return acc;
}

const AI_MODES = [
  { id: 'edit', label: 'Edit', hint: 'Modify the file based on your instruction' },
  { id: 'explain', label: 'Explain', hint: 'Explain what this code does' },
  { id: 'refactor', label: 'Refactor', hint: 'Improve code quality and structure' },
  { id: 'generate', label: 'Generate', hint: 'Generate code from a description' },
];

const MODELS = [
  // Free tier (sign up at console.groq.com — no credit card)
  { id: 'groq/llama-3.3-70b-versatile', label: 'Llama 3.3 70B (Free)', provider: 'Groq (Free)' },
  { id: 'groq/llama-3.1-8b-instant',    label: 'Llama 3.1 8B – Fast (Free)', provider: 'Groq (Free)' },
  { id: 'groq/mixtral-8x7b-32768',      label: 'Mixtral 8x7B (Free)', provider: 'Groq (Free)' },
  { id: 'groq/gemma2-9b-it',            label: 'Gemma 2 9B (Free)', provider: 'Groq (Free)' },
  // Local / Ollama (install from ollama.com then run: ollama pull <model>)
  { id: 'ollama/llama3.2',        label: 'Llama 3.2 (Local)',      provider: 'Ollama (Local)' },
  { id: 'ollama/mistral',         label: 'Mistral 7B (Local)',     provider: 'Ollama (Local)' },
  { id: 'ollama/codellama',       label: 'CodeLlama (Local)',      provider: 'Ollama (Local)' },
  { id: 'ollama/deepseek-coder',  label: 'DeepSeek Coder (Local)', provider: 'Ollama (Local)' },
  // Paid providers
  { id: 'gpt-4o',           label: 'GPT-4o',           provider: 'OpenAI' },
  { id: 'gpt-4-turbo',      label: 'GPT-4 Turbo',      provider: 'OpenAI' },
  { id: 'gpt-3.5-turbo',    label: 'GPT-3.5 Turbo',    provider: 'OpenAI' },
  { id: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet', provider: 'Anthropic' },
  { id: 'claude-3-opus-20240229',     label: 'Claude 3 Opus',     provider: 'Anthropic' },
  { id: 'claude-3-haiku-20240307',    label: 'Claude 3 Haiku',    provider: 'Anthropic' },
  { id: 'gemini-1.5-pro',   label: 'Gemini 1.5 Pro',   provider: 'Google' },
  { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash', provider: 'Google' },
];

const CODE_MODES = ['edit', 'refactor', 'generate'];

function renderMarkdown(text) {
  // Very minimal markdown: bold, inline code, line breaks
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br/>');
}

export default function AIPanel() {
  const {
    activeFile,
    fileTree,
    aiMode, setAIMode,
    aiTargetType, setAITargetType,
    aiTargetFolder, setAITargetFolder,
    selectedModel, setSelectedModel,
    aiPrompt, setAIPrompt,
    aiResponse, aiLoading, aiError,
    pendingFiles, pendingFolderPath,
    runAI, runAIFolder,
    applyAIResult, saveAIGeneratedFile, clearAIResponse,
    acceptPendingFile, skipPendingFile,
    acceptAllPendingFiles, discardAllPendingFiles,
    openFile,
    agentLog, agentLoading, runAgent, clearAgentLog,
    clarifyingQuestions, clarifyingAnswers, showClarifyingDialog,
    updateClarifyingAnswer, runAgentWithAnswers, closeClarifyingDialog,
    executeCode,
  } = useEditorStore();

  const folders = useMemo(() => getFolders(fileTree || []), [fileTree]);
  const isFolderTarget = aiTargetType === 'folder';
  const isAgentMode = aiTargetType === 'agent';
  const currentMode = AI_MODES.find((m) => m.id === aiMode);
  const isCodeMode = CODE_MODES.includes(aiMode);
  const providers = useMemo(() => [...new Set(MODELS.map((m) => m.provider))], []);

  const handleKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (isAgentMode) runAgent();
      else if (isFolderTarget) runAIFolder();
      else runAI();
    }
  };

  return (
    <div className="ai-panel">
      {/* Panel header */}
      <div className="panel-header">
        <span className="panel-title">AI Assistant</span>
      </div>

      {/* Target type toggle: File vs Folder vs Agent */}
      <div className="ai-panel__target-toggle">
        <button
          className={`ai-panel__target-btn${!isFolderTarget && !isAgentMode ? ' active' : ''}`}
          onClick={() => setAITargetType('file')}
        >
          📄 File
        </button>
        <button
          className={`ai-panel__target-btn${isFolderTarget ? ' active' : ''}`}
          onClick={() => setAITargetType('folder')}
        >
          📁 Folder
        </button>
        <button
          className={`ai-panel__target-btn${isAgentMode ? ' active' : ''}`}
          onClick={() => setAITargetType('agent')}
          title="Agent mode — AI builds the full project automatically"
        >
          🤖 Agent
        </button>
      </div>

      {/* Context row */}
      {isAgentMode ? (
        /* Agent: folder selector (same as folder mode) */
        <div className="ai-panel__folder-row">
          <div className="ai-panel__model-label">Target folder (leave empty for workspace root)</div>
          <input
            list="ai-agent-folder-list"
            className="ai-panel__folder-input"
            placeholder="e.g. my-react-app"
            value={aiTargetFolder}
            onChange={(e) => setAITargetFolder(e.target.value)}
            spellCheck={false}
          />
          <datalist id="ai-agent-folder-list">
            <option value="" label="/ (workspace root)" />
            {folders.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
          <div style={{ fontSize: 10, color: 'var(--text-disabled)', marginTop: 3 }}>
            Folder will be created if it doesn't exist
          </div>
        </div>
      ) : isFolderTarget ? (
        /* Folder selector */
        <div className="ai-panel__folder-row">
          <div className="ai-panel__model-label">Target folder (leave empty for workspace root)</div>
          <input
            list="ai-folder-list"
            className="ai-panel__folder-input"
            placeholder="e.g. src/components/Button"
            value={aiTargetFolder}
            onChange={(e) => setAITargetFolder(e.target.value)}
            spellCheck={false}
          />
          <datalist id="ai-folder-list">
            <option value="" label="/ (workspace root)" />
            {folders.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
          <div style={{ fontSize: 10, color: 'var(--text-disabled)', marginTop: 3 }}>
            Folder will be created if it doesn't exist
          </div>
        </div>
      ) : (
        /* Active file context */
        <div className="ai-panel__context">
          <span>📄</span>
          {activeFile ? (
            <span className="ai-panel__context-file">{activeFile}</span>
          ) : (
            <span style={{ color: 'var(--text-error)' }}>No file open</span>
          )}
        </div>
      )}

      {/* Mode tabs — only shown for file target */}
      {!isFolderTarget && !isAgentMode && (
        <div style={{
          display: 'flex', gap: 2, padding: '8px 12px 0',
          borderBottom: '1px solid var(--border)', flexShrink: 0,
        }}>
          {AI_MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => setAIMode(m.id)}
              title={m.hint}
              style={{
                padding: '4px 10px',
                borderRadius: '4px 4px 0 0',
                background: aiMode === m.id ? 'var(--bg-editor)' : 'transparent',
                color: aiMode === m.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                borderBottom: aiMode === m.id ? '2px solid var(--accent)' : '2px solid transparent',
                fontSize: 12,
                fontWeight: aiMode === m.id ? 600 : 400,
                transition: 'all 0.15s',
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}

      {/* Model selector */}
      <div className="ai-panel__model-row">
        <div className="ai-panel__model-label">Model</div>
        <select
          className="ai-panel__model-select"
          value={selectedModel}
          onChange={(e) => setSelectedModel(e.target.value)}
        >
          {providers.map((provider) => (
            <optgroup key={provider} label={provider}>
              {MODELS.filter((m) => m.provider === provider).map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {/* Prompt */}
      <div className="ai-panel__prompt-area">
        {!isFolderTarget && !isAgentMode && (
          <div className="ai-panel__prompt-label">{currentMode?.hint}</div>
        )}
        {isAgentMode && (
          <div className="ai-panel__prompt-label">
            Describe the project to build — Agent will create all files automatically
          </div>
        )}
        <textarea
          className="ai-panel__prompt-input"
          placeholder={
            isAgentMode
              ? 'e.g. "Create a new React project with Vite, TailwindCSS, and a counter component"'
              : isFolderTarget
              ? 'Describe what to generate, e.g. "A React Button component with primary/secondary variants and TypeScript types"'
              : aiMode === 'edit' ? 'e.g. "Convert this to TypeScript"'
              : aiMode === 'explain' ? 'e.g. "What does this function do?"'
              : aiMode === 'refactor' ? 'e.g. "Improve readability and add error handling"'
              : 'e.g. "Write a binary search function"'
          }
          value={aiPrompt}
          onChange={(e) => setAIPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          className="ai-panel__run-btn"
          onClick={isAgentMode ? runAgent : isFolderTarget ? runAIFolder : runAI}
          disabled={aiLoading || agentLoading}
          title={
            isAgentMode
              ? 'Run Agent — builds the project automatically (Ctrl+Enter)'
              : isFolderTarget
              ? 'Generate files in folder (Ctrl+Enter)'
              : 'Run AI (Ctrl+Enter)'
          }
        >
          {(aiLoading || agentLoading)
            ? '⏳ Working...'
            : isAgentMode
              ? '🤖 Run Agent  (Ctrl+Enter)'
              : isFolderTarget
              ? '🪄 Generate Files  (Ctrl+Enter)'
              : '▶  Run AI  (Ctrl+Enter)'}
        </button>
      </div>

      {/* Response area */}
      <div className="ai-panel__response">
        {(aiLoading || agentLoading) && (
          <div className="ai-panel__loading">
            <div className="spinner" />
            {isAgentMode
              ? '🤖 Agent is building your project…'
              : isFolderTarget
              ? 'Thinking…'
              : `Waiting for ${selectedModel}…`}
          </div>
        )}

        {aiError && (
          <div className="ai-panel__error">⚠ {aiError}</div>
        )}

        {/* ── Agent mode: auto-created files log ── */}
        {isAgentMode && agentLog.length > 0 && !agentLoading && (
          <div className="ai-panel__pending">
            <div className="ai-panel__pending-header">
              <span className="ai-panel__pending-title">
                ✅ Agent completed
              </span>
              <button
                className="ai-panel__action-btn skip"
                onClick={clearAgentLog}
                title="Clear log"
              >
                ✗ Clear
              </button>
            </div>
            {agentLog.map((entry, i) => (
              <div
                key={i}
                style={{
                  padding: '3px 12px',
                  fontSize: 12,
                  color: entry.type === 'error'
                    ? 'var(--text-error)'
                    : entry.type === 'success'
                    ? 'var(--accent)'
                    : 'var(--text-secondary)',
                  fontFamily: entry.type === 'created' ? 'monospace' : 'inherit',
                }}
              >
                {entry.type === 'created' ? `  ✓ ${entry.text}` : entry.text}
              </div>
            ))}
          </div>
        )}

        {isAgentMode && agentLog.length === 0 && !agentLoading && !aiError && (
          <div style={{ color: 'var(--text-disabled)', fontSize: 11, textAlign: 'center', paddingTop: 16 }}>
            Describe your project — Agent will create all files automatically, no confirmation needed
          </div>
        )}

        {/* ── Folder mode: Copilot-style pending file review ── */}
        {isFolderTarget && pendingFiles.length > 0 && !aiLoading && (
          <div className="ai-panel__pending">
            {/* Header */}
            <div className="ai-panel__pending-header">
              <span className="ai-panel__pending-title">
                {pendingFiles.length} file{pendingFiles.length !== 1 ? 's' : ''} proposed
                {pendingFolderPath ? ` · ${pendingFolderPath}` : ''}
              </span>
              <div className="ai-panel__pending-header-actions">
                <button
                  className="ai-panel__action-btn accept-all"
                  onClick={acceptAllPendingFiles}
                  title="Accept all and write to disk"
                >
                  ✓ Accept all
                </button>
                <button
                  className="ai-panel__action-btn discard-all"
                  onClick={discardAllPendingFiles}
                  title="Discard all without saving"
                >
                  ✗ Discard all
                </button>
              </div>
            </div>

            {/* Per-file rows */}
            {pendingFiles.map((f) => (
              <div key={f.path} className="ai-panel__pending-file">
                <div className="ai-panel__pending-file-header">
                  <span className="ai-panel__pending-file-icon">📄</span>
                  <span className="ai-panel__pending-file-name" title={f.path}>{f.filename}</span>
                  <button
                    className="ai-panel__action-btn accept"
                    onClick={() => acceptPendingFile(f.path, f.content)}
                    title="Create this file"
                  >
                    ✓ Accept
                  </button>
                  <button
                    className="ai-panel__action-btn skip"
                    onClick={() => skipPendingFile(f.path)}
                    title="Skip this file"
                  >
                    ✗ Skip
                  </button>
                </div>
                <pre className="ai-panel__pending-preview">
                  {f.content.split('\n').slice(0, 8).join('\n')}
                  {f.content.split('\n').length > 8 ? '\n…' : ''}
                </pre>
              </div>
            ))}
          </div>
        )}

        {/* ── File mode: single-file Copilot-style result ── */}
        {!isFolderTarget && aiResponse && !aiLoading && (
          <div className="ai-panel__pending">
            {/* Header with Accept / Discard */}
            <div className="ai-panel__pending-header">
              <span className="ai-panel__pending-title">
                {isCodeMode ? 'Proposed change' : 'Explanation'}
              </span>
              <div className="ai-panel__pending-header-actions">
                {isCodeMode && (
                  <>
                    {activeFile ? (
                      <button
                        className="ai-panel__action-btn accept-all"
                        onClick={applyAIResult}
                        title="Apply to active file"
                      >
                        ✓ Accept
                      </button>
                    ) : (
                      <button
                        className="ai-panel__action-btn accept-all"
                        onClick={() => {
                          const name = window.prompt('Save as (e.g. src/utils/helper.js):');
                          if (name) saveAIGeneratedFile(name);
                        }}
                        title="Save to a new file"
                      >
                        ✓ Save as…
                      </button>
                    )}
                    <button
                      className="ai-panel__action-btn accept"
                      onClick={() => executeCode(aiResponse.result, 'python')}
                      title="Run this code in terminal"
                    >
                      ▶ Run
                    </button>
                    <button
                      className="ai-panel__action-btn discard-all"
                      onClick={clearAIResponse}
                      title="Discard this result"
                    >
                      ✗ Discard
                    </button>
                  </>
                )}
                {!isCodeMode && (
                  <button
                    className="ai-panel__action-btn skip"
                    onClick={clearAIResponse}
                    title="Close"
                  >
                    ✗ Close
                  </button>
                )}
              </div>
            </div>

            {isCodeMode ? (
              <pre className="ai-panel__response-code">{aiResponse.result}</pre>
            ) : (
              <div
                className="ai-panel__response-text"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(aiResponse.result) }}
              />
            )}
          </div>
        )}

        {!aiLoading && !agentLoading && !aiResponse && pendingFiles.length === 0 && !aiError && !isAgentMode && (
          <div style={{ color: 'var(--text-disabled)', fontSize: 11, textAlign: 'center', paddingTop: 16 }}>
            {isFolderTarget
              ? 'Describe what to build — AI will propose files for you to review'
              : 'Enter a prompt — AI will propose changes for you to accept or discard'}
          </div>
        )}
      </div>

      {/* Clarifying Questions Dialog */}
      {showClarifyingDialog && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            background: 'var(--bg-panel)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: 24,
            maxWidth: 600,
            maxHeight: 'calc(100vh - 40px)',
            overflow: 'auto',
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          }}>
            <h2 style={{ marginTop: 0, marginBottom: 16, color: 'var(--text-primary)' }}>
              💡 Let's clarify your project
            </h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 20, fontSize: 13 }}>
              Please answer the following questions to help me build exactly what you need:
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {clarifyingQuestions.map((q, i) => (
                <div key={i}>
                  <label style={{
                    display: 'block',
                    color: 'var(--text-primary)',
                    fontWeight: 500,
                    marginBottom: 6,
                    fontSize: 13,
                  }}>
                    {i + 1}. {q.question}
                  </label>
                  <input
                    type="text"
                    placeholder="Your answer…"
                    value={clarifyingAnswers[i] || ''}
                    onChange={(e) => updateClarifyingAnswer(i, e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      background: 'var(--bg-editor)',
                      border: '1px solid var(--border)',
                      borderRadius: 4,
                      color: 'var(--text-primary)',
                      fontSize: 12,
                      fontFamily: 'inherit',
                      boxSizing: 'border-box',
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        runAgentWithAnswers();
                      }
                    }}
                  />
                  {q.hint && (
                    <div style={{ fontSize: 11, color: 'var(--text-disabled)', marginTop: 4 }}>
                      Hint: {q.hint}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div style={{
              display: 'flex', gap: 8, marginTop: 24, justifyContent: 'flex-end',
            }}>
              <button
                onClick={closeClarifyingDialog}
                style={{
                  padding: '8px 16px',
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  borderRadius: 4,
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 500,
                }}
              >
                Cancel
              </button>
              <button
                onClick={runAgentWithAnswers}
                disabled={agentLoading}
                style={{
                  padding: '8px 16px',
                  background: 'var(--accent)',
                  border: 'none',
                  borderRadius: 4,
                  color: 'white',
                  cursor: agentLoading ? 'not-allowed' : 'pointer',
                  fontSize: 12,
                  fontWeight: 600,
                  opacity: agentLoading ? 0.7 : 1,
                }}
              >
                {agentLoading ? '⏳ Building...' : '🚀 Build with answers'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
