#!/usr/bin/env node
/**
 * session-start-hook.js - Claude Code Session Start Hook
 *
 * Triggered when a Claude Code session starts.
 * Pulls latest knowledge from remote and injects into context via hookSpecificOutput.
 *
 * CEO_PLAN principle: "stop hook →提炼 → git push → SessionStart注入"
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const HOME = process.env.HOME || (require('os')).homedir();
const CONFIG_DIR = path.join(HOME, '.myteambrain');
const KNOWLEDGE_DIR = path.join(CONFIG_DIR, 'knowledge');

function log(message) {
  const timestamp = new Date().toISOString();
  console.error(`[session-start-hook] ${timestamp}: ${message}`);
}

async function injectKnowledge() {
  log('Session starting, loading knowledge...');

  if (!fs.existsSync(KNOWLEDGE_DIR)) {
    log('Knowledge base not initialized, skipping');
    outputNoContext();
    return;
  }

  try {
    execSync('git pull gitee main 2>/dev/null || git pull origin main 2>/dev/null || true', {
      cwd: KNOWLEDGE_DIR,
      stdio: 'ignore',
      timeout: 10000
    });
    log('Pulled latest knowledge from remote');
  } catch (e) {
    log('Git pull skipped (may not be configured)');
  }

  const dailyDir = path.join(KNOWLEDGE_DIR, 'daily');
  if (!fs.existsSync(dailyDir)) {
    log('No daily knowledge found');
    outputNoContext();
    return;
  }

  const files = fs.readdirSync(dailyDir).filter(f => f.endsWith('.md')).sort().reverse().slice(0, 7);

  if (files.length === 0) {
    log('No knowledge files found');
    outputNoContext();
    return;
  }

  log(`Found ${files.length} recent knowledge file(s)`);

  // Build context content
  let contextContent = `# Recent Team Knowledge (Last 7 Days)\n\n`;

  for (const file of files) {
    const content = fs.readFileSync(path.join(dailyDir, file), 'utf8');
    contextContent += `## ${file.replace('.md', '')}\n${content}\n\n`;
  }

  // Output hookSpecificOutput JSON for Claude Code to inject as additionalContext
  const output = {
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: contextContent
    }
  };

  console.log(JSON.stringify(output));
  log('Context injected via hookSpecificOutput');
}

function outputNoContext() {
  // Output empty context signal - no injection needed
  const output = {
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: null
    }
  };
  console.log(JSON.stringify(output));
}

injectKnowledge().catch(e => {
  log(`Error: ${e.message}`);
  outputNoContext();
});