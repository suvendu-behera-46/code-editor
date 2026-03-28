"""
Development server runner.

Starts uvicorn with hot-reload but explicitly EXCLUDES the workspace directory
so that saving files to the workspace doesn't trigger a server restart
(which would ECONNRESET any in-flight requests).

Usage:
    python run.py
"""

import uvicorn
import os

if __name__ == "__main__":
    # Ensure workspace exists before starting
    os.makedirs("workspace", exist_ok=True)

    uvicorn.run(
        "main:app",
        host="127.0.0.1",
        port=8000,
        reload=True,
        # Only watch Python source files for reload — NOT workspace/
        reload_dirs=["."],
        reload_excludes=["workspace", "*.pyc", "__pycache__", ".env", "venv"],
        log_level="info",
    )
