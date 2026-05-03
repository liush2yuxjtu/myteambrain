#!/usr/bin/env node
/**
 * git-sync.js — Multi-device multi-user memory sync for TeamBrain
 *
 * Usage:
 *   const gitSync = require('./git-sync');
 *   gitSync.push(memoryPath);       // push new/updated files
 *   gitSync.pull(memoryPath);        // pull and merge remote changes
 *   gitSync.getStatus();             // get sync status
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const DEFAULT_REMOTE = 'gitee';
const MAX_RETRIES = 2;

/**
 * Run a git command, return result or null on failure
 */
function run(cmd, options = {}) {
  const { cwd = process.cwd(), retries = 0 } = options;
  try {
    return execSync(cmd, {
      cwd,
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 30000,
    }).trim();
  } catch (err) {
    if (retries < MAX_RETRIES) {
      return run(cmd, { cwd, retries: retries + 1 });
    }
    return null;
  }
}

/**
 * Run a git command, throwing on failure
 */
function runStrict(cmd, options = {}) {
  const { cwd = process.cwd(), retries = 0 } = options;
  try {
    return execSync(cmd, {
      cwd,
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 30000,
    }).trim();
  } catch (err) {
    if (retries < MAX_RETRIES) {
      return runStrict(cmd, { cwd, retries: retries + 1 });
    }
    const msg = err.stderr || err.message || 'Unknown error';
    throw new Error(`Git command failed: ${cmd}\n${msg}`);
  }
}

/**
 * Check if we're in a git repository
 */
function isGitRepo(cwd = process.cwd()) {
  return run('git rev-parse --git-dir 2>/dev/null', { cwd }) !== null;
}

/**
 * Get remote URL for a given remote name
 */
function getRemoteUrl(remote, cwd = process.cwd()) {
  return run(`git remote get-url ${remote} 2>/dev/null`, { cwd });
}

/**
 * Push memory files to remote
 * @param {string} memoryPath - Path to memory directory to push
 * @returns {Object} { success: boolean, message: string, count: number }
 */
function push(memoryPath) {
  const cwd = process.cwd();

  if (!isGitRepo(cwd)) {
    return {
      success: false,
      message: 'Not in a git repository. Run setup first.',
      count: 0
    };
  }

  // Resolve absolute path
  const absPath = path.resolve(cwd, memoryPath);

  if (!fs.existsSync(absPath)) {
    return {
      success: false,
      message: `Memory path does not exist: ${absPath}`,
      count: 0
    };
  }

  // Add all new and modified files under memoryPath
  const addCmd = `git add "${absPath}"`;
  try {
    execSync(addCmd, { cwd, encoding: 'utf-8', stdio: 'pipe' });
  } catch {
    // No files to add - not an error
  }

  // Get staged files count
  const stagedResult = run('git diff --cached --name-only 2>/dev/null', { cwd });
  const stagedFiles = stagedResult ? stagedResult.split('\n').filter(Boolean) : [];

  if (stagedFiles.length === 0) {
    return {
      success: true,
      message: 'Nothing new to push',
      count: 0
    };
  }

  // Get username for commit message
  let userName = 'unknown';
  try {
    userName = execSync('git config user.name || echo "unknown"', {
      cwd,
      encoding: 'utf-8',
      stdio: 'pipe'
    }).trim().replace(/"/g, '');
  } catch {}

  // Create meaningful commit message with date, user, count
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = now.toISOString().slice(11, 19);
  const commitMsg = `chore: sync ${stagedFiles.length} memory file(s) | ${dateStr} ${timeStr} | ${userName}`;

  try {
    execSync(`git commit -m "${commitMsg}"`, { cwd, encoding: 'utf-8', stdio: 'pipe' });
  } catch (err) {
    const msg = err.stderr || '';
    if (msg.includes('nothing to commit')) {
      return { success: true, message: 'Already up to date', count: 0 };
    }
    return { success: false, message: `Commit failed: ${msg}`, count: 0 };
  }

  // Push to default remote (gitee)
  const remote = DEFAULT_REMOTE;
  const remoteUrl = getRemoteUrl(remote, cwd);

  if (!remoteUrl) {
    return {
      success: false,
      message: `Remote '${remote}' not configured. Please set up git remote.`,
      count: stagedFiles.length
    };
  }

  // Try push with retries
  let pushSuccess = false;
  let lastError = '';

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      runStrict(`git push ${remote} main 2>&1`, { cwd });
      pushSuccess = true;
      break;
    } catch (err) {
      lastError = err.message;
    }
  }

  if (!pushSuccess) {
    return {
      success: false,
      message: `Push to ${remote} failed after ${MAX_RETRIES + 1} attempts: ${lastError}`,
      count: stagedFiles.length
    };
  }

  return {
    success: true,
    message: `Pushed ${stagedFiles.length} file(s) to ${remote}`,
    count: stagedFiles.length
  };
}

/**
 * Pull and merge remote changes with timestamp-based conflict resolution
 * @param {string} memoryPath - Path to memory directory to pull into
 * @returns {Object} { success: boolean, message: string, newMemories: string[], conflictsResolved: number }
 */
function pull(memoryPath) {
  const cwd = process.cwd();

  if (!isGitRepo(cwd)) {
    return {
      success: false,
      message: 'Not in a git repository. Run setup first.',
      newMemories: [],
      conflictsResolved: 0
    };
  }

  const remote = DEFAULT_REMOTE;
  const remoteUrl = getRemoteUrl(remote, cwd);

  if (!remoteUrl) {
    return {
      success: false,
      message: `Remote '${remote}' not configured. Please set up git remote.`,
      newMemories: [],
      conflictsResolved: 0
    };
  }

  // Fetch first
  let fetchSuccess = false;
  let lastError = '';

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      runStrict(`git fetch ${remote} 2>&1`, { cwd });
      fetchSuccess = true;
      break;
    } catch (err) {
      lastError = err.message;
    }
  }

  if (!fetchSuccess) {
    return {
      success: false,
      message: `Fetch from ${remote} failed: ${lastError}`,
      newMemories: [],
      conflictsResolved: 0
    };
  }

  // Get files before pull to detect new ones
  const beforeFiles = new Set();
  const knowledgeDir = path.resolve(cwd, memoryPath);
  if (fs.existsSync(knowledgeDir)) {
    const beforeResult = run(`find "${knowledgeDir}" -type f \( -name "*.jsonl" -o -name "*.json" \) 2>/dev/null`, { cwd });
    if (beforeResult) {
      beforeResult.split('\n').filter(Boolean).forEach(f => beforeFiles.add(f));
    }
  }

  // Check for conflicts before pulling
  const hasConflicts = run(`git ls-files -u 2>/dev/null`, { cwd });
  if (hasConflicts) {
    // Auto-resolve conflicts using timestamp-based strategy
    const resolved = resolveConflictsTimestamp(cwd);
    if (resolved > 0) {
      return {
        success: true,
        message: `Auto-resolved ${resolved} conflict(s) using timestamp priority`,
        newMemories: [],
        conflictsResolved: resolved
      };
    }
  }

  // Pull with merge
  let pullSuccess = false;
  lastError = '';

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      runStrict(`git pull --no-edit ${remote} main 2>&1`, { cwd });
      pullSuccess = true;
      break;
    } catch (err) {
      lastError = err.message;
      // Check for merge conflict
      if (err.message.includes('CONFLICT')) {
        const resolved = resolveConflictsTimestamp(cwd);
        if (resolved >= 0) {
          return {
            success: true,
            message: `Merge conflict auto-resolved (${resolved} file(s)) using timestamp priority`,
            newMemories: [],
            conflictsResolved: resolved
          };
        }
        return {
          success: false,
          message: `Merge conflict detected. Please resolve manually: ${err.message}`,
          newMemories: [],
          conflictsResolved: 0
        };
      }
    }
  }

  if (!pullSuccess) {
    return {
      success: false,
      message: `Pull from ${remote} failed: ${lastError}`,
      newMemories: [],
      conflictsResolved: 0
    };
  }

  // Get files after pull to identify new ones
  const afterFiles = new Set();
  if (fs.existsSync(knowledgeDir)) {
    const afterResult = run(`find "${knowledgeDir}" -type f \( -name "*.jsonl" -o -name "*.json" \) 2>/dev/null`, { cwd });
    if (afterResult) {
      afterResult.split('\n').filter(Boolean).forEach(f => afterFiles.add(f));
    }
  }

  // Identify new files (in after but not in before)
  const newMemories = [...afterFiles].filter(f => !beforeFiles.has(f));

  return {
    success: true,
    message: `Pulled from ${remote}${newMemories.length > 0 ? `, ${newMemories.length} new file(s)` : ''}`,
    newMemories,
    conflictsResolved: 0
  };
}

/**
 * Resolve merge conflicts using timestamp priority
 * For each conflicted file, keep the version with the newer timestamp
 * @param {string} cwd - Working directory
 * @returns {number} Number of conflicts resolved, -1 on error
 */
function resolveConflictsTimestamp(cwd) {
  const conflictFiles = run(`git diff --name-only --diff-filter=U 2>/dev/null`, { cwd });
  if (!conflictFiles) return 0;

  const files = conflictFiles.split('\n').filter(Boolean);
  let resolved = 0;

  for (const file of files) {
    try {
      // Get the base (common ancestor), ours, and theirs versions
      const baseContent = run(`git show :1:${file} 2>/dev/null`, { cwd }) || '';
      const ourContent = run(`git show :2:${file} 2>/dev/null`, { cwd }) || '';
      const theirContent = run(`git show :3:${file} 2>/dev/null`, { cwd }) || '';

      // Parse timestamps from JSONL entries to determine newer version
      const ourTimestamp = extractLatestTimestamp(ourContent);
      const theirTimestamp = extractLatestTimestamp(theirContent);

      let winner;
      if (ourTimestamp >= theirTimestamp) {
        winner = ourContent;
      } else {
        winner = theirContent;
      }

      // Write the winner and mark as resolved
      fs.writeFileSync(path.join(cwd, file), winner, 'utf-8');
      run(`git add "${file}"`, { cwd });
      resolved++;
    } catch (err) {
      console.error(`Failed to resolve conflict in ${file}: ${err.message}`);
    }
  }

  return resolved;
}

/**
 * Extract the latest timestamp from JSONL content
 * @param {string} content - JSONL content
 * @returns {number} Unix timestamp in milliseconds, 0 if no valid timestamp found
 */
function extractLatestTimestamp(content) {
  if (!content || !content.trim()) return 0;

  const lines = content.trim().split('\n');
  let latest = 0;

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      if (entry.timestamp) {
        const ts = new Date(entry.timestamp).getTime();
        if (ts > latest) latest = ts;
      }
    } catch {
      // Skip malformed lines
    }
  }

  return latest;
}

/**
 * Full sync: pull first, then push (for multi-device scenarios)
 * @param {string} memoryPath - Path to memory directory
 * @returns {Object} { success: boolean, message: string, pulled: number, pushed: number }
 */
function sync(memoryPath) {
  const cwd = process.cwd();

  // First pull remote changes
  const pullResult = pull(memoryPath);

  // Then push local changes
  const pushResult = push(memoryPath);

  return {
    success: pullResult.success && pushResult.success,
    message: `Sync complete: ${pullResult.message}, ${pushResult.message}`,
    pulled: pullResult.newMemories.length + pullResult.conflictsResolved,
    pushed: pushResult.count
  };
}

/**
 * Get current sync status
 * @returns {Object} { lastSyncTime, pendingChanges, remoteStatus, ahead, behind }
 */
function getStatus() {
  const cwd = process.cwd();

  if (!isGitRepo(cwd)) {
    return {
      lastSyncTime: null,
      pendingChanges: 0,
      remoteStatus: 'not-a-git-repo',
      ahead: 0,
      behind: 0,
      error: 'Not in a git repository'
    };
  }

  const remote = DEFAULT_REMOTE;
  const remoteUrl = getRemoteUrl(remote, cwd);

  if (!remoteUrl) {
    return {
      lastSyncTime: null,
      pendingChanges: 0,
      remoteStatus: 'no-remote-configured',
      ahead: 0,
      behind: 0,
      error: `Remote '${remote}' not configured`
    };
  }

  // Get last commit time as approximate last sync time
  const lastCommit = run('git log -1 --format="%ci" 2>/dev/null', { cwd });

  // Check pending changes
  const statusResult = run('git status --porcelain 2>/dev/null', { cwd });
  const pendingChanges = statusResult ? statusResult.split('\n').filter(Boolean).length : 0;

  // Count ahead/behind using the actual remote name
  const aheadResult = run(`git log ${remote}/main..main --oneline 2>/dev/null`, { cwd }) || '';
  const behindResult = run(`git log main..${remote}/main --oneline 2>/dev/null`, { cwd }) || '';

  const ahead = aheadResult ? aheadResult.split('\n').filter(Boolean).length : 0;
  const behind = behindResult ? behindResult.split('\n').filter(Boolean).length : 0;

  return {
    lastSyncTime: lastCommit || null,
    pendingChanges,
    remoteStatus: 'connected',
    remote,
    remoteUrl,
    ahead,
    behind
  };
}

// CLI entry point
if (require.main === module) {
  const [, , command, arg] = process.argv;

  // Get memory path from env or default (use new memory structure)
  const memoryPath = arg || path.join(process.env.HOME || '', '.myteambrain', 'memory');

  let result;
  switch (command) {
    case 'pull':
      result = pull(memoryPath);
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.success ? 0 : 1);
    case 'push':
      result = push(memoryPath);
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.success ? 0 : 1);
    case 'sync':
      result = sync(memoryPath);
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.success ? 0 : 1);
    case 'status':
      result = getStatus();
      console.log(JSON.stringify(result, null, 2));
      break;
    default:
      console.error('Usage: node git-sync.js <pull|push|sync|status> [memoryPath]');
      process.exit(1);
  }
}

module.exports = { push, pull, getStatus, sync, resolveConflictsTimestamp };