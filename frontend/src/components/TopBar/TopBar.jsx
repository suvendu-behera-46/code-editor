import React from 'react';
import { useEditorStore } from '../../store/editorStore';

const AI_MODES = [
  { id: 'edit', label: 'Edit' },
  { id: 'explain', label: 'Explain' },
  { id: 'refactor', label: 'Refactor' },
  { id: 'generate', label: 'Generate' },
];

const MODELS = [
  // Free tier (sign up at console.groq.com — no credit card)
  { id: 'groq/llama-3.3-70b-versatile', label: 'Llama 3.3 70B (Free)', provider: 'Groq (Free)' },
  { id: 'groq/llama-3.1-8b-instant',    label: 'Llama 3.1 8B – Fast (Free)', provider: 'Groq (Free)' },
  { id: 'groq/mixtral-8x7b-32768',      label: 'Mixtral 8x7B (Free)', provider: 'Groq (Free)' },
  { id: 'groq/gemma2-9b-it',            label: 'Gemma 2 9B (Free)', provider: 'Groq (Free)' },
  // Local / Ollama (install from ollama.com then run: ollama pull <model>)
  { id: 'ollama/llama3.2',        label: 'Llama 3.2 (Local)',      provider: 'Ollama (Local)' },
  { id: 'ollama/mistral',         label: 'Mistral 7B (Local)',     provider: 'Ollama (Local)' },
  { id: 'ollama/codellama',       label: 'CodeLlama (Local)',      provider: 'Ollama (Local)' },
  { id: 'ollama/deepseek-coder',  label: 'DeepSeek Coder (Local)', provider: 'Ollama (Local)' },
  // Paid providers
  { id: 'gpt-4o',           label: 'GPT-4o',           provider: 'OpenAI' },
  { id: 'gpt-4-turbo',      label: 'GPT-4 Turbo',      provider: 'OpenAI' },
  { id: 'gpt-3.5-turbo',    label: 'GPT-3.5 Turbo',    provider: 'OpenAI' },
  { id: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet', provider: 'Anthropic' },
  { id: 'claude-3-opus-20240229',     label: 'Claude 3 Opus',     provider: 'Anthropic' },
  { id: 'claude-3-haiku-20240307',    label: 'Claude 3 Haiku',    provider: 'Anthropic' },
  { id: 'gemini-1.5-pro',   label: 'Gemini 1.5 Pro',   provider: 'Google' },
  { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash', provider: 'Google' },
];

export default function TopBar() {
  const {
    aiMode, setAIMode,
    selectedModel, setSelectedModel,
    aiPanelOpen, toggleAIPanel,
    githubPanelOpen, toggleGitHubPanel,
    githubUser,
  } = useEditorStore();

  return (
    <div className="top-bar">
      {/* Brand */}
      <div className="top-bar__brand">
        <span className="top-bar__brand-icon">⚡</span>
        AI Editor
      </div>

      {/* AI Mode tabs */}
      <div className="top-bar__modes">
        {AI_MODES.map((m) => (
          <button
            key={m.id}
            className={`top-bar__mode-btn${aiMode === m.id ? ' active' : ''}`}
            onClick={() => setAIMode(m.id)}
            title={`AI Mode: ${m.label}`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="top-bar__spacer" />

      {/* Model selector */}
      <select
        className="top-bar__model-select"
        value={selectedModel}
        onChange={(e) => setSelectedModel(e.target.value)}
        title="Select AI model"
      >
        {['Groq (Free)', 'Ollama (Local)', 'OpenAI', 'Anthropic', 'Google'].map((provider) => (
          <optgroup key={provider} label={provider}>
            {MODELS.filter((m) => m.provider === provider).map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </optgroup>
        ))}
      </select>

      {/* GitHub toggle */}
      <button
        className={`top-bar__icon-btn${githubPanelOpen ? ' active' : ''}`}
        onClick={toggleGitHubPanel}
        title={githubUser ? `GitHub: ${githubUser.login}` : 'GitHub integration'}
      >
        {githubUser ? '✓' : '🐙'}
      </button>

      {/* AI Panel toggle */}
      <button
        className={`top-bar__icon-btn${aiPanelOpen ? ' active' : ''}`}
        onClick={toggleAIPanel}
        title="Toggle AI panel"
      >
        🤖
      </button>
    </div>
  );
}
