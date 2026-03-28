"""
AI Router — forwards edit/explain/refactor/generate requests to LLM providers.
"""

import os
from fastapi import APIRouter
from config import settings
from models.schemas import (
    AIEditRequest, AIEditResponse,
    AIFolderGenerateRequest, AIFolderGenerateResponse, AIFolderGenerateFile,
    ModelInfo,
)
from services.llm_service import run_ai, run_ai_folder_generate
from routers.files import safe_path

router = APIRouter()

AVAILABLE_MODELS = [
    # ── Free tier (no credit card needed) ──────────────────────────────────────
    ModelInfo(id="groq/llama-3.3-70b-versatile",   label="Llama 3.3 70B (Free)",    provider="Groq (Free)"),
    ModelInfo(id="groq/llama-3.1-8b-instant",       label="Llama 3.1 8B – Fast (Free)", provider="Groq (Free)"),
    ModelInfo(id="groq/mixtral-8x7b-32768",         label="Mixtral 8x7B (Free)",     provider="Groq (Free)"),
    ModelInfo(id="groq/gemma2-9b-it",               label="Gemma 2 9B (Free)",       provider="Groq (Free)"),
    # ── Local / Ollama (fully free, runs on your machine) ──────────────────────
    ModelInfo(id="ollama/llama3.2",   label="Llama 3.2 (Local)",    provider="Ollama (Local)"),
    ModelInfo(id="ollama/mistral",    label="Mistral 7B (Local)",   provider="Ollama (Local)"),
    ModelInfo(id="ollama/codellama",  label="CodeLlama (Local)",    provider="Ollama (Local)"),
    ModelInfo(id="ollama/deepseek-coder", label="DeepSeek Coder (Local)", provider="Ollama (Local)"),
    # ── OpenAI (paid) ──────────────────────────────────────────────────────────
    ModelInfo(id="gpt-4o",           label="GPT-4o",        provider="OpenAI"),
    ModelInfo(id="gpt-4-turbo",      label="GPT-4 Turbo",   provider="OpenAI"),
    ModelInfo(id="gpt-3.5-turbo",    label="GPT-3.5 Turbo", provider="OpenAI"),
    # ── Anthropic (paid) ───────────────────────────────────────────────────────
    ModelInfo(id="claude-3-5-sonnet-20241022", label="Claude 3.5 Sonnet", provider="Anthropic"),
    ModelInfo(id="claude-3-opus-20240229",     label="Claude 3 Opus",     provider="Anthropic"),
    ModelInfo(id="claude-3-haiku-20240307",    label="Claude 3 Haiku",    provider="Anthropic"),
    # ── Google (paid) ──────────────────────────────────────────────────────────
    ModelInfo(id="gemini-1.5-pro",   label="Gemini 1.5 Pro",   provider="Google"),
    ModelInfo(id="gemini-1.5-flash", label="Gemini 1.5 Flash", provider="Google"),
]


@router.get("/models", response_model=list[ModelInfo])
def get_models():
    """List all supported AI models."""
    return AVAILABLE_MODELS


@router.post("/edit", response_model=AIEditResponse)
async def edit_with_ai(body: AIEditRequest):
    """
    Send file content + prompt to an AI model.
    Returns the AI's result (modified code, explanation, etc.)
    """
    result = await run_ai(
        model=body.model,
        content=body.content,
        prompt=body.prompt,
        mode=body.mode,
    )
    return AIEditResponse(result=result, mode=body.mode, model=body.model)


@router.post("/generate-folder", response_model=AIFolderGenerateResponse)
async def generate_in_folder(body: AIFolderGenerateRequest):
    """
    Ask the AI to generate one or more files for a folder.
    Returns the proposed file list WITHOUT writing anything to disk.
    The client reviews each file and calls /files/save to accept individual files.
    """
    workspace = os.path.abspath(settings.workspace_dir)

    # Resolve target folder (empty string or "/" means workspace root)
    folder_rel = body.folder_path.strip().strip("/")
    folder_abs = safe_path(folder_rel) if folder_rel else workspace

    # Gather existing files for AI context (folder may not exist yet — that’s fine)
    existing: list[str] = []
    if os.path.isdir(folder_abs):
        for root, dirs, files in os.walk(folder_abs):
            dirs[:] = [d for d in dirs if not d.startswith(".")]
            for fname in files:
                if not fname.startswith("."):
                    rel = os.path.relpath(os.path.join(root, fname), folder_abs).replace("\\", "/")
                    existing.append(rel)

    # Call AI — returns [{filename, content}, ...]
    file_list = await run_ai_folder_generate(
        model=body.model,
        folder_path=folder_rel,
        prompt=body.prompt,
        existing_files=existing,
    )

    # Validate paths (security) and build response — nothing is written to disk here
    proposed: list[AIFolderGenerateFile] = []
    for item in file_list:
        filename = item["filename"].lstrip("/").lstrip("\\")
        content = item.get("content", "")

        file_abs = os.path.normpath(os.path.join(folder_abs, filename))
        # Security: reject any path that escapes the workspace
        if not file_abs.startswith(workspace + os.sep) and file_abs != workspace:
            continue

        ws_rel = os.path.relpath(file_abs, workspace).replace("\\", "/")
        proposed.append(AIFolderGenerateFile(filename=filename, path=ws_rel, content=content))

    return AIFolderGenerateResponse(
        folder_path=folder_rel,
        files=proposed,
        model=body.model,
    )
