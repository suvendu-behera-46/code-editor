"""
GitHub Service — wraps the GitHub REST API for file commits and repo queries.

Uses Personal Access Tokens (PAT) or OAuth tokens passed per-request.
No tokens are stored server-side.
"""

import base64
import httpx
from fastapi import HTTPException
from typing import Optional


GITHUB_API = "https://api.github.com"


def _headers(token: str) -> dict:
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


async def get_user(token: str) -> dict:
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(f"{GITHUB_API}/user", headers=_headers(token))
    if resp.status_code != 200:
        raise HTTPException(401, "Invalid GitHub token or insufficient permissions.")
    return resp.json()


async def list_repos(token: str) -> list:
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            f"{GITHUB_API}/user/repos",
            headers=_headers(token),
            params={"per_page": 100, "sort": "updated"},
        )
    if resp.status_code != 200:
        raise HTTPException(resp.status_code, f"GitHub error: {resp.text[:200]}")
    return resp.json()


async def list_branches(token: str, owner: str, repo: str) -> list:
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            f"{GITHUB_API}/repos/{owner}/{repo}/branches",
            headers=_headers(token),
        )
    if resp.status_code != 200:
        raise HTTPException(resp.status_code, f"GitHub error: {resp.text[:200]}")
    return [b["name"] for b in resp.json()]


async def _get_file_sha(
    client: httpx.AsyncClient,
    token: str,
    owner: str,
    repo: str,
    path: str,
    branch: str,
) -> Optional[str]:
    """Get the SHA of an existing file (needed for updates). Returns None if new file."""
    resp = await client.get(
        f"{GITHUB_API}/repos/{owner}/{repo}/contents/{path}",
        headers=_headers(token),
        params={"ref": branch},
    )
    if resp.status_code == 200:
        return resp.json().get("sha")
    return None


async def commit_files(
    token: str,
    owner: str,
    repo: str,
    branch: str,
    message: str,
    files: list,  # list of {"path": str, "content": str}
) -> str:
    """
    Commit one or more files to a GitHub repo via the Contents API.
    Returns the commit SHA of the last committed file.
    """
    last_sha = ""

    async with httpx.AsyncClient(timeout=60) as client:
        for file in files:
            path = file["path"].lstrip("/")
            content_b64 = base64.b64encode(file["content"].encode()).decode()

            # Get existing SHA if file exists (required for updates)
            existing_sha = await _get_file_sha(client, token, owner, repo, path, branch)

            body = {
                "message": message,
                "content": content_b64,
                "branch": branch,
            }
            if existing_sha:
                body["sha"] = existing_sha

            resp = await client.put(
                f"{GITHUB_API}/repos/{owner}/{repo}/contents/{path}",
                headers=_headers(token),
                json=body,
            )

            if resp.status_code not in (200, 201):
                raise HTTPException(
                    resp.status_code,
                    f"Failed to commit '{path}': {resp.text[:300]}",
                )

            last_sha = resp.json().get("commit", {}).get("sha", "")

    return last_sha


async def trigger_workflow(
    token: str,
    owner: str,
    repo: str,
    workflow_id: str,
    ref: str = "main",
    inputs: dict = None,
) -> bool:
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{GITHUB_API}/repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches",
            headers=_headers(token),
            json={"ref": ref, "inputs": inputs or {}},
        )
    return resp.status_code == 204


async def list_workflow_runs(token: str, owner: str, repo: str) -> list:
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            f"{GITHUB_API}/repos/{owner}/{repo}/actions/runs",
            headers=_headers(token),
            params={"per_page": 10},
        )
    if resp.status_code != 200:
        raise HTTPException(resp.status_code, f"GitHub error: {resp.text[:200]}")
    return resp.json().get("workflow_runs", [])


async def list_workflows(token: str, owner: str, repo: str) -> list:
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            f"{GITHUB_API}/repos/{owner}/{repo}/actions/workflows",
            headers=_headers(token),
        )
    if resp.status_code != 200:
        raise HTTPException(resp.status_code, f"GitHub error: {resp.text[:200]}")
    return resp.json().get("workflows", [])
