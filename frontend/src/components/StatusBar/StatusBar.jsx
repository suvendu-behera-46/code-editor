import React from 'react';
import { useEditorStore } from '../../store/editorStore';
import { getLanguage } from '../../utils/languageDetect';

export default function StatusBar() {
  const {
    activeFile,
    cursorPosition,
    selectedModel,
    aiLoading,
    githubUser,
  } = useEditorStore();

  const language = activeFile ? getLanguage(activeFile) : null;

  return (
    <div className="status-bar">
      {/* Left side */}
      {githubUser && (
        <span className="status-bar__item" title={`GitHub: ${githubUser.login}`}>
          🐙 {githubUser.login}
        </span>
      )}

      <div className="status-bar__spacer" />

      {/* Right side */}
      {activeFile && (
        <>
          <span className="status-bar__item" title="Cursor position">
            Ln {cursorPosition.line}, Col {cursorPosition.column}
          </span>
          <span className="status-bar__item" title="File language">
            {language}
          </span>
          <span className="status-bar__item" title="Active file">
            {activeFile.split('/').pop()}
          </span>
        </>
      )}

      <span
        className="status-bar__item"
        title="Active AI model"
        style={{ marginLeft: 4 }}
      >
        {aiLoading ? '⏳ AI running...' : `⚡ ${selectedModel}`}
      </span>
    </div>
  );
}
