import axios from 'axios';

const http = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

export const api = {
  // ── Files ──────────────────────────────────────────────────────────────────

  getFileTree: async () => {
    const res = await http.get('/files/tree');
    return res.data;
  },

  readFile: async (path) => {
    const res = await http.get('/files/read', { params: { path } });
    return res.data.content;
  },

  saveFile: async (path, content) => {
    const res = await http.put('/files/save', { path, content });
    return res.data;
  },

  createFile: async (path, content = '') => {
    const res = await http.post('/files/create', { path, content, is_directory: false });
    return res.data;
  },

  createFolder: async (path) => {
    const res = await http.post('/files/create', { path, content: '', is_directory: true });
    return res.data;
  },

  deleteFile: async (path) => {
    const res = await http.delete('/files/delete', { params: { path } });
    return res.data;
  },

  renameFile: async (old_path, new_path) => {
    const res = await http.post('/files/rename', { old_path, new_path });
    return res.data;
  },

  // ── AI ─────────────────────────────────────────────────────────────────────

  getModels: async () => {
    const res = await http.get('/ai/models');
    return res.data;
  },

  editWithAI: async ({ file_path, content, prompt, model, mode }) => {
    const res = await http.post('/ai/edit', { file_path, content, prompt, model, mode });
    return res.data;
  },

  generateInFolder: async ({ folder_path, prompt, model }) => {
    const res = await http.post('/ai/generate-folder', { folder_path, prompt, model });
    return res.data;
  },

  agentRun: async ({ folder_path, prompt, model }) => {
    const res = await http.post('/ai/agent', { folder_path, prompt, model });
    return res.data;
  },

  // ── GitHub ─────────────────────────────────────────────────────────────────

  getGithubUser: async (token) => {
    const res = await http.get('/github/user', { params: { token } });
    return res.data;
  },

  listRepos: async (token) => {
    const res = await http.get('/github/repos', { params: { token } });
    return res.data;
  },

  listBranches: async (token, owner, repo) => {
    const res = await http.get('/github/branches', { params: { token, owner, repo } });
    return res.data;
  },

  commitFiles: async ({ token, owner, repo, branch, message, files }) => {
    const res = await http.post('/github/commit', { token, owner, repo, branch, message, files });
    return res.data;
  },

  listWorkflows: async (token, owner, repo) => {
    const res = await http.get('/github/workflows', { params: { token, owner, repo } });
    return res.data;
  },

  listWorkflowRuns: async (token, owner, repo) => {
    const res = await http.get('/github/workflow-runs', { params: { token, owner, repo } });
    return res.data;
  },

  triggerWorkflow: async ({ token, owner, repo, workflow_id, ref, inputs }) => {
    const res = await http.post('/github/workflow-trigger', { token, owner, repo, workflow_id, ref, inputs });
    return res.data;
  },
};
