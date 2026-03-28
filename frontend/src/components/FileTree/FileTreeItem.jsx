import React, { useState } from 'react';
import { getFolderIcon, getFileIcon } from '../../utils/languageDetect';
import { useEditorStore } from '../../store/editorStore';

export default function FileTreeItem({ node, depth = 0 }) {
  const [open, setOpen] = useState(depth === 0);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');

  const { activeFile, openFile, deleteNode, renameNode } = useEditorStore();
  const isFolder = node.type === 'folder';
  const isActive = !isFolder && activeFile === node.path;
  const indent = depth * 12 + 8;

  const handleClick = () => {
    if (isFolder) {
      setOpen((o) => !o);
    } else {
      openFile(node.path);
    }
  };

  const handleDelete = (e) => {
    e.stopPropagation();
    if (window.confirm(`Delete "${node.name}"?`)) {
      deleteNode(node.path);
    }
  };

  const handleRenameStart = (e) => {
    e.stopPropagation();
    setRenameValue(node.name);
    setRenaming(true);
  };

  const handleRenameSubmit = async (e) => {
    e.preventDefault();
    if (renameValue.trim() && renameValue !== node.name) {
      const parts = node.path.split('/');
      parts[parts.length - 1] = renameValue.trim();
      const newPath = parts.join('/');
      await renameNode(node.path, newPath);
    }
    setRenaming(false);
  };

  if (renaming) {
    return (
      <form
        onSubmit={handleRenameSubmit}
        style={{ paddingLeft: indent, display: 'flex', alignItems: 'center', height: 22 }}
      >
        <input
          autoFocus
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onBlur={handleRenameSubmit}
          onKeyDown={(e) => e.key === 'Escape' && setRenaming(false)}
          style={{
            flex: 1, height: 20, fontSize: 12, padding: '0 4px',
            background: 'var(--bg-selected)', color: '#fff',
            border: '1px solid var(--accent)', borderRadius: 2,
          }}
        />
      </form>
    );
  }

  return (
    <>
      <div
        className={`tree-item${isActive ? ' active' : ''}`}
        style={{ paddingLeft: indent }}
        onClick={handleClick}
        onDoubleClick={isFolder ? undefined : handleRenameStart}
        title={node.path}
      >
        {isFolder && (
          <span className={`tree-item__chevron${open ? ' open' : ''}`}>▶</span>
        )}
        {!isFolder && <span style={{ width: 16, flexShrink: 0 }} />}

        <span className="tree-item__icon">
          {isFolder ? getFolderIcon(open) : getFileIcon(node.name)}
        </span>

        <span className="tree-item__name">{node.name}</span>

        <button
          className="tree-item__delete"
          onClick={handleDelete}
          title={`Delete ${node.name}`}
        >
          ×
        </button>
      </div>

      {isFolder && open && node.children?.map((child) => (
        <FileTreeItem key={child.path} node={child} depth={depth + 1} />
      ))}
    </>
  );
}
