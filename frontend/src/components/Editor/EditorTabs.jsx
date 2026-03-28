import React from 'react';
import { useEditorStore } from '../../store/editorStore';
import { getFileIcon } from '../../utils/languageDetect';

export default function EditorTabs() {
  const { openTabs, activeFile, unsavedFiles, setActiveFile, closeTab, saveFile } = useEditorStore();

  if (openTabs.length === 0) return null;

  const handleClose = (e, path) => {
    e.stopPropagation();
    if (unsavedFiles.includes(path)) {
      if (!window.confirm(`"${path}" has unsaved changes. Close anyway?`)) return;
    }
    closeTab(path);
  };

  const handleMiddleClick = (e, path) => {
    if (e.button === 1) {
      e.preventDefault();
      closeTab(path);
    }
  };

  return (
    <div className="editor-tabs">
      {openTabs.map((path) => {
        const filename = path.split('/').pop();
        const isUnsaved = unsavedFiles.includes(path);
        const isActive = activeFile === path;

        return (
          <div
            key={path}
            className={`editor-tab${isActive ? ' active' : ''}`}
            onClick={() => setActiveFile(path)}
            onMouseDown={(e) => handleMiddleClick(e, path)}
            title={path}
          >
            {isUnsaved && <span className="editor-tab__indicator" title="Unsaved changes" />}
            <span style={{ fontSize: 13, flexShrink: 0 }}>{getFileIcon(filename)}</span>
            <span className="editor-tab__name">{filename}</span>
            <button
              className="editor-tab__close"
              onClick={(e) => handleClose(e, path)}
              title="Close tab"
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
