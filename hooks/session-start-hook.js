#!/usr/bin/env node
/**
 * session-start-hook.js - Claude Code Session Start Hook
 *
 * Triggered when a Claude Code session starts.
 * Pulls latest knowledge from remote and injects into context via CLAUDE.md injection
 * (following gstack install-30s pattern: inject routing into CLAUDE.md).
 *
 * CEO_PLAN principle: "stop hook →提炼 → git push → SessionStart注入"
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const HOME = process.env.HOME || (require('os')).homedir();
const CONFIG_DIR = path.join(HOME, '.myteambrain');
const KNOWLEDGE_DIR = path.join(CONFIG_DIR, 'knowledge');
const MYTEAMBRAIN_SKILL_DIR = path.join(HOME, '.claude', 'skills', 'myteambrain');

function log(message) {
  const timestamp = new Date().toISOString();
  console.error(`[session-start-hook] ${timestamp}: ${message}`);
}

/**
 * Inject skill routing section into project's CLAUDE.md
 * Following gstack pattern: Claude Code loads CLAUDE.md on session start
 */
function injectCLAUDEmd(projectDir, memories) {
  const claudeMdPath = path.join(projectDir, 'CLAUDE.md');
  const sectionHeader = '## MyTeamBrain Session Context';
  const sectionFooter = '<!-- /MyTeamBrain -->';
  const startMarker = `<!-- ${sectionHeader} START -->`;
  const endMarker = `<!-- ${sectionHeader} END -->`;

  if (!memories.length) {
    log('No memories, skipping CLAUDE.md injection');
    return;
  }

  // Build section content
  let lines = [];
  lines.push('');
  lines.push(startMarker);
  lines.push(sectionHeader);
  lines.push('');
  lines.push('Latest team memories:');
  for (const m of memories) {
    const timestamp = m.timestamp ? new Date(m.timestamp).toISOString().split('T')[0] : 'unknown';
    const tags = m.tags && m.tags.length ? `[${m.tags.join(', ')}]` : '';
    lines.push(`- [${timestamp}] ${tags} ${m.content}`);
  }
  lines.push('');
  lines.push('Available skills: /browse, /office-hours, /review, /qa, /plan-ceo-review');
  lines.push(sectionFooter);
  lines.push('');

  const newSection = lines.join('\n');

  let existing = '';
  if (fs.existsSync(claudeMdPath)) {
    existing = fs.readFileSync(claudeMdPath, 'utf8');
  }

  // Replace existing section or append
  const sectionRegex = new RegExp(startMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s\\S]*?' + endMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'm');
  if (sectionRegex.test(existing)) {
    existing = existing.replace(sectionRegex, newSection.trim());
  } else {
    existing = existing.trimEnd() + '\n' + newSection;
  }

  fs.writeFileSync(claudeMdPath, existing, 'utf8');
  log(`Injected ${memories.length} memories into CLAUDE.md`);
}

/**
 * Ensure MyTeamBrain skill symlink exists in ~/.claude/skills/
 * Following gstack symlink injection pattern
 */
function ensureSkillSymlink() {
  const skillSrc = path.join(process.env.PWD || '', 'skills', 'myteambrain');
  const skillDest = MYTEAMBRAIN_SKILL_DIR;

  if (!fs.existsSync(skillDest) && fs.existsSync(skillSrc)) {
    try {
      fs.symlinkSync(skillSrc, skillDest);
      log('Created skill symlink in ~/.claude/skills/');
    } catch (e) {
      log(`Symlink failed (may already exist): ${e.message}`);
    }
  }
}

async function injectKnowledge() {
  log('Session starting, loading knowledge...');

  ensureSkillSymlink();

  if (!fs.existsSync(KNOWLEDGE_DIR)) {
    log('Knowledge base not initialized, skipping');
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
    return;
  }

  const files = fs.readdirSync(dailyDir).filter(f => f.endsWith('.md')).sort().reverse().slice(0, 7);

  if (files.length === 0) {
    log('No knowledge files found');
    return;
  }

  log(`Found ${files.length} recent knowledge file(s)`);

  // Build context content
  let memories = [];

  for (const file of files) {
    const content = fs.readFileSync(path.join(dailyDir, file), 'utf8');
    const filename = file.replace('.md', '');
    memories.push({
      id: filename,
      content: content.substring(0, 200),
      timestamp: filename,
      tags: ['daily']
    });
  }

  // Get project dir from env or cwd
  const projectDir = process.env.CLAUDE_CWD || process.cwd();

  // Inject into CLAUDE.md (gstack pattern)
  injectCLAUDEmd(projectDir, memories);

  log('Context injected via CLAUDE.md');
}

function outputNoContext() {
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
});