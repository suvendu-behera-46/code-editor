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

  if (!activeFile) return null;

  return (
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
      }}
    />
  );
}
