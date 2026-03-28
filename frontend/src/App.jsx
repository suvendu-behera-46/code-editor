import React, { useEffect } from 'react';
import { useEditorStore } from './store/editorStore';
import TopBar from './components/TopBar/TopBar';
import FileTree from './components/FileTree/FileTree';
import EditorTabs from './components/Editor/EditorTabs';
import MonacoEditor from './components/Editor/MonacoEditor';
import AIPanel from './components/AIPanel/AIPanel';
import GitHubPanel from './components/GitHub/GitHubPanel';
import Terminal from './components/Terminal/Terminal';
import StatusBar from './components/StatusBar/StatusBar';

export default function App() {
  const { loadFileTree, activeFile, aiPanelOpen, githubPanelOpen, terminalOpen } = useEditorStore();

  useEffect(() => {
    loadFileTree();
  }, []);

  const showRightPanel = aiPanelOpen || githubPanelOpen;

  return (
    <div className="app">
      <TopBar />
      <div className="main-layout">
        {/* Left: File Explorer */}
        <div className="left-panel">
          <FileTree />
        </div>

        {/* Center: Editor + Terminal */}
        <div className="center-panel">
          <div className="editor-area">
            <EditorTabs />
            {activeFile ? (
              <MonacoEditor />
            ) : (
              <div className="welcome-screen">
                <div className="welcome-screen__icon">⚡</div>
                <div className="welcome-screen__title">AI Code Editor</div>
                <div className="welcome-screen__hint">
                  Open a file from the explorer or create a new one
                </div>
              </div>
            )}
          </div>

          {/* Terminal Panel */}
          {terminalOpen && (
            <div className="terminal-panel">
              <Terminal />
            </div>
          )}
        </div>

        {/* Right: AI or GitHub Panel */}
        {showRightPanel && (
          <div className="right-panel">
            {githubPanelOpen ? <GitHubPanel /> : <AIPanel />}
          </div>
        )}
      </div>
      <StatusBar />
    </div>
  );
}
