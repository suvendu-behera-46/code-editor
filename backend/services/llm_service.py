"""
LLM Service — routes AI requests to the correct provider based on model prefix.

Supports:
  OpenAI   : gpt-*
  Anthropic: claude-*
  Google   : gemini-*
  Groq     : groq/*    (free tier — sign up at console.groq.com)
  Ollama   : ollama/*  (100% free, runs locally — install from ollama.com)
"""

import json
import re
import httpx
from fastapi import HTTPException

from config import settings


def _try_parse_json(text: str, error_prefix: str, raw: str):
    """
    Parse JSON with automatic escape-repair fallback.
    LLMs often embed code content that contains invalid JSON escape sequences
    (e.g. \\s, \\d, \\( from regex patterns, or Windows paths like C:\\Users).
    Strategy:
      1. Try json.loads as-is.
      2. If that fails, replace every backslash not followed by a valid JSON
         escape character with a double-backslash, then retry.
      3. Raise HTTP 502 with a helpful message if both attempts fail.
    """
    # First attempt — fast path, no modification
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Second attempt — fix invalid escape sequences
    # Valid JSON escape chars after '\': " \ / b f n r t u
    fixed = re.sub(r'\\(?!["\\\\/bfnrtu])', r'\\\\', text)
    try:
        return json.loads(fixed)
    except json.JSONDecodeError as exc2:
        raise HTTPException(
            502,
            f"{error_prefix} ({exc2}). Raw response (first 600 chars): {raw[:600]}"
        )

SYSTEM_PROMPTS = {
    "edit": (
        "You are an expert code editor. Modify the provided code strictly according to the user's instruction. "
        "Return ONLY the complete modified code with no markdown fences, no explanations, and no preamble."
    ),
    "explain": (
        "You are an expert software engineer. Explain the provided code clearly and concisely. "
        "Use plain English. Format with markdown where helpful."
    ),
    "refactor": (
        "You are an expert code refactorer. Rewrite the provided code to improve its readability, "
        "maintainability, and performance while preserving all existing behaviour. "
        "Return ONLY the refactored code with no markdown fences, no explanations."
    ),
    "generate": (
        "You are an expert programmer. Generate high-quality code based on the user's description. "
        "Return ONLY the code with no markdown fences, no explanations."
    ),
}


def _build_user_message(content: str, prompt: str, mode: str) -> str:
    if mode == "explain":
        return f"Code:\n\n{content}\n\nInstruction: {prompt}"
    return f"Existing code:\n\n{content}\n\nInstruction: {prompt}"


async def _call_openai(model: str, system: str, user_msg: str) -> str:
    if not settings.openai_api_key:
        raise HTTPException(400, "OPENAI_API_KEY is not configured on the server.")

    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {settings.openai_api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user_msg},
                ],
                "temperature": 0.2,
            },
        )

    if resp.status_code != 200:
        raise HTTPException(502, f"OpenAI error {resp.status_code}: {resp.text[:300]}")

    data = resp.json()
    return data["choices"][0]["message"]["content"]


async def _call_anthropic(model: str, system: str, user_msg: str) -> str:
    if not settings.anthropic_api_key:
        raise HTTPException(400, "ANTHROPIC_API_KEY is not configured on the server.")

    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": settings.anthropic_api_key,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "max_tokens": 4096,
                "system": system,
                "messages": [{"role": "user", "content": user_msg}],
            },
        )

    if resp.status_code != 200:
        raise HTTPException(502, f"Anthropic error {resp.status_code}: {resp.text[:300]}")

    data = resp.json()
    return data["content"][0]["text"]


async def _call_gemini(model: str, system: str, user_msg: str) -> str:
    if not settings.gemini_api_key:
        raise HTTPException(400, "GEMINI_API_KEY is not configured on the server.")

    full_prompt = f"{system}\n\n{user_msg}"

    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
            params={"key": settings.gemini_api_key},
            headers={"Content-Type": "application/json"},
            json={
                "contents": [{"parts": [{"text": full_prompt}]}],
                "generationConfig": {"temperature": 0.2},
            },
        )

    if resp.status_code != 200:
        raise HTTPException(502, f"Gemini error {resp.status_code}: {resp.text[:300]}")

    data = resp.json()
    return data["candidates"][0]["content"]["parts"][0]["text"]


async def _call_openai_compat(
    model: str, system: str, user_msg: str,
    base_url: str, api_key: str, provider_name: str
) -> str:
    """Generic OpenAI-compatible chat completions caller (used by Groq, Ollama, etc.)."""
    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            f"{base_url.rstrip('/')}/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user_msg},
                ],
                "temperature": 0.2,
            },
        )

    if resp.status_code != 200:
        raise HTTPException(502, f"{provider_name} error {resp.status_code}: {resp.text[:400]}")

    data = resp.json()
    return data["choices"][0]["message"]["content"]


async def _call_groq(model: str, system: str, user_msg: str) -> str:
    """Groq cloud inference — free tier available at console.groq.com."""
    if not settings.groq_api_key:
        raise HTTPException(
            400,
            "GROQ_API_KEY is not set. Get a free key at https://console.groq.com and add it to backend/.env"
        )
    # Strip the 'groq/' prefix to get the actual Groq model id
    actual_model = model.removeprefix("groq/")
    return await _call_openai_compat(
        actual_model, system, user_msg,
        base_url="https://api.groq.com/openai",
        api_key=settings.groq_api_key,
        provider_name="Groq",
    )


async def _call_ollama(model: str, system: str, user_msg: str) -> str:
    """Ollama local inference — 100% free, runs on your machine."""
    # Strip the 'ollama/' prefix to get the actual model name
    actual_model = model.removeprefix("ollama/")
    return await _call_openai_compat(
        actual_model, system, user_msg,
        base_url=settings.ollama_base_url,
        api_key="ollama",   # Ollama doesn't need a real key but the header must be present
        provider_name="Ollama",
    )


async def run_ai(model: str, content: str, prompt: str, mode: str) -> str:
    """Route the request to the correct LLM provider and return the result."""
    system = SYSTEM_PROMPTS.get(mode, SYSTEM_PROMPTS["edit"])
    user_msg = _build_user_message(content, prompt, mode)

    if model.startswith("gpt"):
        return await _call_openai(model, system, user_msg)
    elif model.startswith("claude"):
        return await _call_anthropic(model, system, user_msg)
    elif model.startswith("gemini"):
        return await _call_gemini(model, system, user_msg)
    elif model.startswith("groq/"):
        return await _call_groq(model, system, user_msg)
    elif model.startswith("ollama/"):
        return await _call_ollama(model, system, user_msg)
    else:
        raise HTTPException(
            400,
            f"Unknown model '{model}'. Supported prefixes: gpt, claude, gemini, groq/, ollama/"
        )


# ─────────────────────────────────────────────────────────────────────────────
# Folder-level generation
# ─────────────────────────────────────────────────────────────────────────────

FOLDER_GENERATE_SYSTEM = (
    "You are an expert software engineer. The user will describe what to build inside a folder. "
    "Your job is to generate the complete set of files needed.\n\n"
    "CRITICAL RULES:\n"
    "1. Respond with ONLY a valid JSON array. No markdown fences, no explanations, no preamble.\n"
    "2. Each element must be an object with exactly two string keys: \"filename\" and \"content\".\n"
    "   Example: [{\"filename\": \"index.js\", \"content\": \"...\"}]\n"
    "3. \"filename\" is the path relative to the target folder (subfolders allowed, e.g. utils/helper.js).\n"
    "4. \"content\" is the full file content as a plain string (not escaped unnecessarily).\n"
    "5. Return 1–20 files. Do not include binary files.\n"
    "6. Start your response with [ and end with ]. Nothing else."
)


def _dispatch_model(model: str):
    """Return the provider call function for the given model prefix."""
    if model.startswith("gpt"):
        return _call_openai
    elif model.startswith("claude"):
        return _call_anthropic
    elif model.startswith("gemini"):
        return _call_gemini
    elif model.startswith("groq/"):
        return _call_groq
    elif model.startswith("ollama/"):
        return _call_ollama
    raise HTTPException(400, f"Unknown model '{model}'.")


async def run_ai_folder_generate(
    model: str,
    folder_path: str,
    prompt: str,
    existing_files: list[str],
) -> list[dict]:
    """Ask the AI to generate multiple files for a folder. Returns list of {filename, content}."""
    ctx = ""
    if existing_files:
        ctx = "\nExisting files already in this folder:\n" + \
              "\n".join(f"  - {f}" for f in existing_files) + "\n"

    label = folder_path.strip("/") or "workspace root"
    user_msg = f'Target folder: "{label}"\n{ctx}\nDescription: {prompt}'

    call_fn = _dispatch_model(model)
    raw = await call_fn(model, FOLDER_GENERATE_SYSTEM, user_msg)

    # Strip optional markdown fences the model might add despite instructions
    text = raw.strip()
    text = re.sub(r'^```[a-zA-Z]*\n?', '', text)
    text = re.sub(r'\n?```$', '', text).strip()

    files = _try_parse_json(text, "AI returned invalid JSON", raw)
    if not isinstance(files, list):
        raise HTTPException(502, f"AI response is not a JSON array. Raw (first 600): {raw[:600]}")
    for f in files:
        if not isinstance(f, dict) or "filename" not in f or "content" not in f:
            raise HTTPException(502, f"Invalid file entry in AI response: {f!r}")
    return files


# ─────────────────────────────────────────────────────────────────────────────
# Agent mode — autonomous project scaffolding, writes files without confirmation
# ─────────────────────────────────────────────────────────────────────────────

CLARIFY_SYSTEM_PROMPT = (
    "You are a helpful coding assistant. The user will describe a project or feature to build. "
    "Your job is to ask 2-4 clarifying questions to better understand their requirements before building. "
    "Ask about: technology stack, project structure, specific features, and any constraints.\n\n"
    "CRITICAL RULES:\n"
    "1. Respond with ONLY a valid JSON object. No markdown fences, no explanations, no preamble.\n"
    "2. The object must have exactly one key \"questions\" (array of strings).\n"
    "3. Each question should be a single line, clear and specific.\n"
    "4. Ask 2-4 questions maximum.\n"
    "5. Start your response with { and end with }. Nothing else."
)

AGENT_SYSTEM_PROMPT = (
    "You are an expert software engineer acting as an autonomous coding agent. "
    "The user will describe a project or feature to build inside a folder. "
    "Generate the COMPLETE project with ALL necessary files — source code, config, "
    "package.json / pyproject.toml / Makefile, README, .gitignore, etc.\n\n"
    "CRITICAL RULES:\n"
    "1. Respond with ONLY a valid JSON object. No markdown fences, no explanations, no preamble.\n"
    "2. The object must have exactly two string keys:\n"
    "   \"files\"  : array of objects, each with \"filename\" (string) and \"content\" (string)\n"
    "   \"summary\": one-sentence plain-text description of what was created\n"
    "3. \"filename\" is the path relative to the target folder (subfolders allowed).\n"
    "4. Every file must have complete, working content — no placeholders, no TODOs.\n"
    "5. Return 1-30 files maximum. No binary files.\n"
    "6. Start your response with { and end with }. Nothing else."
)


async def ask_clarifying_questions(model: str, prompt: str) -> list[str]:
    """
    Ask the AI to generate 2-4 clarifying questions about the user's project request.
    Returns a list of question strings.
    """
    user_msg = f"User request: {prompt}\n\nGenerate clarifying questions now."

    call_fn = _dispatch_model(model)
    raw = await call_fn(model, CLARIFY_SYSTEM_PROMPT, user_msg)

    text = raw.strip()
    text = re.sub(r'^```[a-zA-Z]*\n?', '', text)
    text = re.sub(r'\n?```$', '', text).strip()

    result = _try_parse_json(text, "Failed to generate clarifying questions", raw)
    if not isinstance(result, dict) or "questions" not in result or not isinstance(result["questions"], list):
        raise HTTPException(502, f"Unexpected clarifying-questions format. Raw (first 600): {raw[:600]}")
    questions = result["questions"]
    if not questions:
        raise HTTPException(502, "AI returned an empty questions list.")
    return questions


async def run_agent(model: str, folder_path: str, prompt: str) -> dict:
    """
    Ask the AI to plan a full project and return {files: [...], summary: str}.
    Files are NOT written here — the router handles disk writes.
    """
    label = folder_path.strip("/") or "workspace root"
    user_msg = (
        f'Target folder: "{label}"\n\n'
        f'User request: {prompt}\n\n'
        "Generate the complete project now."
    )

    call_fn = _dispatch_model(model)
    raw = await call_fn(model, AGENT_SYSTEM_PROMPT, user_msg)

    text = raw.strip()
    text = re.sub(r'^```[a-zA-Z]*\n?', '', text)
    text = re.sub(r'\n?```$', '', text).strip()

    result = _try_parse_json(text, "Agent returned invalid JSON", raw)
    if not isinstance(result, dict) or "files" not in result or not isinstance(result["files"], list):
        raise HTTPException(502, f"Unexpected agent response format. Raw (first 600): {raw[:600]}")
    for f in result["files"]:
        if not isinstance(f, dict) or "filename" not in f or "content" not in f:
            raise HTTPException(502, f"Invalid file entry in agent response: {f!r}")
    result.setdefault("summary", f"Created {len(result['files'])} file(s).")
    return result
