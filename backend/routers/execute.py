"""
Code Execution Router — executes code in a sandboxed environment.
Supports Python, JavaScript, Node.js, and shell commands.
"""

import subprocess
import os
import sys
import tempfile
from typing import Optional
from fastapi import APIRouter
from pydantic import BaseModel
from config import settings

router = APIRouter()


class ExecuteRequest(BaseModel):
    code: str
    language: str  # 'python', 'javascript', 'shell', etc.
    timeout: int = 60
    cwd: Optional[str] = None  # Optional working directory for command execution


class ExecuteResponse(BaseModel):
    success: bool
    output: str = ""
    error: str = ""
    exit_code: int = 0


def detect_language(code: str) -> str:
    """Auto-detect language from shebang or common patterns."""
    lines = code.strip().split('\n')
    if lines and lines[0].startswith('#!'):
        if 'python' in lines[0]:
            return 'python'
        elif 'node' in lines[0] or 'javascript' in lines[0]:
            return 'javascript'
    
    # Check for language keywords
    if 'import ' in code or 'def ' in code or code.strip().startswith('python'):
        return 'python'
    if 'require(' in code or 'console.log' in code:
        return 'javascript'
    
    return 'python'  # default


def get_project_root():
    """Get the working directory for generated files."""
    # Get the workspace directory from settings
    workspace_dir = settings.workspace_dir
    
    # If it's a relative path, make it absolute relative to the backend directory
    if not os.path.isabs(workspace_dir):
        backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # d:\projects\code-editor\backend
        workspace_dir = os.path.join(backend_dir, workspace_dir)
    
    # Ensure the workspace directory exists
    os.makedirs(workspace_dir, exist_ok=True)
    
    return workspace_dir


@router.post("/execute", response_model=ExecuteResponse)
def execute_code(req: ExecuteRequest):
    """
    Execute code in a sandboxed environment.
    
    Supported languages:
    - python: Executes with Python interpreter
    - javascript/node: Executes with Node.js
    - shell/bash: Executes shell commands (npm install, pip install, etc.)
    
    Args:
        code: Source code to execute
        language: Language identifier
        timeout: Max execution time in seconds (default: 60)
    
    Returns:
        ExecuteResponse: Contains stdout, stderr, and exit code
    """
    language = req.language.lower().strip()
    if not language:
        language = detect_language(req.code)
    
    try:
        # ── Python ──────────────────────────────────────────────────────────────
        if language in ['python', 'py']:
            with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
                f.write(req.code)
                temp_file = f.name
            
            try:
                result = subprocess.run(
                    [sys.executable, temp_file],
                    capture_output=True,
                    text=True,
                    timeout=req.timeout,
                )
                output = result.stdout
                error = result.stderr
                exit_code = result.returncode
            finally:
                os.unlink(temp_file)
        
        # ── JavaScript/Node.js ──────────────────────────────────────────────────
        elif language in ['javascript', 'js', 'node', 'nodejs']:
            with tempfile.NamedTemporaryFile(mode='w', suffix='.js', delete=False) as f:
                f.write(req.code)
                temp_file = f.name
            
            try:
                result = subprocess.run(
                    ['node', temp_file],
                    capture_output=True,
                    text=True,
                    timeout=req.timeout,
                )
                output = result.stdout
                error = result.stderr
                exit_code = result.returncode
            finally:
                os.unlink(temp_file)
        
        # ── Shell/Bash (supports npm, pip, python, etc.) ──────────────────────
        elif language in ['shell', 'bash', 'sh', 'cmd']:
            # Use provided cwd or fall back to workspace directory
            work_dir = req.cwd if req.cwd else get_project_root()
            
            result = subprocess.run(
                req.code,
                shell=True,
                capture_output=True,
                text=True,
                timeout=req.timeout,
                cwd=work_dir,  # Execute from workspace or provided directory
            )
            
            output = result.stdout
            error = result.stderr
            exit_code = result.returncode
        
        # ── Unknown language ───────────────────────────────────────────────────
        else:
            return ExecuteResponse(
                success=False,
                error=f"Unsupported language: {language}. Supported: python, javascript, shell",
                exit_code=1,
            )
        
        success = exit_code == 0
        return ExecuteResponse(
            success=success,
            output=output,
            error=error,
            exit_code=exit_code,
        )
    
    except subprocess.TimeoutExpired:
        return ExecuteResponse(
            success=False,
            error=f"Code execution timeout ({req.timeout}s exceeded)",
            exit_code=124,
        )
    except Exception as e:
        return ExecuteResponse(
            success=False,
            error=str(e),
            exit_code=1,
        )


@router.get("/workspace-info")
def get_workspace_info():
    """Get information about the workspace directory where AI-generated files are stored."""
    workspace_path = get_project_root()
    return {
        "workspace_path": workspace_path,
        "workspace_exists": os.path.exists(workspace_path),
        "absolute_path": os.path.abspath(workspace_path),
    }
