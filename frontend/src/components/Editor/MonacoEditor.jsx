import React, { useRef, useCallback, useEffect } from 'react';
import Editor from '@monaco-editor/react';
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
  } = useEditorStore();

  const saveTimer = useRef(null);
  const editorRef = useRef(null);

  const content = files[activeFile] ?? '';
  const language = getLanguage(activeFile ?? '');

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

    // Focus editor
    editor.focus();
  }, [setCursorPosition]);

  const handleChange = useCallback(
    (newValue) => {
      if (activeFile) {
        setFileContent(activeFile, newValue ?? '');

        // Auto-save after debounce
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
      {/* Editor Toolbar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 12px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-panel)',
        flexShrink: 0,
      }}>
        <button
          onClick={handleFormat}
          title="Format code (Ctrl+Shift+F)"
          style={{
            padding: '4px 10px',
            height: 28,
            background: 'var(--bg-editor)',
            border: '1px solid var(--border)',
            borderRadius: 4,
            color: 'var(--text-primary)',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            transition: 'all 0.15s',
          }}
          onMouseEnter={(e) => {
            e.target.style.background = 'var(--accent)';
            e.target.style.color = 'white';
          }}
          onMouseLeave={(e) => {
            e.target.style.background = 'var(--bg-editor)';
            e.target.style.color = 'var(--text-primary)';
          }}
        >
          ✨ Format
        </button>
        <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
          {language === 'python' ? '🐍 Python' : language === 'javascript' ? '📜 JavaScript' : '👉 ' + language}
        </span>
      </div>

      {/* Monaco Editor */}
      <Editor
        key={activeFile}           // remount on file change
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
          // Formatting options
          formatOnPaste: true,
          formatOnType: true,
          defaultFormatter: language === 'python' ? undefined : 'esbenp.prettier-vscode',
        }}
      />
    </div>
  );
}
