import React, { useRef, useEffect, useState } from 'react';
import { useEditorStore } from '../../store/editorStore';
import { api } from '../../api';
import './Terminal.css';

export default function Terminal() {
  const { activeFile, files, fileTree, terminalRunning, executeCode: storeExecuteCode, clearTerminal: storeClearTerminal } = useEditorStore();
  const terminalEndRef = useRef(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [commandInput, setCommandInput] = useState('');
  const [commandHistory, setCommandHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [terminalStatus, setTerminalStatus] = useState('idle');
  
  // Terminal tabs management - each tab has independent output
  const [terminalTabs, setTerminalTabs] = useState([
    { id: 'main', label: '📟 Terminal', output: '', status: 'idle', running: false, history: [] }
  ]);
  const [activeTabId, setActiveTabId] = useState('main');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [backendPath, setBackendPath] = useState('');
  const [frontendPath, setFrontendPath] = useState('');

  // Auto-detect backend and frontend paths from file tree
  const detectPaths = () => {
    let backendPath = '';
    let frontendPath = '';

    const findPaths = (nodes, prefix = '') => {
      for (const node of nodes) {
        // Look for backend: folder containing main.py
        if (node.type === 'folder' && node.name === 'backend' && !backendPath) {
          const hasMainPy = node.children?.some(child => child.type === 'file' && child.name === 'main.py');
          if (hasMainPy) {
            backendPath = prefix ? `${prefix}/${node.name}` : node.name;
          }
        }
        
        // Look for frontend: folder containing package.json
        if (node.type === 'folder' && node.name === 'frontend' && !frontendPath) {
          const hasPackageJson = node.children?.some(child => child.type === 'file' && child.name === 'package.json');
          if (hasPackageJson) {
            frontendPath = prefix ? `${prefix}/${node.name}` : node.name;
          }
        }
        
        // Recursively search children
        if (node.children) {
          findPaths(node.children, prefix ? `${prefix}/${node.name}` : node.name);
        }
      }
    };

    findPaths(fileTree || []);
    
    // Debug log
    console.log('Detected Paths:', { backendPath, frontendPath, fileTree });
    
    return { backendPath, frontendPath };
  };

  // Detect and update paths when fileTree changes
  useEffect(() => {
    const { backendPath: bp, frontendPath: fp } = detectPaths();
    setBackendPath(bp);
    setFrontendPath(fp);
  }, [fileTree]);

  const activeTab = terminalTabs.find(t => t.id === activeTabId) || terminalTabs[0];

  // Add a new terminal tab
  const addTerminalTab = (label) => {
    const newId = `tab-${Date.now()}`;
    const newTab = { id: newId, label, output: '', status: 'idle', running: false, history: [] };
    setTerminalTabs([...terminalTabs, newTab]);
    setActiveTabId(newId);
    return newId;
  };

  // Close terminal tab
  const closeTab = (tabId) => {
    if (terminalTabs.length <= 1) {
      alert('Cannot close the last terminal tab');
      return;
    }
    const newTabs = terminalTabs.filter(t => t.id !== tabId);
    setTerminalTabs(newTabs);
    if (activeTabId === tabId) {
      setActiveTabId(newTabs[0].id);
    }
  };

  // Update active tab output
  const updateTabOutput = (tabId, output, status = null) => {
    setTerminalTabs(prev => prev.map(t => 
      t.id === tabId 
        ? { ...t, output, status: status !== null ? status : t.status }
        : t
    ));
  };

  // Execute code in the active tab (local execution, not store)
  const executeCode = async (code, language = 'python', cwd = null) => {
    const tabId = activeTabId;
    
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
      
      // Update the active tab's output
      setTerminalTabs(prev => prev.map(t => {
        if (t.id === tabId) {
          return {
            ...t,
            output: t.output + output,
            history: [...t.history, { code, language, timestamp: new Date().toISOString(), output }]
          };
        }
        return t;
      }));
    } catch (err) {
      const errorMsg = `Error executing code: ${err.message}`;
      setTerminalTabs(prev => prev.map(t => {
        if (t.id === tabId) {
          return {
            ...t,
            output: t.output + `\n[ERROR] ${errorMsg}\n`
          };
        }
        return t;
      }));
    }
  };

  // Clear active tab output
  const clearTerminal = () => {
    setTerminalTabs(prev => prev.map(t => 
      t.id === activeTabId 
        ? { ...t, output: '', status: 'idle' }
        : t
    ));
    setTerminalStatus('idle');
  };

  // Track terminal running state for all tabs
  useEffect(() => {
    setTerminalTabs(prev => prev.map(t => ({
      ...t,
      running: terminalRunning
    })));
  }, [terminalRunning]);

  // Auto-scroll to bottom when active tab output changes
  useEffect(() => {
    if (autoScroll && terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeTabId, terminalTabs, autoScroll]);

  // Track when terminal stops running and set success status
  useEffect(() => {
    const activeTab = terminalTabs.find(t => t.id === activeTabId);
    if (!terminalRunning && terminalStatus === 'running' && activeTab?.output) {
      // Check if there's an error
      if (activeTab.output.toLowerCase().includes('error') && !activeTab.output.toLowerCase().includes('no error')) {
        setTerminalStatus('error');
      } else {
        setTerminalStatus('success');
      }
    }
  }, [terminalRunning, terminalStatus, terminalTabs, activeTabId]);

  // Handle scroll detection
  const handleScroll = (e) => {
    const element = e.target;
    const isAtBottom = Math.abs(element.scrollHeight - element.scrollTop - element.clientHeight) < 10;
    setAutoScroll(isAtBottom);
  };

  // Detect language from file extension
  const detectLanguage = (filePath) => {
    if (!filePath) return 'python';
    if (filePath.endsWith('.py')) return 'python';
    if (filePath.endsWith('.js') || filePath.endsWith('.jsx')) return 'javascript';
    if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) return 'javascript';
    if (filePath.endsWith('.sh')) return 'shell';
    return 'python';
  };

  // Handle run current file
  const handleRunFile = async () => {
    if (!activeFile) {
      alert('Please open a file first');
      return;
    }

    const code = files[activeFile];
    if (!code) {
      alert('File is empty');
      return;
    }

    const language = detectLanguage(activeFile);
    await executeCode(code, language, workingDirectory || null);
  };

  // Run Backend
  const handleRunBackend = async () => {
    if (!backendPath) {
      alert('Backend folder not found in project structure');
      return;
    }
    // Convert forward slashes to backslashes for Windows
    const winPath = backendPath.replace(/\//g, '\\');
    const cmd = `cd ${winPath} && python main.py`;
    setCommandInput('');
    setCommandHistory([...commandHistory, cmd]);
    setHistoryIndex(-1);
    // Pass null to use backend's default workspace directory
    await executeCode(cmd, 'shell', null);
  };

  // Run Frontend
  const handleRunFrontend = async () => {
    if (!frontendPath) {
      alert('Frontend folder not found in project structure');
      return;
    }
    // Convert forward slashes to backslashes for Windows
    const winPath = frontendPath.replace(/\//g, '\\');
    const cmd = `cd ${winPath} && npm run dev`;
    setCommandInput('');
    setCommandHistory([...commandHistory, cmd]);
    setHistoryIndex(-1);
    // Pass null to use backend's default workspace directory
    await executeCode(cmd, 'shell', null);
  };

  // Install Dependencies (Frontend)
  const handleInstallFrontend = async () => {
    if (!frontendPath) {
      alert('Frontend folder not found in project structure');
      return;
    }
    // Convert forward slashes to backslashes for Windows
    const winPath = frontendPath.replace(/\//g, '\\');
    const cmd = `cd ${winPath} && npm install`;
    setCommandInput('');
    setCommandHistory([...commandHistory, cmd]);
    setHistoryIndex(-1);
    // Pass null to use backend's default workspace directory
    await executeCode(cmd, 'shell', null);
  };

  // Install Dependencies (Backend)
  const handleInstallBackend = async () => {
    if (!backendPath) {
      alert('Backend folder not found in project structure');
      return;
    }
    // Convert forward slashes to backslashes for Windows
    const winPath = backendPath.replace(/\//g, '\\');
    const cmd = `cd ${winPath} && pip install -r requirements.txt`;
    setCommandInput('');
    setCommandHistory([...commandHistory, cmd]);
    setHistoryIndex(-1);
    // Pass null to use backend's default workspace directory
    await executeCode(cmd, 'shell', null);
  };

  // Smart auto-detection: what to run based on project structure
  const getAutoRunCommand = async () => {
    // Priority 1: Active file is open
    if (activeFile && files[activeFile]) {
      const code = files[activeFile];
      if (code.trim()) {
        const language = detectLanguage(activeFile);
        return { 
          type: 'single', 
          actions: [{ type: 'file', code, language, display: `Running: ${activeFile}` }]
        };
      }
    }

    // Priority 2: Run both backend and frontend together
    const actions = [];
    let hasBackendRequirements = false;
    let hasFrontendPackage = false;

    const checkFiles = (nodes) => {
      for (const node of nodes) {
        if (node.type === 'file') {
          if (node.name === 'requirements.txt') hasBackendRequirements = true;
          if (node.name === 'package.json') hasFrontendPackage = true;
        }
        if (node.children) checkFiles(node.children);
      }
    };
    checkFiles(fileTree || []);

    // Add backend
    if (backendPath) {
      const winPath = backendPath.replace(/\//g, '\\');
      if (hasBackendRequirements) {
        actions.push({ 
          type: 'shell', 
          cmd: `cd ${winPath} && pip install -r requirements.txt`,
          display: '📦 Installing backend dependencies...',
          isSetup: true,
        });
      }
      actions.push({ 
        type: 'shell', 
        cmd: `cd ${winPath} && python main.py`,
        display: '🔧 Starting backend...',
      });
    }

    // Add frontend
    if (frontendPath) {
      const winPath = frontendPath.replace(/\//g, '\\');
      if (hasFrontendPackage) {
        actions.push({ 
          type: 'shell', 
          cmd: `cd ${winPath} && npm install`,
          display: '📦 Installing frontend dependencies...',
          isSetup: true,
        });
      }
      actions.push({ 
        type: 'shell', 
        cmd: `cd ${winPath} && npm run dev`,
        display: '🎨 Starting frontend...',
      });
    }

    if (actions.length === 0) {
      return null;
    }

    return { type: 'multi', actions };
  };

  const handleAutoRun = async () => {
    const plan = await getAutoRunCommand();
    
    if (!plan) {
      alert('No file is open and no backend/frontend detected.\n\nPlease open a file or generate a project.');
      return;
    }

    setTerminalStatus('running');

    if (plan.type === 'single') {
      const action = plan.actions[0];
      if (action.type === 'file') {
        await executeCode(action.code, action.language, null);
      } else {
        setCommandHistory([...commandHistory, action.cmd]);
        setHistoryIndex(-1);
        await executeCode(action.cmd, 'shell', null);
      }
      setTerminalStatus('success');
    } else if (plan.type === 'multi') {
      // Create separate tabs for backend and frontend
      let backendTabId = null;
      let frontendTabId = null;
      
      for (const action of plan.actions) {
        if (action.type === 'shell') {
          let tabId;
          
          // Create separate tabs for backend and frontend
          if (action.display.includes('backend') || action.display.includes('Backend')) {
            if (!backendTabId) {
              backendTabId = addTerminalTab('🔧 Backend');
            }
            tabId = backendTabId;
          } else if (action.display.includes('frontend') || action.display.includes('Frontend')) {
            if (!frontendTabId) {
              frontendTabId = addTerminalTab('🎨 Frontend');
            }
            tabId = frontendTabId;
          }
          
          if (tabId) {
            // Set this tab as active to show output
            setActiveTabId(tabId);
            
            // Execute in this tab
            setCommandHistory(prev => [...prev, action.cmd]);
            setHistoryIndex(-1);
            
            // Pass null to use backend's default workspace directory
            await executeCode(action.cmd, 'shell', null);
            
            // Wait a bit for completion
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      }
      
      setTerminalStatus('success');
    }
  };

  // Handle terminal command submission
  const handleCommandSubmit = async (e) => {
    if (e.key === 'Enter') {
      const cmd = commandInput.trim();
      if (!cmd) return;

      // Add to history
      setCommandHistory([...commandHistory, cmd]);
      setHistoryIndex(-1);
      
      // Execute shell command - pass null to use backend's default workspace directory
      await executeCode(cmd, 'shell', null);
      
      // Clear input
      setCommandInput('');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const newIndex = historyIndex + 1;
      if (newIndex < commandHistory.length) {
        setHistoryIndex(newIndex);
        setCommandInput(commandHistory[commandHistory.length - 1 - newIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const newIndex = historyIndex - 1;
      if (newIndex >= 0) {
        setHistoryIndex(newIndex);
        setCommandInput(commandHistory[commandHistory.length - 1 - newIndex]);
      } else if (newIndex < 0) {
        setHistoryIndex(-1);
        setCommandInput('');
      }
    }
  };

  return (
    <div className={`terminal ${isFullscreen ? 'terminal--fullscreen' : ''}`}>
      {/* Terminal Header with Tabs */}
      <div className="terminal__header">
        <div className="terminal__tabs">
          {terminalTabs.map((tab) => (
            <div
              key={tab.id}
              className={`terminal__tab ${tab.id === activeTabId ? 'terminal__tab--active' : ''}`}
              onClick={() => setActiveTabId(tab.id)}
            >
              <span className="terminal__tab-label">{tab.label}</span>
              {terminalTabs.length > 1 && (
                <button
                  className="terminal__tab-close"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tab.id);
                  }}
                  title="Close tab"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          <button
            className="terminal__tab-add"
            onClick={() => addTerminalTab(`📟 Term ${Date.now().toString().slice(-3)}`)}
            title="Add new terminal tab"
          >
            +
          </button>
        </div>
        <div className="terminal__actions">
          <button 
            className="terminal__btn terminal__btn--run" 
            onClick={handleAutoRun}
            disabled={terminalRunning}
            title="Auto-detect and run (file, backend, or frontend)"
          >
            {terminalRunning ? '⏳ Running...' : '▶ Run'}
          </button>
          <button 
            className="terminal__btn terminal__btn--clear" 
            onClick={clearTerminal}
            disabled={terminalRunning}
            title="Clear terminal"
          >
            🗑️ Clear
          </button>
          <button 
            className="terminal__btn terminal__btn--fullscreen" 
            onClick={() => setIsFullscreen(!isFullscreen)}
            title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          >
            {isFullscreen ? '⛶ Exit' : '⛶ Full'}
          </button>
        </div>
      </div>

      {/* Terminal Output */}
      <div className="terminal__content" onScroll={handleScroll}>
        <pre className="terminal__output">
          {activeTab?.output}
          {terminalRunning && <span className="terminal__cursor">▋</span>}
          <div ref={terminalEndRef} />
        </pre>
      </div>

      {/* Terminal Input */}
      <div className="terminal__input-area">
        <span className="terminal__prompt">$</span>
        <input
          type="text"
          className="terminal__input"
          placeholder="Type any command... (npm install, pip install, python script.py, etc.)"
          value={commandInput}
          onChange={(e) => setCommandInput(e.target.value)}
          onKeyDown={handleCommandSubmit}
          disabled={terminalRunning}
        />
      </div>

      {/* Terminal Footer - Status */}
      <div className="terminal__footer">
        {terminalStatus === 'running' ? (
          <span className="terminal__status terminal__status--running">⏳ Running...</span>
        ) : terminalStatus === 'success' && activeTab?.output ? (
          <span className="terminal__status terminal__status--done">✅ Successfully compiled!</span>
        ) : terminalStatus === 'error' && activeTab?.output ? (
          <span className="terminal__status terminal__status--error">❌ Error occurred</span>
        ) : activeTab?.output ? (
          <span className="terminal__status terminal__status--done">✓ Done</span>
        ) : (
          <span className="terminal__status terminal__status--idle">
            {activeFile ? `📄 ${activeFile}` : backendPath && frontendPath ? '🔧 Backend & 🎨 Frontend ready' : backendPath ? '🔧 Backend ready' : frontendPath ? '🎨 Frontend ready' : '💡 Open a file or click Run'}
          </span>
        )}
      </div>
    </div>
  );
}
