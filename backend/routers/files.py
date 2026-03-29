"""
File System Router — CRUD operations on the workspace directory.

All paths are validated to remain within the workspace root (prevents path traversal).
"""

import os
import shutil
import aiofiles
from typing import List, Any
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse

from models.schemas import FileCreateRequest, FileSaveRequest, FileRenameRequest, FileNode, WorkspaceSetRequest, WorkspaceInfo
from workspace_state import get_workspace, set_workspace

router = APIRouter()


def safe_path(relative: str) -> str:
    """Resolve a user-supplied relative path to an absolute path inside the current workspace.
    Raises HTTPException if the result escapes the workspace root."""
    workspace = get_workspace()
    # Strip leading slashes to prevent os.path.join absolute override
    clean = relative.lstrip("/").lstrip("\\")
    full = os.path.normpath(os.path.join(workspace, clean))
    if not full.startswith(workspace + os.sep) and full != workspace:
        raise HTTPException(400, "Invalid path: must be within the workspace.")
    return full


@router.get("/workspace", response_model=WorkspaceInfo)
def get_workspace_endpoint():
    """Return the current workspace directory path."""
    return WorkspaceInfo(path=get_workspace())


@router.post("/workspace", response_model=WorkspaceInfo)
def set_workspace_endpoint(body: WorkspaceSetRequest):
    """Change the active workspace to any directory on the server machine."""
    if not body.path or not body.path.strip():
        raise HTTPException(400, "Path cannot be empty.")
    try:
        resolved = set_workspace(body.path.strip())
        return WorkspaceInfo(path=resolved)
    except Exception as e:
        raise HTTPException(400, f"Cannot set workspace: {e}")


def _build_tree(directory: str, base: str) -> List[Any]:
    """Recursively build a file tree from a directory."""
    items = []
    try:
        entries = sorted(os.scandir(directory), key=lambda e: (not e.is_dir(), e.name.lower()))
    except PermissionError:
        return items

    for entry in entries:
        if entry.name.startswith("."):
            continue
        rel = os.path.relpath(entry.path, base).replace("\\", "/")
        if entry.is_dir():
            items.append({
                "name": entry.name,
                "path": rel,
                "type": "folder",
                "children": _build_tree(entry.path, base),
            })
        else:
            items.append({"name": entry.name, "path": rel, "type": "file"})
    return items


@router.get("/tree")
def get_file_tree():
    """Return the complete file tree of the workspace."""
    workspace = get_workspace()
    os.makedirs(workspace, exist_ok=True)
    return _build_tree(workspace, workspace)


@router.get("/read")
async def read_file(path: str = Query(..., description="Relative path within workspace")):
    """Read and return the content of a file."""
    full = safe_path(path)
    if not os.path.isfile(full):
        raise HTTPException(404, f"File not found: {path}")
    async with aiofiles.open(full, "r", encoding="utf-8", errors="replace") as f:
        content = await f.read()
    return {"path": path, "content": content}


@router.post("/create")
async def create_file(body: FileCreateRequest):
    """Create a new file or directory."""
    full = safe_path(body.path)

    if body.is_directory:
        if os.path.exists(full):
            raise HTTPException(409, f"Directory already exists: {body.path}")
        os.makedirs(full, exist_ok=True)
        return {"success": True, "path": body.path, "type": "folder"}
    else:
        if os.path.exists(full):
            raise HTTPException(409, f"File already exists: {body.path}")
        parent = os.path.dirname(full)
        if parent:
            os.makedirs(parent, exist_ok=True)
        async with aiofiles.open(full, "w", encoding="utf-8") as f:
            await f.write(body.content)
        return {"success": True, "path": body.path, "type": "file"}


@router.put("/save")
async def save_file(body: FileSaveRequest):
    """Save (overwrite) a file's content. Creates parent directories if missing."""
    full = safe_path(body.path)
    parent = os.path.dirname(full)
    if parent:
        os.makedirs(parent, exist_ok=True)
    async with aiofiles.open(full, "w", encoding="utf-8") as f:
        await f.write(body.content)
    return {"success": True, "path": body.path}


@router.delete("/delete")
def delete_file(path: str = Query(..., description="Relative path to delete")):
    """Delete a file or directory (recursively)."""
    full = safe_path(path)
    if not os.path.exists(full):
        raise HTTPException(404, f"Not found: {path}")
    if os.path.isdir(full):
        shutil.rmtree(full)
    else:
        os.remove(full)
    return {"success": True, "path": path}


@router.post("/rename")
def rename_file(body: FileRenameRequest):
    """Rename or move a file/directory within the workspace."""
    old_full = safe_path(body.old_path)
    new_full = safe_path(body.new_path)

    if not os.path.exists(old_full):
        raise HTTPException(404, f"Not found: {body.old_path}")
    if os.path.exists(new_full):
        raise HTTPException(409, f"Target already exists: {body.new_path}")

    os.makedirs(os.path.dirname(new_full), exist_ok=True)
    shutil.move(old_full, new_full)
    return {"success": True, "old_path": body.old_path, "new_path": body.new_path}
