from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os

from config import settings
from routers import files, ai, github

app = FastAPI(
    title="AI Code Editor API",
    description="Backend for the AI-powered browser IDE",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(files.router, prefix="/api/files", tags=["files"])
app.include_router(ai.router, prefix="/api/ai", tags=["ai"])
app.include_router(github.router, prefix="/api/github", tags=["github"])

# Ensure workspace directory exists on startup
os.makedirs(settings.workspace_dir, exist_ok=True)


@app.get("/", tags=["health"])
def root():
    return {"status": "ok", "message": "AI Code Editor API v1.0.0"}


@app.get("/health", tags=["health"])
def health():
    return {"status": "ok"}
