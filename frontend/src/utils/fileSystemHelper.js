/**
 * File System Access API helpers.
 * These functions operate directly on the user's local filesystem
 * through a FileSystemDirectoryHandle — no backend involved.
 */

/** Read a file from a directory handle by relative path. */
export async function fsReadFile(dirHandle, relativePath) {
  const parts = relativePath.replace(/\\/g, '/').split('/').filter(Boolean);
  let current = dirHandle;
  for (let i = 0; i < parts.length - 1; i++) {
    current = await current.getDirectoryHandle(parts[i]);
  }
  const fileHandle = await current.getFileHandle(parts[parts.length - 1]);
  const file = await fileHandle.getFile();
  return await file.text();
}

/** Write (create or overwrite) a file. Creates parent directories automatically. */
export async function fsWriteFile(dirHandle, relativePath, content) {
  const parts = relativePath.replace(/\\/g, '/').split('/').filter(Boolean);
  let current = dirHandle;
  for (let i = 0; i < parts.length - 1; i++) {
    current = await current.getDirectoryHandle(parts[i], { create: true });
  }
  const fileHandle = await current.getFileHandle(parts[parts.length - 1], { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
}

/** Create a directory (and any missing parent directories). */
export async function fsCreateDir(dirHandle, relativePath) {
  const parts = relativePath.replace(/\\/g, '/').split('/').filter(Boolean);
  let current = dirHandle;
  for (const part of parts) {
    current = await current.getDirectoryHandle(part, { create: true });
  }
}

/** Delete a file or directory (recursively). */
export async function fsDeleteEntry(dirHandle, relativePath) {
  const parts = relativePath.replace(/\\/g, '/').split('/').filter(Boolean);
  let current = dirHandle;
  for (let i = 0; i < parts.length - 1; i++) {
    current = await current.getDirectoryHandle(parts[i]);
  }
  await current.removeEntry(parts[parts.length - 1], { recursive: true });
}

/** Rename/move a file or directory by copying then deleting old entry. */
export async function fsRenameEntry(dirHandle, oldPath, newPath) {
  const content = await fsReadFile(dirHandle, oldPath);
  await fsWriteFile(dirHandle, newPath, content);
  await fsDeleteEntry(dirHandle, oldPath);
}

/** Recursively build a file tree from a directory handle. */
export async function fsBuildTree(dirHandle, basePath = '') {
  const items = [];
  for await (const [name, handle] of dirHandle.entries()) {
    if (name.startsWith('.')) continue;
    const itemPath = basePath ? `${basePath}/${name}` : name;
    if (handle.kind === 'directory') {
      const children = await fsBuildTree(handle, itemPath);
      items.push({ name, path: itemPath, type: 'folder', children });
    } else {
      items.push({ name, path: itemPath, type: 'file' });
    }
  }
  // Folders first, then alphabetical
  return items.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}
