#!/usr/bin/env node
/**
 * stop-hook.js - Claude Code Stop Hook Entry Point
 *
 * Registered in settings.json as a "stop" hook.
 * Invoked by Claude Code when the session ends.
 *
 * Usage (Claude Code hook):
 *   node stop-hook.js
 *
 * Environment variables set by Claude Code:
 *   CLAUDE_SESSION_ID    - unique session identifier
 *   CLAUDE_TRANSCRIPT    - path to the session transcript (.jsonl)
 *   HOME                 - home directory
 *
 * This script:
 *   1. Reads CLAUDE_SESSION_ID / CLAUDE_TRANSCRIPT from env
 *   2. Delegates to ../scripts/stop-hook.js for core logic
 *
 * Registration (in .claude/settings.json):
 *   "hooks": {
 *     "stop": "node hooks/stop-hook.js"
 *   }
 */

'use strict';

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const HOME = process.env.HOME || require('os').homedir();
const SCRIPTS_DIR = path.join(__dirname, '..', 'scripts');
const SCRIPT_PATH = path.join(SCRIPTS_DIR, 'stop-hook.js');

// Ensure scripts/stop-hook.js exists
if (!fs.existsSync(SCRIPT_PATH)) {
  console.error('[stop-hook] Error: scripts/stop-hook.js not found');
  process.exit(1);
}

// Log hook activation
const sessionId = process.env.CLAUDE_SESSION_ID || 'unknown';
const transcript = process.env.CLAUDE_TRANSCRIPT || 'unknown';
console.error(`[stop-hook] Session ending: ${sessionId}`);
console.error(`[stop-hook] Transcript: ${transcript}`);

// Delegate to core logic script
const child = spawn('node', [SCRIPT_PATH, sessionId], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: {
    ...process.env,
    CLAUDE_SESSION_ID: sessionId,
    CLAUDE_TRANSCRIPT: transcript,
  },
});

let stdout = '';
let stderr = '';

child.stdout.on('data', d => { stdout += d.toString(); });
child.stderr.on('data', d => { stderr += d.toString(); });

child.on('close', code => {
  if (code !== 0) {
    console.error(`[stop-hook] Core script exited with code ${code}`);
    console.error(stderr.slice(-500));
  }
  // Hooks should exit cleanly regardless of underlying script outcome
  process.exit(0);
});

child.on('error', err => {
  console.error(`[stop-hook] Failed to spawn: ${err.message}`);
  process.exit(0); // Don't block Claude Code exit
});