import React, { useRef, useCallback, useEffect } from 'react';
import Editor, { DiffEditor } from '@monaco-editor/react';
import { useEditorStore } from '../../store/editorStore';
import { getLanguage } from '../../utils/languageDetect';

const SAVE_DEBOUNCE_MS = 2000;

export default function MonacoEditor() {
  const {
    activeFile,
    files,
    setFileContent,
    saveFile,
    setCursorPosition,
    inlineEditProposal,
    acceptInlineEdit,
    discardInlineEdit,
  } = useEditorStore();

  const saveTimer = useRef(null);
  const editorRef = useRef(null);

  const content = files[activeFile] ?? '';
  const language = getLanguage(activeFile ?? '');

  // Is there an inline diff proposal for the currently active file?
  const hasDiff = inlineEditProposal?.path === activeFile;

  // Keyboard shortcut: Ctrl+S / Cmd+S
  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (activeFile) saveFile(activeFile);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeFile, saveFile]);

  const handleEditorMount = useCallback((editor, monaco) => {
    editorRef.current = editor;

    // Track cursor position
    editor.onDidChangeCursorPosition((e) => {
      setCursorPosition(e.position.lineNumber, e.position.column);
    });

    // Format code keyboard shortcut: Ctrl+Shift+F / Cmd+Shift+F
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyF, () => {
      editor.getAction('editor.action.formatDocument').run();
    });

    editor.focus();
  }, [setCursorPosition]);

  const handleChange = useCallback(
    (newValue) => {
      if (activeFile) {
        setFileContent(activeFile, newValue ?? '');
        clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => {
          saveFile(activeFile);
        }, SAVE_DEBOUNCE_MS);
      }
    },
    [activeFile, setFileContent, saveFile]
  );

  const handleFormat = useCallback(() => {
    if (editorRef.current) {
      editorRef.current.getAction('editor.action.formatDocument').run();
    }
  }, []);

  if (!activeFile) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 12px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-panel)',
        flexShrink: 0,
      }}>
        {hasDiff ? (
          /* ── Inline-diff accept / discard bar ── */
          <>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', flex: 1 }}>
              🔀 Reviewing AI changes — <strong style={{ color: 'var(--text-primary)' }}>{activeFile.split('/').pop()}</strong>
            </span>
            <button
              onClick={acceptInlineEdit}
              title="Accept all changes (applies to disk)"
              style={{
                padding: '4px 14px', height: 28,
                background: 'rgba(76,175,80,0.2)', border: '1px solid rgba(76,175,80,0.5)',
                borderRadius: 4, color: '#81c784', cursor: 'pointer',
                fontSize: 12, fontWeight: 600,
              }}
            >
              ✓ Accept
            </button>
            <button
              onClick={discardInlineEdit}
              title="Discard — keep original file"
              style={{
                padding: '4px 14px', height: 28,
                background: 'rgba(244,67,54,0.12)', border: '1px solid rgba(244,67,54,0.35)',
                borderRadius: 4, color: '#e57373', cursor: 'pointer',
                fontSize: 12, fontWeight: 600,
              }}
            >
              ✗ Discard
            </button>
          </>
        ) : (
          /* ── Normal toolbar ── */
          <>
            <button
              onClick={handleFormat}
              title="Format code (Ctrl+Shift+F)"
              style={{
                padding: '4px 10px', height: 28,
                background: 'var(--bg-editor)', border: '1px solid var(--border)',
                borderRadius: 4, color: 'var(--text-primary)', cursor: 'pointer',
                fontSize: 12, fontWeight: 500,
                display: 'flex', alignItems: 'center', gap: 4, transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => { e.target.style.background = 'var(--accent)'; e.target.style.color = 'white'; }}
              onMouseLeave={(e) => { e.target.style.background = 'var(--bg-editor)'; e.target.style.color = 'var(--text-primary)'; }}
            >
              ✨ Format
            </button>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              {language === 'python' ? '🐍 Python' : language === 'javascript' ? '📜 JavaScript' : '👉 ' + language}
            </span>
          </>
        )}
      </div>

      {hasDiff ? (
        /* ── Inline Diff Editor ── */
        <DiffEditor
          key={`diff-${activeFile}`}
          height="100%"
          language={language}
          original={inlineEditProposal.original}
          modified={inlineEditProposal.proposed}
          theme="vs-dark"
          options={{
            renderSideBySide: false,   // inline diff (not split pane)
            readOnly: true,
            fontSize: 14,
            fontFamily: "'Cascadia Code', 'Fira Code', Consolas, 'Courier New', monospace",
            fontLigatures: true,
            lineHeight: 22,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            renderLineHighlight: 'none',
            padding: { top: 10, bottom: 10 },
            automaticLayout: true,
          }}
        />
      ) : (
        /* ── Regular Editor ── */
        <Editor
          key={activeFile}
          height="100%"
          language={language}
          value={content}
          theme="vs-dark"
          onChange={handleChange}
          onMount={handleEditorMount}
          options={{
            fontSize: 14,
            fontFamily: "'Cascadia Code', 'Fira Code', Consolas, 'Courier New', monospace",
            fontLigatures: true,
            lineHeight: 22,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            tabSize: 2,
            insertSpaces: true,
            renderLineHighlight: 'line',
            cursorBlinking: 'blink',
            cursorStyle: 'line',
            smoothScrolling: true,
            automaticLayout: true,
            padding: { top: 10, bottom: 10 },
            bracketPairColorization: { enabled: true },
            guides: { indentation: true, bracketPairs: true },
            suggest: { showSnippets: true },
            formatOnPaste: true,
            formatOnType: true,
          }}
        />
      )}
    </div>
  );
}
