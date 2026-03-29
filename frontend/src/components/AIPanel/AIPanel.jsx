import React, { useRef, useEffect, useState, useMemo } from 'react';
import { useEditorStore } from '../../store/editorStore';


const MODELS = [
  { id: 'groq/llama-3.3-70b-versatile', label: 'Llama 3.3 70B', provider: 'Groq (Free)' },
  { id: 'groq/llama-3.1-8b-instant',    label: 'Llama 3.1 8B',  provider: 'Groq (Free)' },
  { id: 'groq/mixtral-8x7b-32768',      label: 'Mixtral 8x7B',  provider: 'Groq (Free)' },
  { id: 'groq/gemma2-9b-it',            label: 'Gemma 2 9B',    provider: 'Groq (Free)' },
  { id: 'ollama/llama3.2',              label: 'Llama 3.2',      provider: 'Ollama (Local)' },
  { id: 'ollama/mistral',               label: 'Mistral 7B',     provider: 'Ollama (Local)' },
  { id: 'ollama/codellama',             label: 'CodeLlama',      provider: 'Ollama (Local)' },
  { id: 'ollama/deepseek-coder',        label: 'DeepSeek Coder', provider: 'Ollama (Local)' },
  { id: 'gpt-4o',                       label: 'GPT-4o',         provider: 'OpenAI' },
  { id: 'gpt-4-turbo',                  label: 'GPT-4 Turbo',    provider: 'OpenAI' },
  { id: 'gpt-3.5-turbo',               label: 'GPT-3.5 Turbo',  provider: 'OpenAI' },
  { id: 'claude-3-5-sonnet-20241022',   label: 'Claude 3.5 Sonnet', provider: 'Anthropic' },
  { id: 'claude-3-haiku-20240307',      label: 'Claude 3 Haiku',    provider: 'Anthropic' },
  { id: 'gemini-1.5-pro',              label: 'Gemini 1.5 Pro',  provider: 'Google' },
  { id: 'gemini-1.5-flash',            label: 'Gemini 1.5 Flash', provider: 'Google' },
];

const SLASH_COMMANDS = [
  { cmd: '/fix',      desc: 'Fix bugs in the current file' },
  { cmd: '/explain',  desc: 'Explain what this code does' },
  { cmd: '/refactor', desc: 'Refactor and improve quality' },
  { cmd: '/generate', desc: 'Generate code from description' },
  { cmd: '/test',     desc: 'Write unit tests for this code' },
  { cmd: '/docs',     desc: 'Add documentation and comments' },
  { cmd: '/optimize', desc: 'Optimize for performance' },
];

const QUICK_PROMPTS = [
  '/fix bugs in this file',
  '/explain this code',
  '/refactor for readability',
  '/test write unit tests',
];

function parseContent(raw) {
  const segs = [];
  const re = /```(\w*)\n?([\s\S]*?)```/g;
  let last = 0, m;
  while ((m = re.exec(raw)) !== null) {
    if (m.index > last) segs.push({ type: 'text', content: raw.slice(last, m.index) });
    segs.push({ type: 'code', lang: m[1] || 'text', content: m[2].trim() });
    last = m.index + m[0].length;
  }
  if (last < raw.length) segs.push({ type: 'text', content: raw.slice(last) });
  return segs.length ? segs : [{ type: 'text', content: raw }];
}

function renderText(text) {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`\n]+)`/g, '<code class="ch-inline-code">$1</code>')
    .replace(/\n/g, '<br/>');
}

export default function AIPanel() {
  const {
    activeFile,
    files,
    selectedModel, setSelectedModel,
    chatMessages, chatLoading, sendChatMessage, clearChat,
    setFileContent, saveFile, saveFileContent, loadFileTree, openFile,
    proposeInlineEdit,
    chatAcceptFile, chatSkipFile, chatAcceptAllFiles, chatDiscardAllFiles,
  } = useEditorStore();

  const [input, setInput] = useState('');
  const [showCmds, setShowCmds] = useState(false);
  const [cmdIdx, setCmdIdx] = useState(0);
  const [copiedKey, setCopiedKey] = useState(null);

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  const filteredCmds = useMemo(() => {
    if (!input.startsWith('/')) return [];
    const q = input.slice(1).toLowerCase();
    return SLASH_COMMANDS.filter(
      (c) => c.cmd.slice(1).startsWith(q) || c.desc.toLowerCase().includes(q)
    );
  }, [input]);

  const providers = useMemo(() => [...new Set(MODELS.map((m) => m.provider))], []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, chatLoading]);

  const handleInputChange = (e) => {
    const val = e.target.value;
    setInput(val);
    setShowCmds(val.startsWith('/'));
    setCmdIdx(0);
  };

  const selectCommand = (cmd) => {
    setInput(cmd.cmd + ' ');
    setShowCmds(false);
    textareaRef.current?.focus();
  };

  const handleSend = async () => {
    const msg = input.trim();
    if (!msg || chatLoading) return;
    setInput('');
    setShowCmds(false);
    await sendChatMessage(msg);
  };

  const handleKeyDown = (e) => {
    if (showCmds && filteredCmds.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setCmdIdx((i) => Math.min(i + 1, filteredCmds.length - 1)); return; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setCmdIdx((i) => Math.max(i - 1, 0)); return; }
      if (e.key === 'Tab' || e.key === 'Enter') { e.preventDefault(); selectCommand(filteredCmds[cmdIdx]); return; }
      if (e.key === 'Escape') { setShowCmds(false); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleCopy = (key, code) => {
    navigator.clipboard?.writeText(code).catch(() => {});
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const langToExt = { python: 'py', py: 'py', javascript: 'js', js: 'js', typescript: 'ts', ts: 'ts',
    jsx: 'jsx', tsx: 'tsx', html: 'html', css: 'css', json: 'json', bash: 'sh', sh: 'sh',
    shell: 'sh', go: 'go', rust: 'rs', java: 'java', cpp: 'cpp', c: 'c', ruby: 'rb',
    php: 'php', swift: 'swift', kotlin: 'kt', sql: 'sql', yaml: 'yml', toml: 'toml', md: 'md' };

  const handleAccept = async (code, lang) => {
    if (!activeFile) {
      // No file open — create a new untitled file
      const ext = langToExt[lang?.toLowerCase()] || 'txt';
      const name = `untitled-${Date.now()}.${ext}`;
      try {
        await saveFileContent(name, code);
        await loadFileTree();
        await openFile(name);
      } catch (err) { console.error('handleAccept:', err); }
    } else {
      // Show inline diff in Monaco — user can Accept or Discard there
      proposeInlineEdit(activeFile, code);
    }
  };

  return (
    <div className="ai-panel ch-panel">
      {/* Header */}
      <div className="ch-header">
        <span className="ch-header__title">
          <span>🤖</span> Copilot Chat
        </span>
        <div className="ch-header__right">
          <select
            className="ch-model-select"
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            title="Select model"
          >
            {providers.map((p) => (
              <optgroup key={p} label={p}>
                {MODELS.filter((m) => m.provider === p).map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
          {chatMessages.length > 0 && (
            <button className="ch-icon-btn" onClick={clearChat} title="Clear conversation">
              🗑
            </button>
          )}
        </div>
      </div>

      {/* Active file context bar */}
      {activeFile && (
        <div className="ch-context-bar">
          <span>📄</span>
          <span className="ch-context-bar__path" title={activeFile}>{activeFile}</span>
          <span className="ch-context-bar__badge">context</span>
        </div>
      )}

      {/* Messages */}
      <div className="ch-messages">
        {chatMessages.length === 0 && !chatLoading && (
          <div className="ch-empty">
            <div className="ch-empty__icon">🤖</div>
            <div className="ch-empty__title">GitHub Copilot</div>
            <div className="ch-empty__hint">
              Ask me anything about your code.
              {activeFile && (
                <> I have context of <strong>{activeFile.split('/').pop()}</strong>.</>
              )}
            </div>
            <div className="ch-suggestions">
              {QUICK_PROMPTS.map((s) => (
                <button
                  key={s}
                  className="ch-suggestion"
                  onClick={() => { setInput(s); textareaRef.current?.focus(); }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {chatMessages.map((msg) => (
          <div key={msg.id} className={`ch-msg ch-msg--${msg.role}`}>
            <div className={`ch-msg__avatar${msg.role === 'user' ? ' ch-msg__avatar--user' : ''}`}>
              {msg.role === 'user' ? 'You' : '🤖'}
            </div>
            <div className="ch-msg__body">
              {msg.role === 'error' ? (
                <div className="ch-msg__error">⚠ {msg.content}</div>
              ) : (
                <>
                  {/* Text / code segments */}
                  {parseContent(msg.content).map((seg, i) =>
                    seg.type === 'code' && (!msg.pendingFiles || msg.pendingFiles.length <= 1) ? (
                      <div key={i} className="ch-code-block">
                        <div className="ch-code-block__header">
                          <span className="ch-code-block__lang">{seg.lang || 'code'}</span>
                          <div className="ch-code-block__actions">
                            <button
                              className="ch-code-btn"
                              onClick={() => handleCopy(`${msg.id}-${i}`, seg.content)}
                            >
                              {copiedKey === `${msg.id}-${i}` ? '✓ Copied' : '📋 Copy'}
                            </button>
                            {msg.role === 'assistant' && (
                              <button
                                className="ch-code-btn ch-code-btn--accept"
                                onClick={() => handleAccept(seg.content, seg.lang)}
                                title={activeFile ? `Show inline diff in editor: ${activeFile}` : 'Create new file with this code'}
                              >
                                {activeFile ? '⟶ Show Diff' : '✓ Apply in Editor'}
                              </button>
                            )}
                          </div>
                        </div>
                        <pre className="ch-code-block__pre">{seg.content}</pre>
                      </div>
                    ) : seg.type !== 'code' ? (
                      <div
                        key={i}
                        className="ch-msg__text"
                        dangerouslySetInnerHTML={{ __html: renderText(seg.content) }}
                      />
                    ) : null
                  )}

                  {/* Agent file review cards */}
                  {msg.pendingFiles?.length > 0 && (() => {
                    const pending  = msg.pendingFiles.filter((f) => f.status === 'pending');
                    const accepted = msg.pendingFiles.filter((f) => f.status === 'accepted');
                    const allDone  = pending.length === 0;
                    return (
                      <div className="ch-agent-files">
                        {/* Summary bar */}
                        <div className="ch-agent-files__header">
                          <span className="ch-agent-files__title">
                            {allDone
                              ? `✓ ${accepted.length} file${accepted.length !== 1 ? 's' : ''} accepted`
                              : `📁 ${msg.pendingFiles.length} file${msg.pendingFiles.length !== 1 ? 's' : ''} proposed`}
                          </span>
                          {!allDone && (
                            <div className="ch-agent-files__actions">
                              <button
                                className="ch-agent-btn ch-agent-btn--accept-all"
                                onClick={() => chatAcceptAllFiles(msg.id)}
                              >
                                ✓ Accept All
                              </button>
                              <button
                                className="ch-agent-btn ch-agent-btn--discard"
                                onClick={() => chatDiscardAllFiles(msg.id)}
                              >
                                ✗ Discard All
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Per-file cards */}
                        {msg.pendingFiles.map((f) => (
                          <div
                            key={f.path}
                            className={`ch-agent-file ch-agent-file--${f.status}`}
                          >
                            <div className="ch-agent-file__header">
                              <span className="ch-agent-file__icon">
                                {f.status === 'accepted' ? '✅' : f.status === 'skipped' ? '❌' : '📄'}
                              </span>
                              <span className="ch-agent-file__path" title={f.path}>{f.path}</span>
                              {f.status === 'pending' && (
                                <div className="ch-agent-file__btns">
                                  <button
                                    className="ch-agent-btn ch-agent-btn--accept"
                                    onClick={() => chatAcceptFile(msg.id, f.path)}
                                  >
                                    ✓ Accept
                                  </button>
                                  <button
                                    className="ch-agent-btn ch-agent-btn--skip"
                                    onClick={() => chatSkipFile(msg.id, f.path)}
                                  >
                                    ✗
                                  </button>
                                </div>
                              )}
                              {f.status === 'accepted' && (
                                <span className="ch-agent-file__badge ch-agent-file__badge--accepted">Accepted</span>
                              )}
                              {f.status === 'skipped' && (
                                <span className="ch-agent-file__badge ch-agent-file__badge--skipped">Skipped</span>
                              )}
                            </div>
                            {f.status !== 'skipped' && (
                              <pre className="ch-agent-file__preview">
                                {f.content.split('\n').slice(0, 7).join('\n')}
                                {f.content.split('\n').length > 7 ? '\n…' : ''}
                              </pre>
                            )}
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </>
              )}
            </div>
          </div>
        ))}

        {chatLoading && (
          <div className="ch-msg ch-msg--assistant">
            <div className="ch-msg__avatar">🤖</div>
            <div className="ch-msg__body">
              <div className="ch-typing"><span /><span /><span /></div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Slash command popup */}
      {showCmds && filteredCmds.length > 0 && (
        <div className="ch-commands">
          {filteredCmds.map((c, i) => (
            <div
              key={c.cmd}
              className={`ch-commands__item${i === cmdIdx ? ' active' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); selectCommand(c); }}
            >
              <span className="ch-commands__cmd">{c.cmd}</span>
              <span className="ch-commands__desc">{c.desc}</span>
            </div>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="ch-input-area">
        <textarea
          ref={textareaRef}
          className="ch-input"
          placeholder={
            activeFile
              ? `Ask about ${activeFile.split('/').pop()}… (/ for commands)`
              : 'Ask Copilot anything… (/ for commands, Enter to send)'
          }
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          rows={3}
          spellCheck={false}
        />
        <button
          className={`ch-send-btn${input.trim() && !chatLoading ? ' active' : ''}`}
          onClick={handleSend}
          disabled={!input.trim() || chatLoading}
          title="Send (Enter)"
        >
          {chatLoading ? '⏳' : '↑'}
        </button>
      </div>
    </div>
  );
}
