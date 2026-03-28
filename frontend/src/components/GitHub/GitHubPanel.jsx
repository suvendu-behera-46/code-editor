import React, { useState } from 'react';
import { useEditorStore } from '../../store/editorStore';
import { api } from '../../api';

const STATUS_COLOR = {
  success: 'success',
  completed: 'success',
  failure: 'failure',
  in_progress: 'in_progress',
  queued: 'queued',
};

export default function GitHubPanel() {
  const {
    githubToken, setGithubToken,
    githubUser, setGithubUser,
    repoOwner, setRepoOwner,
    repoName, setRepoName,
    repoBranch, setRepoBranch,
    commitMessage, setCommitMessage,
    githubStatus, setGithubStatus,
    files, openTabs, unsavedFiles,
  } = useEditorStore();

  const [branches, setBranches] = useState([]);
  const [workflowRuns, setWorkflowRuns] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleVerifyToken = async () => {
    if (!githubToken.trim()) return;
    setLoading(true);
    try {
      const user = await api.getGithubUser(githubToken);
      setGithubUser(user);
      setGithubStatus({ type: 'success', message: `Signed in as ${user.login}` });
    } catch {
      setGithubStatus({ type: 'error', message: 'Invalid token or network error' });
      setGithubUser(null);
    } finally {
      setLoading(false);
    }
  };

  const handleLoadBranches = async () => {
    if (!repoOwner || !repoName) return;
    setLoading(true);
    try {
      const list = await api.listBranches(githubToken, repoOwner, repoName);
      setBranches(list);
    } catch (err) {
      setGithubStatus({ type: 'error', message: err.response?.data?.detail || err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleCommit = async () => {
    if (!commitMessage.trim()) {
      setGithubStatus({ type: 'error', message: 'Commit message cannot be empty' });
      return;
    }
    if (!repoOwner || !repoName) {
      setGithubStatus({ type: 'error', message: 'Owner and repo name are required' });
      return;
    }

    // Commit all open tabs (or all unsaved)
    const filesToCommit = openTabs
      .filter((p) => files[p] !== undefined)
      .map((p) => ({ path: p, content: files[p] }));

    if (filesToCommit.length === 0) {
      setGithubStatus({ type: 'error', message: 'No files are open to commit' });
      return;
    }

    setLoading(true);
    try {
      const result = await api.commitFiles({
        token: githubToken,
        owner: repoOwner,
        repo: repoName,
        branch: repoBranch,
        message: commitMessage,
        files: filesToCommit,
      });
      setGithubStatus({ type: 'success', message: `Committed ${filesToCommit.length} file(s). SHA: ${result.commit_sha?.slice(0, 7)}` });
      setCommitMessage('');
    } catch (err) {
      setGithubStatus({ type: 'error', message: err.response?.data?.detail || err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleLoadRuns = async () => {
    if (!repoOwner || !repoName) return;
    setLoading(true);
    try {
      const runs = await api.listWorkflowRuns(githubToken, repoOwner, repoName);
      setWorkflowRuns(runs);
    } catch (err) {
      setGithubStatus({ type: 'error', message: err.response?.data?.detail || err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="panel-header">
        <span className="panel-title">GitHub Integration</span>
      </div>

      <div className="github-panel">
        {/* Token Section */}
        <div className="github-section">
          <div className="github-section__label">Personal Access Token</div>
          <div className="github-section__row">
            <input
              type="password"
              className="github-section__input"
              placeholder="ghp_..."
              value={githubToken}
              onChange={(e) => setGithubToken(e.target.value)}
            />
            <button
              className="github-btn"
              onClick={handleVerifyToken}
              disabled={loading || !githubToken}
            >
              Verify
            </button>
          </div>
          {githubUser && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <img
                src={githubUser.avatar_url}
                alt={githubUser.login}
                style={{ width: 20, height: 20, borderRadius: '50%' }}
              />
              <span style={{ fontSize: 12, color: 'var(--text-primary)' }}>
                {githubUser.name || githubUser.login}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                @{githubUser.login}
              </span>
            </div>
          )}
        </div>

        {/* Repository Section */}
        <div className="github-section">
          <div className="github-section__label">Repository</div>
          <input
            className="github-section__input"
            placeholder="Owner (e.g. octocat)"
            value={repoOwner}
            onChange={(e) => setRepoOwner(e.target.value)}
          />
          <input
            className="github-section__input"
            placeholder="Repo name (e.g. my-project)"
            value={repoName}
            onChange={(e) => setRepoName(e.target.value)}
            style={{ marginTop: 4 }}
          />

          {/* Branch selector */}
          <div className="github-section__row" style={{ marginTop: 4 }}>
            {branches.length > 0 ? (
              <select
                className="github-section__input"
                value={repoBranch}
                onChange={(e) => setRepoBranch(e.target.value)}
                style={{ height: 28 }}
              >
                {branches.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            ) : (
              <input
                className="github-section__input"
                placeholder="Branch (e.g. main)"
                value={repoBranch}
                onChange={(e) => setRepoBranch(e.target.value)}
              />
            )}
            <button
              className="github-btn secondary"
              onClick={handleLoadBranches}
              disabled={loading || !repoOwner || !repoName}
              title="Load branches from GitHub"
            >
              ↺
            </button>
          </div>
        </div>

        {/* Status */}
        {githubStatus && (
          <div className={`github-section__status ${githubStatus.type}`}>
            {githubStatus.type === 'success' ? '✓ ' : '⚠ '}{githubStatus.message}
          </div>
        )}

        {/* Commit Section */}
        <div className="github-section">
          <div className="github-section__label">
            Commit  ({openTabs.length} file{openTabs.length !== 1 ? 's' : ''} open)
          </div>
          <textarea
            className="github-section__textarea"
            placeholder="Commit message..."
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
          />
          <button
            className="github-btn"
            style={{ width: '100%', height: 30 }}
            onClick={handleCommit}
            disabled={loading || !githubToken || !repoOwner || !repoName}
          >
            {loading ? '⏳ Committing...' : '⬆  Commit & Push'}
          </button>
        </div>

        {/* CI/CD Section */}
        <div className="github-section">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div className="github-section__label">Recent CI/CD Runs</div>
            <button
              className="github-btn secondary"
              style={{ height: 22, padding: '0 8px', fontSize: 10 }}
              onClick={handleLoadRuns}
              disabled={loading || !repoOwner || !repoName}
            >
              Load
            </button>
          </div>

          {workflowRuns.length === 0 ? (
            <div style={{ fontSize: 11, color: 'var(--text-disabled)' }}>
              No runs loaded. Click Load to fetch.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {workflowRuns.slice(0, 5).map((run) => (
                <a
                  key={run.id}
                  href={run.html_url}
                  target="_blank"
                  rel="noreferrer"
                  style={{ textDecoration: 'none' }}
                >
                  <div className="github-run">
                    <div
                      className={`github-run__dot ${STATUS_COLOR[run.conclusion || run.status] || 'queued'}`}
                    />
                    <span className="github-run__name">{run.name}</span>
                    <span className="github-run__branch">{run.branch}</span>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
