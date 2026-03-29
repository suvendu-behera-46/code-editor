"""
Mutable workspace directory state.

The workspace starts from settings.workspace_dir (in .env) but can be
changed at runtime via the POST /api/files/workspace endpoint so users
can point it at any real folder on their laptop.
"""

import os
from config import settings

# Resolve the initial workspace to an absolute path on startup
_workspace: str = os.path.abspath(settings.workspace_dir)
os.makedirs(_workspace, exist_ok=True)


def get_workspace() -> str:
    """Return the current absolute workspace path."""
    return _workspace


def set_workspace(path: str) -> str:
    """
    Change the active workspace to the given absolute path.
    Creates the directory if it doesn't exist.
    Returns the resolved absolute path.
    """
    global _workspace
    resolved = os.path.abspath(path)
    os.makedirs(resolved, exist_ok=True)
    _workspace = resolved
    return _workspace
