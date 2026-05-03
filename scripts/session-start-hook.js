#!/usr/bin/env node
/**
 * SessionStart Hook — Memory Injection
 *
 * Runs when a Claude Code session starts. Reads team memory JSONL files,
 * scores relevance to current project, and injects top-k memories.
 *
 * Usage: node session-start-hook.js <currentWorkingDirectory>
 * Environment:
 *   MYTEAMBRAIN_KNOWLEDGE_DIR  - directory containing JSONL files (default: ~/.myteambrain/knowledge/)
 *   MYTEAMBRAIN_MAX_MEMORIES   - max memories to inject (default: 5)
 *   MYTEAMBRAIN_LOG_LEVEL      - debug|info|warn|error (default: info)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

// --- Configuration ---
const CONFIG = {
  // Read from both sources:
  // 1. ~/.myteambrain/knowledge/daily/ - where stop-hook.js writes markdown summaries
  // 2. ~/.myteambrain/memory/{user}/sessions/ - where knowledge-store.js writes JSONL
  knowledgeDir: process.env.MYTEAMBRAIN_KNOWLEDGE_DIR || path.join(os.homedir(), '.myteambrain', 'knowledge'),
  memoryBaseDir: process.env.MYTEAMBRAIN_MEMORY_DIR || path.join(os.homedir(), '.myteambrain', 'memory'),
  maxMemories: parseInt(process.env.MYTEAMBRAIN_MAX_MEMORIES || '5', 10),
  logLevel: process.env.MYTEAMBRAIN_LOG_LEVEL || 'info',
};

// In-memory dedup set for current session (avoids same memory injected twice)
const injectedIds = new Set();

// --- Logging ---
function log(level, ...args) {
  const levels = ['debug', 'info', 'warn', 'error'];
  if (levels.indexOf(level) >= levels.indexOf(CONFIG.logLevel)) {
    console.error(`[session-start-hook][${level}]`, ...args);
  }
}

// --- Tokenization ---
function tokenize(text) {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1);
}

// --- BM25-lite scoring ---
function scoreMemory(memory, queryTokens) {
  if (!queryTokens.length || !memory.content) return 0;

  const contentTokens = tokenize(memory.content);
  const tagsTokens = memory.tags ? memory.tags.flatMap(t => tokenize(t)) : [];
  const projectTokens = memory.project ? tokenize(memory.project) : [];

  const allMemoryTokens = [...contentTokens, ...tagsTokens, ...projectTokens];

  let matches = 0;
  for (const qt of queryTokens) {
    if (allMemoryTokens.some(t => t.includes(qt) || qt.includes(t))) {
      matches++;
    }
  }

  if (!matches) return 0;
  const tf = matches / allMemoryTokens.length;
  const idf = Math.log((allMemoryTokens.length + 1) / (matches + 1));
  return tf * idf;
}

// Build query tokens from project path and git context
function buildQueryTokens(cwd, gitBranch, recentFiles) {
  const tokens = [];

  // Project name (last segment of path)
  const basename = path.basename(cwd);
  if (basename) tokens.push(...tokenize(basename));

  // Parent directory names (up to 2 levels)
  const parts = cwd.split(path.sep).filter(Boolean);
  for (let i = Math.max(0, parts.length - 3); i < parts.length; i++) {
    tokens.push(...tokenize(parts[i]));
  }

  // Git branch name (if available)
  if (gitBranch && gitBranch !== 'unknown') {
    tokens.push(...tokenize(gitBranch));
  }

  // Recent file names (without extensions)
  if (recentFiles && recentFiles.length > 0) {
    for (const file of recentFiles.slice(0, 5)) {
      const basename = path.basename(file, path.extname(file));
      tokens.push(...tokenize(basename));
    }
  }

  return [...new Set(tokens)];
}

// --- Read JSONL files from both knowledge stores ---
function readKnowledgeFiles() {
  const memories = [];

  // Read from knowledge/daily/*.md (stop-hook.js output)
  const dailyDir = path.join(CONFIG.knowledgeDir, 'daily');
  if (fs.existsSync(dailyDir)) {
    try {
      const files = fs.readdirSync(dailyDir);
      for (const file of files) {
        if (!file.endsWith('.md')) continue;
        const filePath = path.join(dailyDir, file);
        try {
          const content = fs.readFileSync(filePath, 'utf8');
          // Parse markdown to extract memory entries
          const sessionSections = content.split(/## \d{4}-\d{2}-\d{2}T/).slice(1);
          for (const section of sessionSections) {
            const lines = section.split('\n').filter(l => l.trim());
            if (lines.length > 0) {
              const timestamp = file.replace('.md', '') + 'T00:00:00+08:00';
              const content = lines.join(' ').trim();
              if (content) {
                memories.push({
                  id: `daily-${file}-${content.slice(0, 20)}`,
                  timestamp,
                  content,
                  tags: ['daily'],
                  author: 'claude'
                });
              }
            }
          }
        } catch (err) {
          log('warn', `Cannot read daily file ${file}: ${err.message}`);
        }
      }
    } catch (err) {
      log('warn', `Cannot read daily dir: ${err.message}`);
    }
  }

  // Read from ~/.myteambrain/knowledge/*.jsonl (knowledge-store.js output)
  if (fs.existsSync(CONFIG.knowledgeDir)) {
    try {
      const files = fs.readdirSync(CONFIG.knowledgeDir);
      for (const file of files) {
        if (!file.endsWith('.jsonl')) continue;

        const filePath = path.join(CONFIG.knowledgeDir, file);
        try {
          const content = fs.readFileSync(filePath, 'utf8');
          const lines = content.split('\n');
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const memory = JSON.parse(line);
              memories.push(memory);
            } catch (err) {
              log('warn', `Malformed JSON line in ${file}: ${err.message}`);
            }
          }
        } catch (err) {
          log('warn', `Cannot read file ${file}: ${err.message}`);
        }
      }
    } catch (err) {
      log('warn', `Cannot read knowledge dir: ${err.message}`);
    }
  }

  // Read from memory/{user}/sessions/*.jsonl (knowledge-store.js save)
  if (fs.existsSync(CONFIG.memoryBaseDir)) {
    try {
      const userDirs = fs.readdirSync(CONFIG.memoryBaseDir);
      for (const user of userDirs) {
        const sessionsDir = path.join(CONFIG.memoryBaseDir, user, 'sessions');
        if (!fs.existsSync(sessionsDir)) continue;

        const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.jsonl'));
        for (const file of files) {
          const filePath = path.join(sessionsDir, file);
          try {
            const content = fs.readFileSync(filePath, 'utf8');
            const lines = content.split('\n');
            for (const line of lines) {
              if (!line.trim()) continue;
              try {
                const memory = JSON.parse(line);
                memories.push(memory);
              } catch (err) {
                log('warn', `Malformed JSON line in ${file}: ${err.message}`);
              }
            }
          } catch (err) {
            log('warn', `Cannot read file ${file}: ${err.message}`);
          }
        }
      }
    } catch (err) {
      log('warn', `Cannot read memory base dir: ${err.message}`);
    }
  }

  return memories;
}

// --- Get recent git files ---
function getRecentGitFiles(cwd, limit = 10) {
  try {
    const output = execSync(
      `git -C "${cwd}" diff --name-only HEAD~10..HEAD 2>/dev/null || git -C "${cwd}" diff --name-only HEAD~5..HEAD 2>/dev/null || echo ""`,
      { encoding: 'utf8', timeout: 5000 }
    );
    return output.split('\n').filter(f => f.trim()).slice(0, limit);
  } catch (e) {
    return [];
  }
}

// --- Get git branch ---
function getGitBranch(cwd) {
  try {
    return execSync(`git -C "${cwd}" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown"`, {
      encoding: 'utf8',
      timeout: 5000
    }).trim();
  } catch (e) {
    return 'unknown';
  }
}

// --- Format memory for injection ---
function formatMemory(m) {
  const timestamp = m.timestamp ? new Date(m.timestamp).toISOString().split('T')[0] : 'unknown';
  const tags = m.tags && m.tags.length ? `[${m.tags.join(', ')}]` : '';
  return `[${timestamp}] ${tags} ${m.content}`;
}

// --- Main ---
function main() {
  const cwd = process.argv[2] || process.cwd();
  const gitBranch = getGitBranch(cwd);
  const recentFiles = getRecentGitFiles(cwd);

  log('debug', `Running SessionStart hook for: ${cwd}, branch: ${gitBranch}`);

  // Read all memories
  const memories = readKnowledgeFiles();
  log('debug', `Loaded ${memories.length} memory entries`);

  if (!memories.length) {
    log('info', 'No memories found, exiting silently');
    return;
  }

  // Build query and score
  const queryTokens = buildQueryTokens(cwd, gitBranch, recentFiles);
  log('debug', `Query tokens: ${queryTokens.join(', ')}`);

  const scored = memories
    .filter(m => !injectedIds.has(m.id))
    .map(m => ({ memory: m, score: scoreMemory(m, queryTokens) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score);

  const topK = scored.slice(0, CONFIG.maxMemories);

  if (!topK.length) {
    log('info', 'No relevant memories found, exiting silently');
    return;
  }

  // Inject memories via stdout
  const lines = [];
  lines.push('');
  lines.push('=== Team Memory (' + topK.length + ' relevant) ===');
  lines.push('');

  for (const item of topK) {
    const m = item.memory;
    injectedIds.add(m.id);
    lines.push(formatMemory(m));
    lines.push('');
  }

  lines.push('==========================');
  lines.push('');

  console.log(lines.join('\n'));
}

// Always exit 0 — never block session start
try {
  main();
} catch (err) {
  log('error', `Fatal error: ${err.message}`);
}

process.exit(0);