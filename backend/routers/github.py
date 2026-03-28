"""
GitHub Router — proxy endpoints for GitHub REST API operations.

Tokens are passed per-request (never stored server-side).
"""

from fastapi import APIRouter, HTTPException, Query
from models.schemas import GitHubCommitRequest, GitHubCommitResponse, WorkflowTriggerRequest
from services import github_service

router = APIRouter()


@router.get("/user")
async def get_github_user(token: str = Query(..., description="GitHub PAT")):
    """Verify token and return GitHub user info."""
    return await github_service.get_user(token)


@router.get("/repos")
async def list_repos(token: str = Query(..., description="GitHub PAT")):
    """List repositories accessible by the token."""
    repos = await github_service.list_repos(token)
    return [
        {
            "full_name": r["full_name"],
            "name": r["name"],
            "owner": r["owner"]["login"],
            "default_branch": r["default_branch"],
            "private": r["private"],
        }
        for r in repos
    ]


@router.get("/branches")
async def list_branches(
    token: str = Query(...),
    owner: str = Query(...),
    repo: str = Query(...),
):
    """List branches for a repository."""
    return await github_service.list_branches(token, owner, repo)


@router.post("/commit", response_model=GitHubCommitResponse)
async def commit_files(body: GitHubCommitRequest):
    """Commit one or more files to a GitHub repository."""
    if not body.files:
        raise HTTPException(400, "No files provided to commit.")

    files_data = [{"path": f.path, "content": f.content} for f in body.files]
    sha = await github_service.commit_files(
        token=body.token,
        owner=body.owner,
        repo=body.repo,
        branch=body.branch,
        message=body.message,
        files=files_data,
    )
    return GitHubCommitResponse(
        success=True,
        commit_sha=sha,
        message=f"Successfully committed {len(body.files)} file(s).",
    )


@router.get("/workflows")
async def list_workflows(
    token: str = Query(...),
    owner: str = Query(...),
    repo: str = Query(...),
):
    """List GitHub Actions workflows for a repository."""
    workflows = await github_service.list_workflows(token, owner, repo)
    return [
        {"id": w["id"], "name": w["name"], "state": w["state"], "path": w["path"]}
        for w in workflows
    ]


@router.get("/workflow-runs")
async def list_workflow_runs(
    token: str = Query(...),
    owner: str = Query(...),
    repo: str = Query(...),
):
    """Get the 10 most recent workflow runs."""
    runs = await github_service.list_workflow_runs(token, owner, repo)
    return [
        {
            "id": r["id"],
            "name": r["name"],
            "status": r["status"],
            "conclusion": r.get("conclusion"),
            "branch": r["head_branch"],
            "created_at": r["created_at"],
            "html_url": r["html_url"],
        }
        for r in runs
    ]


@router.post("/workflow-trigger")
async def trigger_workflow(body: WorkflowTriggerRequest):
    """Manually trigger a workflow_dispatch event."""
    success = await github_service.trigger_workflow(
        token=body.token,
        owner=body.owner,
        repo=body.repo,
        workflow_id=body.workflow_id,
        ref=body.ref,
        inputs=body.inputs,
    )
    if not success:
        raise HTTPException(500, "Failed to trigger workflow.")
    return {"success": True, "message": f"Workflow '{body.workflow_id}' triggered on '{body.ref}'."}
