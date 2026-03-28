from pydantic import BaseModel
from typing import Optional, List, Any


# ── File schemas ──────────────────────────────────────────────────────────────

class FileCreateRequest(BaseModel):
    path: str
    content: str = ""
    is_directory: bool = False


class FileSaveRequest(BaseModel):
    path: str
    content: str


class FileRenameRequest(BaseModel):
    old_path: str
    new_path: str


class FileNode(BaseModel):
    name: str
    path: str
    type: str  # "file" | "folder"
    children: Optional[List[Any]] = None  # recursive for folders


# ── AI schemas ────────────────────────────────────────────────────────────────

class AIEditRequest(BaseModel):
    file_path: str
    content: str
    prompt: str
    model: str
    mode: str = "edit"  # edit | explain | refactor | generate


class AIEditResponse(BaseModel):
    result: str
    mode: str
    model: str


class AIFolderGenerateRequest(BaseModel):
    folder_path: str          # workspace-relative path to target folder ("" = root)
    prompt: str
    model: str


class AIFolderGenerateFile(BaseModel):
    filename: str             # path relative to folder_path
    path: str                 # workspace-relative full path (for opening in editor)
    content: str


class AIFolderGenerateResponse(BaseModel):
    folder_path: str
    files: List[AIFolderGenerateFile]
    model: str


class ModelInfo(BaseModel):
    id: str
    label: str
    provider: str


# ── GitHub schemas ─────────────────────────────────────────────────────────────

class GitHubCommitRequest(BaseModel):
    token: str
    owner: str
    repo: str
    branch: str = "main"
    message: str
    files: List[FileSaveRequest]  # list of {path, content} to commit


class GitHubCommitResponse(BaseModel):
    success: bool
    commit_sha: Optional[str] = None
    message: str


class WorkflowTriggerRequest(BaseModel):
    token: str
    owner: str
    repo: str
    workflow_id: str
    ref: str = "main"
    inputs: dict = {}
