const EXT_MAP = {
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'typescript', tsx: 'typescript', mts: 'typescript',
  py: 'python', pyw: 'python',
  html: 'html', htm: 'html',
  css: 'css', scss: 'scss', sass: 'scss', less: 'less',
  json: 'json', jsonc: 'json',
  md: 'markdown', mdx: 'markdown',
  yaml: 'yaml', yml: 'yaml',
  sh: 'shell', bash: 'shell', zsh: 'shell',
  java: 'java',
  cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hxx: 'cpp',
  c: 'c', h: 'c',
  cs: 'csharp',
  go: 'go',
  rs: 'rust',
  rb: 'ruby',
  php: 'php',
  swift: 'swift',
  kt: 'kotlin', kts: 'kotlin',
  sql: 'sql',
  xml: 'xml', svg: 'xml', xsl: 'xml',
  toml: 'ini',
  ini: 'ini', cfg: 'ini', conf: 'ini',
  dockerfile: 'dockerfile',
  tf: 'hcl',
  graphql: 'graphql', gql: 'graphql',
  txt: 'plaintext',
  log: 'plaintext',
};

const FILE_ICONS = {
  // Languages
  js: '📄', jsx: '⚛️', ts: '📘', tsx: '⚛️',
  py: '🐍', html: '🌐', css: '🎨', scss: '🎨',
  json: '📋', md: '📝', yaml: '⚙️', yml: '⚙️',
  sh: '💻', bash: '💻',
  java: '☕', go: '🐹', rs: '🦀', rb: '💎',
  php: '🐘', swift: '🍎', kt: '📱',
  sql: '🗄️', xml: '📄', svg: '🖼️',
  // Config
  dockerfile: '🐳',
  tf: '🏗️',
  // Fallback
  default: '📄',
};

export function getLanguage(filename) {
  if (!filename) return 'plaintext';
  const lower = filename.toLowerCase();
  if (lower === 'dockerfile') return 'dockerfile';
  const ext = lower.split('.').pop();
  return EXT_MAP[ext] || 'plaintext';
}

export function getFileIcon(filename) {
  if (!filename) return '📄';
  const lower = filename.toLowerCase();
  if (lower === 'dockerfile') return '🐳';
  const ext = lower.split('.').pop();
  return FILE_ICONS[ext] || FILE_ICONS.default;
}

export function getFolderIcon(isOpen) {
  return isOpen ? '📂' : '📁';
}
