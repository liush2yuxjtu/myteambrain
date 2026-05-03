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

    // Extract knowledge directly from transcript without spawning claude process
    const decisions = [];
    const learnings = [];
    const actions = [];

    // Parse JSONL transcript - each line is a JSON object
    lines.forEach(line => {
      if (!line.trim()) return;
      try {
        const entry = JSON.parse(line);
        const text = entry.message?.content?.text || '';
        if (!text) return;

        // Extract bullet points and numbered items as candidate knowledge
        const bulletPoints = text.match(/^[-\*\d]+\.\s*.+$/gm) || [];
        bulletPoints.forEach(bp => {
          const clean = bp.replace(/^[-\*\d]+\.\s*/, '').trim();
          if (clean.length > 10) {
            if (clean.match(/\b(implement|build|fix|add|create|update|change)\b/i)) {
              actions.push(clean);
            } else if (clean.match(/\b(learn|discover|realize|notice)\b/i)) {
              learnings.push(clean);
            } else if (clean.match(/\b(decide|decision|agreed|chosen)\b/i)) {
              decisions.push(clean);
            }
          }
        });

        // Extract lines that look like key decisions or learnings
        const lines2 = text.split('\n');
        lines2.forEach(l => {
          const trimmed = l.trim();
          if (trimmed.length > 20 && trimmed.length < 200) {
            if (/^(?:Decision|Learning|Action|Insight|Note):/i.test(trimmed)) {
              const value = trimmed.replace(/^(?:Decision|Learning|Action|Insight|Note):\s*/i, '');
              if (value.length > 10) {
                if (/^(?:Decision|Insight)/i.test(trimmed)) decisions.push(value);
                else if (/^(?:Learning|Note)/i.test(trimmed)) learnings.push(value);
                else actions.push(value);
              }
            }
          }
        });
      } catch (e) {
        // Skip malformed JSON lines
      }
    });

    // Format extraction result
    let result = '';
    if (decisions.length > 0) {
      result += '## Decisions\n' + decisions.slice(-5).join('\n- ') + '\n';
    }
    if (learnings.length > 0) {
      result += '## Learnings\n' + learnings.slice(-5).join('\n- ') + '\n';
    }
    if (actions.length > 0) {
      result += '## Actions\n' + actions.slice(-5).join('\n- ') + '\n';
    }
    if (!result) {
      result = 'No significant knowledge extracted.\n';
    }

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