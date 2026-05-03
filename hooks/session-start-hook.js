#!/usr/bin/env node
/**
 * session-start-hook.js - Claude Code Session Start Hook
 *
 * Triggered when a Claude Code session starts.
 * Gathers current project context and calls the memory injection script.
 */

const { spawn } = require('child_process');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const HOME = process.env.HOME || (require('os')).homedir();
const SCRIPT_DIR = path.join(__dirname, '..', 'scripts');
const SESSION_START_SCRIPT = path.join(SCRIPT_DIR, 'session-start-hook.js');

function log(message) {
  const timestamp = new Date().toISOString();
  console.error(`[session-start-hook] ${timestamp}: ${message}`);
}

function getGitInfo() {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD 2>/dev/null', { encoding: 'utf8' }).trim();
    const name = execSync('git rev-parse --show-worktree-head 2>/dev/null || git rev-parse HEAD 2>/dev/null', { encoding: 'utf8' }).trim().slice(0, 8);
    return { branch, name };
  } catch (e) {
    return { branch: 'unknown', name: 'unknown' };
  }
}

function getRecentFiles(cwd, limit = 10) {
  try {
    const output = execSync(`git -C "${cwd}" diff --name-only HEAD~5..HEAD 2>/dev/null || git -C "${cwd}" ls-files -t 2>/dev/null | head -n ${limit}`, { encoding: 'utf8', timeout: 5000 });
    return output.split('\n').filter(f => f.trim()).slice(0, limit);
  } catch (e) {
    return [];
  }
}

function getCurrentProjectContext() {
  const cwd = process.cwd();
  const gitInfo = getGitInfo();
  const recentFiles = getRecentFiles(cwd);

  return {
    cwd,
    branch: gitInfo.branch,
    commitName: gitInfo.name,
    recentFiles,
    timestamp: new Date().toISOString()
  };
}

async function injectMemory() {
  log('Session starting, loading relevant memories...');

  const context = getCurrentProjectContext();
  log(`Project context: ${context.cwd}, branch: ${context.branch}`);

  if (!fs.existsSync(SESSION_START_SCRIPT)) {
    log(`Script not found: ${SESSION_START_SCRIPT}`);
    return;
  }

  return new Promise((resolve) => {
    const child = spawn(process.execPath, [SESSION_START_SCRIPT, context.cwd], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });

    child.on('close', (code) => {
      if (stdout.trim()) {
        console.log(stdout);
      }
      if (stderr.trim()) {
        log(`Script stderr: ${stderr.trim().slice(0, 200)}`);
      }
      log(`Memory injection completed with code ${code}`);
      resolve();
    });

    child.on('error', (err) => {
      log(`Failed to run memory script: ${err.message}`);
      resolve();
    });

    setTimeout(() => {
      if (!child.killed) {
        child.kill('SIGTERM');
        log('Memory injection timed out');
        resolve();
      }
    }, 15000);
  });
}

injectMemory().catch(e => log(`Error: ${e.message}`));