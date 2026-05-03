#!/usr/bin/env node
/**
 * stop-hook.js - Claude Code Session Stop Hook
 *
 * Triggered when a Claude Code session ends.
 * Extracts knowledge from the session transcript and saves to shared knowledge base.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const HOME = process.env.HOME || (require('os')).homedir();
const CONFIG_DIR = path.join(HOME, '.myteambrain');
const KNOWLEDGE_DIR = path.join(CONFIG_DIR, 'knowledge');

function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[stop-hook] ${timestamp}: ${message}`);
}

async function extractKnowledge() {
  log('Session ended, extracting knowledge...');

  const transcriptPath = process.env.CLAUDE_TRANSCRIPT || path.join(HOME, '.claude', 'transcripts', 'current.jsonl');

  if (!fs.existsSync(transcriptPath)) {
    log('No transcript found, skipping extraction');
    return;
  }

  try {
    const content = fs.readFileSync(transcriptPath, 'utf8');
    const lines = content.split('\n').filter(l => l.trim());
    const recentLines = lines.slice(-100).join('\n');

    if (!recentLines.trim()) {
      log('Empty transcript, skipping');
      return;
    }

    const extractionPrompt = `From this session transcript, extract:
1. Key decisions made
2. Important learnings or discoveries
3. Action items or follow-ups
4. Technical solutions implemented

Format as markdown with ## Decisions, ## Learnings, ## Actions sections.
If nothing notable, respond with "No significant knowledge extracted."

Transcript:
${recentLines.slice(-3000)}`;

    const result = execSync(`claude -p "${extractionPrompt.replace(/"/g, '\\"')}" 2>/dev/null`, {
      encoding: 'utf8',
      timeout: 30000
    });

    if (result && !result.includes('No significant knowledge extracted')) {
      const dailyDir = path.join(KNOWLEDGE_DIR, 'daily');
      if (!fs.existsSync(dailyDir)) {
        fs.mkdirSync(dailyDir, { recursive: true });
      }

      const today = new Date().toISOString().split('T')[0];
      const dailyFile = path.join(dailyDir, `${today}.md`);

      const existing = fs.existsSync(dailyFile) ? fs.readFileSync(dailyFile, 'utf8') : '';
      const newContent = `\n## ${new Date().toISOString()} Session\n\n${result}\n`;

      fs.writeFileSync(dailyFile, existing + newContent);
      log(`Knowledge saved to: ${dailyFile}`);

      try {
        execSync('git add . && git commit -m "Knowledge update" && git push gitee main 2>/dev/null || true', {
          cwd: KNOWLEDGE_DIR,
          stdio: 'ignore'
        });
      } catch (e) {
        log('Git push failed (may not be configured)');
      }
    }
  } catch (e) {
    log(`Extraction failed: ${e.message}`);
  }
}

extractKnowledge().catch(e => log(`Error: ${e.message}`));