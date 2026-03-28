import React, { useRef, useState } from 'react';
import { useEditorStore } from '../../store/editorStore';
import { api } from '../../api';
import FileTreeItem from './FileTreeItem';

// File extensions we treat as text (everything else is skipped silently)
const TEXT_EXTENSIONS = new Set([
  'js','jsx','ts','tsx','mjs','cjs','mts','cts',
  'py','pyw','rb','php','go','rs','java','kt','kts','swift','cs','cpp','cc','cxx','c','h','hxx',
  'html','htm','css','scss','sass','less',
  'json','jsonc','yaml','yml','toml','ini','cfg','conf','env',
  'md','mdx','txt','log','csv','xml','svg','graphql','gql','sql',
  'sh','bash','zsh','fish','ps1',
  'dockerfile','makefile','rakefile','gemfile','procfile',
  'tf','hcl','vue','astro',
]);

function isTextFile(filename) {
  const lower = filename.toLowerCase();
  // No extension files like Dockerfile, Makefile, etc.
  if (!lower.includes('.')) return true;
  const ext = lower.split('.').pop();
  return TEXT_EXTENSIONS.has(ext);
}

function readAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => reject(new Error(`Cannot read ${file.name}`));
    reader.readAsText(file);
  });
}

export default function FileTree() {
  const { fileTree, loadFileTree, createFile, createFolder, openFile } = useEditorStore();

  const fileInputRef   = useRef(null);
  const folderInputRef = useRef(null);

  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState(null); // {ok, count} | null

  // ── Create new file/folder via prompt ──────────────────────────────────────

  const handleNewFile = async () => {
    const name = window.prompt('File name (e.g. index.js):');
    if (!name?.trim()) return;
    try {
      await createFile(name.trim());
    } catch (err) {
      alert(err.response?.data?.detail || err.message);
    }
  };

  const handleNewFolder = async () => {
    const name = window.prompt('Folder name:');
    if (!name?.trim()) return;
    try {
      await createFolder(name.trim());
    } catch (err) {
      alert(err.response?.data?.detail || err.message);
    }
  };

  // ── Local file/folder import ───────────────────────────────────────────────

  // Takes an array of browser File objects + a path resolver function
  // path resolver: (file) => string   e.g. file.name or file.webkitRelativePath
  const importFiles = async (files, getPath) => {
    const textFiles = Array.from(files).filter((f) => isTextFile(f.name));
    if (textFiles.length === 0) {
      setImportStatus({ ok: false, count: 0 });
      setTimeout(() => setImportStatus(null), 3000);
      return;
    }

    setImporting(true);
    setImportStatus(null);
    let saved = 0;
    let firstPath = null;

    for (const file of textFiles) {
      try {
        const content = await readAsText(file);
        const path = getPath(file);
        await api.saveFile(path, content);
        if (!firstPath) firstPath = path;
        saved++;
      } catch {
        // skip unreadable files
      }
    }

    await loadFileTree();
    setImporting(false);
    setImportStatus({ ok: true, count: saved });
    setTimeout(() => setImportStatus(null), 3000);

    // Auto-open the file if only one was imported
    if (saved === 1 && firstPath) openFile(firstPath);
  };

  const handleLocalFiles = async (e) => {
    if (!e.target.files?.length) return;
    await importFiles(e.target.files, (f) => f.name);
    e.target.value = '';             // reset so same file can be re-picked
  };

  const handleLocalFolder = async (e) => {
    // Empty folder: browser gives 0 files for webkitdirectory — prompt for name and create it
    if (!e.target.files?.length) {
      e.target.value = '';
      const name = window.prompt(
        'The folder appears to be empty.\nEnter the folder name to create in workspace:'
      );
      if (!name?.trim()) return;
      try {
        await createFolder(name.trim());
      } catch (err) {
        alert(err.response?.data?.detail || err.message);
      }
      return;
    }
    // webkitRelativePath = "FolderName/sub/file.js" — preserve full relative path
    await importFiles(e.target.files, (f) => f.webkitRelativePath || f.name);
    e.target.value = '';
  };

  // ── New Project ──────────────────────────────────────────────────────────────────

  const handleNewProject = async () => {
    const name = window.prompt('Project name (creates a new root folder):');
    if (!name?.trim()) return;
    try {
      await createFolder(name.trim());
    } catch (err) {
      alert(err.response?.data?.detail || err.message);
    }
  };

  return (
    <>
      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        style={{ display: 'none' }}
        onChange={handleLocalFiles}
      />
      <input
        ref={folderInputRef}
        type="file"
        // eslint-disable-next-line react/no-unknown-property
        webkitdirectory=""
        directory=""
        multiple
        style={{ display: 'none' }}
        onChange={handleLocalFolder}
      />

      <div className="left-panel__header">
        <span className="left-panel__title">Explorer</span>
        <div className="left-panel__actions">
          <button
            className="left-panel__action-btn"
            onClick={handleNewFile}
            title="New File"
          >
            +
          </button>
          <button
            className="left-panel__action-btn"
            onClick={handleNewFolder}
            title="New Folder"
          >
            ⊞
          </button>
          <button
            className="left-panel__action-btn"
            onClick={handleNewProject}
            title="New Project (creates a root folder)"
          >
            🏗
          </button>
          {/* ── System file / folder pickers ── */}
          <button
            className="left-panel__action-btn"
            onClick={() => fileInputRef.current?.click()}
            title="Open file(s) from disk"
            disabled={importing}
          >
            📂
          </button>
          <button
            className="left-panel__action-btn"
            onClick={() => folderInputRef.current?.click()}
            title="Open folder from disk"
            disabled={importing}
          >
            🗂
          </button>
          <button
            className="left-panel__action-btn"
            onClick={loadFileTree}
            title="Refresh"
          >
            ↺
          </button>
        </div>
      </div>

      {/* Import status banner */}
      {(importing || importStatus) && (
        <div style={{
          padding: '4px 10px',
          fontSize: 11,
          background: importing
            ? 'var(--bg-input)'
            : importStatus?.ok
              ? 'rgba(76,175,80,0.15)'
              : 'rgba(244,71,71,0.12)',
          color: importing
            ? 'var(--text-secondary)'
            : importStatus?.ok
              ? 'var(--text-success)'
              : 'var(--text-error)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}>
          {importing && <span className="spinner" style={{ width: 10, height: 10, borderWidth: 1.5 }} />}
          {importing
            ? 'Importing files…'
            : importStatus?.ok
              ? `✓ Imported ${importStatus.count} file${importStatus.count !== 1 ? 's' : ''}`
              : '⚠ No text files found to import'}
        </div>
      )}

      <div className="file-tree">
        {fileTree.length === 0 ? (
          <div style={{ padding: '12px', fontSize: 11, color: 'var(--text-disabled)', textAlign: 'center' }}>
            No files yet.
            <br />
            Click + for a new file, 🏗 for a new project,
            <br />
            or 📂 / 🗂 to open from disk.
          </div>
        ) : (
          fileTree.map((node) => (
            <FileTreeItem key={node.path} node={node} depth={0} />
          ))
        )}
      </div>
    </>
  );
}
