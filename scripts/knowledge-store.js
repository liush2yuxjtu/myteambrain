#!/usr/bin/env node
/**
 * knowledge-store.js — TeamBrain Memory Store
 *
 * Storage: memory/{username}/sessions/{date}-{session-id}.jsonl
 * In-memory index + file system dual write
 */

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const BASE_DIR = path.join(process.env.HOME, '.myteambrain', 'memory');

/**
 * In-memory index for fast search without reading JSONL files
 * @type {Map<string, {username: string, projectPath: string, timestamp: string, offset: number, filePath: string}[]>}
 */
const memoryIndex = new Map();

/**
 * Ensure directory exists
 */
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Get sessions directory for a user
 */
function getUserSessionsDir(username) {
  return path.join(BASE_DIR, username, 'sessions');
}

/**
 * Get session file path
 */
function getSessionFilePath(username, date, sessionId) {
  return path.join(getUserSessionsDir(username), `${date}-${sessionId}.jsonl`);
}

/**
 * Rebuild in-memory index from session files
 */
function rebuildIndex() {
  memoryIndex.clear();
  if (!fs.existsSync(BASE_DIR)) return;

  const userDirs = fs.readdirSync(BASE_DIR);
  for (const username of userDirs) {
    const sessionsDir = path.join(BASE_DIR, username, 'sessions');
    if (!fs.existsSync(sessionsDir)) continue;

    const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.jsonl'));
    for (const file of files) {
      const filePath = path.join(sessionsDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n').filter(Boolean);
      const idx = memoryIndex.get(username) || [];
      lines.forEach((line, offset) => {
        try {
          const entry = JSON.parse(line);
          idx.push({
            username,
            projectPath: entry.projectPath || '',
            timestamp: entry.timestamp,
            offset,
            filePath,
            id: entry.id,
          });
        } catch {
          // Skip malformed lines
        }
      });
      if (idx.length > 0) memoryIndex.set(username, idx);
    }
  }
}

/**
 * Save a session memory entry
 * @param {Object} sessionData - Session data to save
 * @param {string} sessionData.username - Username
 * @param {string} sessionData.sessionId - Session ID
 * @param {string} [sessionData.projectPath] - Associated project path
 * @param {string} [sessionData.content] - Session content/summary
 * @param {string} [sessionData.timestamp] - ISO timestamp (defaults to now)
 * @param {string[]} [sessionData.tags] - Tags for the session
 * @param {number} [sessionData.importance] - Importance level 1-5
 * @returns {Object} The saved entry
 */
function save(sessionData) {
  const {
    username,
    sessionId,
    projectPath = '',
    content = '',
    timestamp = new Date().toISOString(),
    tags = [],
    importance = 3,
  } = sessionData;

  const date = timestamp.split('T')[0];
  const filePath = getSessionFilePath(username, date, sessionId);
  ensureDir(path.dirname(filePath));

  const entry = {
    id: randomUUID(),
    timestamp,
    username,
    sessionId,
    projectPath,
    content,
    tags,
    importance,
  };

  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(entry) + '\n', { flag: 'a' });
  fs.renameSync(tmpPath, filePath);

  // Update in-memory index
  const idx = memoryIndex.get(username) || [];
  idx.push({
    username,
    projectPath,
    timestamp,
    offset: 0,
    filePath,
    id: entry.id,
  });
  memoryIndex.set(username, idx);

  return entry;
}

/**
 * Search memories
 * @param {string} query - Search query string
 * @param {Object} options - Search options
 * @param {string} [options.username] - Filter by username
 * @param {string} [options.projectPath] - Filter by project path
 * @param {string} [options.startDate] - Start date ISO string
 * @param {string} [options.endDate] - End date ISO string
 * @param {string[]} [options.tags] - Filter by tags
 * @param {number} [options.limit] - Max results (default 100)
 * @returns {Object[]} Matching memory entries
 */
function search(query, options = {}) {
  const {
    username,
    projectPath,
    startDate,
    endDate,
    tags = [],
    limit = 100,
  } = options;

  const results = [];
  const queryLower = query.toLowerCase();

  // First filter index for candidates
  const candidates = [];
  const users = username ? [username] : Array.from(memoryIndex.keys());

  for (const user of users) {
    const idx = memoryIndex.get(user) || [];
    for (const item of idx) {
      if (projectPath && item.projectPath !== projectPath) continue;
      if (startDate && item.timestamp < startDate) continue;
      if (endDate && item.timestamp > endDate) continue;
      candidates.push(item);
    }
  }

  // Then search content in files
  const seen = new Set();
  for (const item of candidates) {
    if (results.length >= limit) break;
    if (seen.has(item.filePath + ':' + item.offset)) continue;

    try {
      const content = fs.readFileSync(item.filePath, 'utf-8');
      const lines = content.split('\n').filter(Boolean);
      const line = lines[item.offset];
      if (!line) continue;

      const entry = JSON.parse(line);
      if (query && !entry.content.toLowerCase().includes(queryLower)) continue;
      if (tags.length > 0 && !tags.every(t => entry.tags.includes(t))) continue;

      seen.add(item.filePath + ':' + item.offset);
      results.push(entry);
    } catch {
      // Skip on error
    }
  }

  return results;
}

/**
 * Get recent memories for a user
 * @param {string} username - Username
 * @param {number} days - Number of days to look back
 * @returns {Object[]} Recent memory entries
 */
function getRecent(username, days = 7) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString();

  const idx = memoryIndex.get(username) || [];
  const recentItems = idx.filter(item => item.timestamp >= cutoffStr);

  const results = [];
  const seen = new Set();

  for (const item of recentItems) {
    if (seen.has(item.filePath + ':' + item.offset)) continue;
    try {
      const content = fs.readFileSync(item.filePath, 'utf-8');
      const lines = content.split('\n').filter(Boolean);
      const line = lines[item.offset];
      if (line) {
        seen.add(item.filePath + ':' + item.offset);
        results.push(JSON.parse(line));
      }
    } catch {
      // Skip on error
    }
  }

  return results.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

/**
 * Get all memories for a project
 * @param {string} projectPath - Project path to filter by
 * @returns {Object[]} All memory entries for the project
 */
function getByProject(projectPath) {
  const results = [];
  const seen = new Set();

  for (const [username, idx] of memoryIndex.entries()) {
    for (const item of idx) {
      if (item.projectPath !== projectPath) continue;
      if (seen.has(item.filePath + ':' + item.offset)) continue;

      try {
        const content = fs.readFileSync(item.filePath, 'utf-8');
        const lines = content.split('\n').filter(Boolean);
        const line = lines[item.offset];
        if (line) {
          seen.add(item.filePath + ':' + item.offset);
          results.push(JSON.parse(line));
        }
      } catch {
        // Skip on error
      }
    }
  }

  return results.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

// Initialize index on load
rebuildIndex();

const knowledgeStore = { save, search, getRecent, getByProject };

// CLI entry point
const [,, command, ...args] = process.argv;

if (command === 'save') {
  const [username, sessionId, projectPath] = args;
  const opts = { };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--content' && args[i + 1]) opts.content = args[++i];
    else if (args[i] === '--timestamp' && args[i + 1]) opts.timestamp = args[++i];
    else if (args[i] === '--tags' && args[i + 1]) opts.tags = args[++i].split(',');
    else if (args[i] === '--importance' && args[i + 1]) opts.importance = parseInt(args[++i], 10);
  }
  const entry = save({ username, sessionId, projectPath, ...opts });
  console.log(JSON.stringify(entry, null, 2));
} else if (command === 'search') {
  const query = args[0] || '';
  const opts = { limit: 100 };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--username' && args[i + 1]) opts.username = args[++i];
    else if (args[i] === '--project' && args[i + 1]) opts.projectPath = args[++i];
    else if (args[i] === '--days' && args[i + 1]) {
      const days = parseInt(args[++i], 10);
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      opts.startDate = cutoff.toISOString();
    }
    else if (args[i] === '--limit' && args[i + 1]) opts.limit = parseInt(args[++i], 10);
  }
  const results = search(query, opts);
  console.log(JSON.stringify(results, null, 2));
} else if (command === 'recent') {
  const [username, days = '7'] = args;
  const results = getRecent(username, parseInt(days, 10));
  console.log(JSON.stringify(results, null, 2));
} else if (command === 'by-project') {
  const [projectPath] = args;
  const results = getByProject(projectPath);
  console.log(JSON.stringify(results, null, 2));
} else if (command === 'reindex') {
  rebuildIndex();
  console.log('Index rebuilt');
} else {
  console.error('Usage: node knowledge-store.js <save|search|recent|by-project|reindex> ...');
  process.exit(1);
}

module.exports = knowledgeStore;