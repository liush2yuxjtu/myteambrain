#!/usr/bin/env node
/**
 * verifier-judge.js — Session knowledge quality gate
 * Third-party judge: evaluates session memory quality across 4 dimensions
 * Input: raw session JSON (task description, decisions, code changes)
 * Output: structured JSON with scores and pass/fail verdict
 */

'use strict';

const fs = require('fs');

// ── Constants ─────────────────────────────────────────────────────────────────
const MIN_PASS_SCORE = 60;

/**
 * Raw session entry expected fields:
 *   - taskDescription: string
 *   - decisions: string[]
 *   - codeChanges: string (or array of strings)
 *   - summary: string (optional)
 *   - transcript: string (optional, from session-start-hook)
 *   - messages: array (optional, raw message count)
 *   - isStopping: boolean (optional, indicates "just stopping")
 */

// ── Dimension 1: Completeness (0-100) ────────────────────────────────────────
function scoreCompleteness(entry) {
  const td = entry.taskDescription || '';
  const decisions = entry.decisions || [];
  const codeChanges = entry.codeChanges || [];
  const messages = entry.messages || [];
  const transcript = entry.transcript || '';

  let score = 0;

  // Has meaningful task description (not just "stopping")
  if (td.length > 20 && !/just (stopping|ending|pausing)/i.test(td)) {
    score += 30;
  }

  // Has decisions or architectural choices
  if (decisions.length > 0) {
    score += 20;
  } else if (/\b(decided|chose|preferred|selected|opted|refactored|migrated)\b/i.test(td)) {
    score += 10;
  }

  // Has code changes (files modified, new code written)
  const ccArray = Array.isArray(codeChanges) ? codeChanges : [codeChanges];
  const ccText = ccArray.filter(c => typeof c === 'string' && c.length > 10);
  if (ccText.length > 0) {
    score += 25;
  } else if (/\b(wrote|edited|added|modified|created|deleted|implemented)\b/i.test(td)) {
    score += 10;
  }

  // Has substantive message count (not just a few messages)
  if (messages.length >= 5) {
    score += 15;
  } else if (messages.length >= 2) {
    score += 8;
  } else if (transcript.length > 200) {
    score += 10;
  }

  return Math.min(100, Math.max(0, score));
}

// ── Dimension 2: Relevance (0-100) ───────────────────────────────────────────
const PROJECT_TEAM_KEYWORDS = [
  'myteambrain', 'teambrain', 'team', 'memory', 'knowledge', 'shared',
  'claude', 'code', 'agent', 'hook', 'session', 'transcript', 'verifier', 'judge',
  'biomedparse', 'uahp', 'medflow', 'medsam', 'monai', 'sam', 'augment',
  'claude code', 'codex', 'project', 'repository', 'repo', 'git',
  'knowledge-store', 'knowledge store', 'knowledge-graph',
  'stop-hook', 'stop hook', 'session-start', 'start hook',
  'hook-governor', 'trigger-auditor', 'delivery-gate',
];

function scoreRelevance(entry) {
  const td = (entry.taskDescription || '').toLowerCase();
  const decisions = entry.decisions || [];
  const codeChanges = entry.codeChanges || [];
  const tags = (entry.tags || []).map(t => t.toLowerCase());

  let score = 0;

  // Count keyword matches in task description
  let matchCount = 0;
  for (const kw of PROJECT_TEAM_KEYWORDS) {
    if (td.includes(kw.toLowerCase())) matchCount++;
  }
  if (matchCount >= 4) score += 35;
  else if (matchCount >= 2) score += 20;
  else if (matchCount >= 1) score += 10;

  // Check decisions for relevance
  const decisionText = decisions.join(' ').toLowerCase();
  let dcMatches = 0;
  for (const kw of PROJECT_TEAM_KEYWORDS) {
    if (decisionText.includes(kw.toLowerCase())) dcMatches++;
  }
  if (dcMatches >= 2) score += 25;
  else if (dcMatches >= 1) score += 15;

  // Check code changes for relevant file names / patterns
  const ccText = Array.isArray(codeChanges) ? codeChanges.join(' ') : String(codeChanges);
  const relevantPatterns = /\b(hook|agent|skill|memory|knowledge|brain|cli|git|script|hookify)\b/i;
  if (relevantPatterns.test(ccText)) score += 20;

  // Tags match
  const tagText = tags.join(' ');
  if (PROJECT_TEAM_KEYWORDS.some(kw => tagText.includes(kw.toLowerCase()))) {
    score += 20;
  }

  return Math.min(100, Math.max(0, score));
}

// ── Dimension 3: Reusability (0-100) ─────────────────────────────────────────
function scoreReusability(entry) {
  const td = entry.taskDescription || '';
  const decisions = entry.decisions || [];
  const codeChanges = entry.codeChanges || [];

  let score = 0;

  // Contains decisions that others can learn from
  if (decisions.length > 0) {
    const hasRationale = decisions.some(d =>
      /\b(because|since|therefore|reason| chose | preferred | decided |thus)\b/i.test(d)
    );
    score += hasRationale ? 35 : 20;
  }

  // Has code changes that show a pattern
  const ccText = Array.isArray(codeChanges) ? codeChanges.join(' ') : String(codeChanges);
  if (/\b( pattern | approach | method | technique | recipe | convention )\b/i.test(ccText)) {
    score += 30;
  } else if (ccText.length > 50) {
    score += 15;
  }

  // Task description includes "how" or "why" signal
  if (/\b( how | why | reason | approach | lesson | learned | insight )\b/i.test(td)) {
    score += 20;
  }

  // Generic session (no decisions, no real changes) gets low score
  if (decisions.length === 0 && ccText.length < 20) {
    score = Math.min(score, 30);
  }

  return Math.min(100, Math.max(0, score));
}

// ── Dimension 4: Clean / No Garbage (0-100) ───────────────────────────────────
const GARBAGE_PATTERNS = [
  // Secrets and credentials
  { pattern: /\b(secret|password|passwd|pwd|token|apikey|api_key|auth)[_\-]?[=:]\s?[a-zA-Z0-9_]{16,}/gi, label: 'secret_keyword' },
  { pattern: /\b(AKIA|ABIA|ACCA|ASIA)[0-9A-Z]{16}\b/g, label: 'aws_key' },
  { pattern: /\bgh[pousr]_[A-Za-z0-9_]{36,}\b/g, label: 'github_token' },
  { pattern: /-----BEGIN (RSA|DSA|EC|OPENSSH) PRIVATE KEY-----/g, label: 'private_key' },
  // Personal info
  { pattern: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g, label: 'ssn' },
  // Debug noise patterns
  { pattern: /\bconsole\.(log|debug)\s*\(/g, label: 'console_log' },
  { pattern: /\btodo:.*\b/i, label: 'todo_comment' },
  { pattern: /\bDEBUG\s*=\s*true/i, label: 'debug_flag' },
  { pattern: /\bprint\s*\(\s*['"].*debug/i, label: 'print_debug' },
];

function scoreClean(entry) {
  const td = entry.taskDescription || '';
  const decisions = entry.decisions || [];
  const codeChanges = entry.codeChanges || [];

  const allText = [
    td,
    ...decisions,
    ...(Array.isArray(codeChanges) ? codeChanges : [codeChanges]),
  ].join(' ');

  let penalty = 0;
  const foundGarbage = [];

  for (const { pattern, label } of GARBAGE_PATTERNS) {
    const matches = allText.match(pattern);
    if (matches && matches.length > 0) {
      // Filter out false positives
      const filtered = matches.filter(m => {
        // Allow version numbers like 1.2.3
        if (/\b\d+\.\d+\.\d+\b/.test(m)) return false;
        // Allow node_modules paths
        if (/node_modules/i.test(m)) return false;
        // Allow postgres version strings
        if (/postgres\d*/i.test(m)) return false;
        return true;
      });
      if (filtered.length > 0) {
        penalty += 20;
        foundGarbage.push(label);
      }
    }
  }

  // Very short sessions with no real content may be "stopping" noise
  if (td.length < 15 && decisions.length === 0 && allText.length < 50) {
    penalty += 30;
    foundGarbage.push('empty_session');
  }

  // Penalize if there's obviously just a stopping message
  if (/just (stopping|ending|pausing|done|finished)/i.test(td) && allText.length < 100) {
    penalty += 40;
    foundGarbage.push('stopping_noise');
  }

  const score = Math.max(0, 100 - penalty);

  return {
    score,
    garbage: foundGarbage.length > 0 ? foundGarbage : undefined,
  };
}

// ── Main judge function ─────────────────────────────────────────────────────────
/**
 * Judge a raw session entry
 * @param {Object} entry - raw session JSON
 * @returns {Object} verdict JSON
 */
function judgeSession(entry) {
  const completeness = scoreCompleteness(entry);
  const relevance = scoreRelevance(entry);
  const reusability = scoreReusability(entry);
  const { score: clean, garbage } = scoreClean(entry);

  const scores = {
    completeness,
    relevance,
    reusability,
    clean,
  };

  const total_score = Math.round(
    (completeness + relevance + reusability + clean) / 4
  );

  const pass = total_score >= MIN_PASS_SCORE;

  // Build reason summary
  let reasonParts = [];
  if (completeness < 50) reasonParts.push(`low completeness (${completeness})`);
  if (relevance < 50) reasonParts.push(`low relevance (${relevance})`);
  if (reusability < 50) reasonParts.push(`low reusability (${reusability})`);
  if (clean < 50) reasonParts.push(`contains garbage: ${(garbage || []).join(', ')}`);

  const reason = reasonParts.length > 0
    ? reasonParts.join('; ')
    : `all dimensions pass (c:${completeness} r:${relevance} re:${reusability} cl:${clean})`;

  // Summary: short human-readable description
  const summary = entry.taskDescription
    ? entry.taskDescription.slice(0, 120) + (entry.taskDescription.length > 120 ? '...' : '')
    : 'Session memory entry';

  return {
    exit_code: pass ? 0 : 1,
    scores,
    total_score,
    pass,
    summary,
    reason,
  };
}

// ── CLI ──────────────────────────────────────────────────────────────────────────
function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: node verifier-judge.js [--file <path>|--json <json>|stdin]');
    console.error('  --file <path>   Read session JSON from file (one JSON per line for batch)');
    console.error('  --json <json>   Pass session JSON directly as argument');
    console.error('  stdin           Read JSON from stdin (one JSON per line)');
    process.exit(2);
  }

  let entries = [];

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--file' && args[i + 1]) {
      try {
        const content = fs.readFileSync(args[i + 1], 'utf8');
        const lines = content.trim().split('\n').filter(Boolean);
        entries = lines.map(line => JSON.parse(line));
      } catch (e) {
        console.error(`Error: Cannot read file ${args[i + 1]}: ${e.message}`);
        process.exit(2);
      }
      break;
    }
    if (args[i] === '--json' && args[i + 1]) {
      try {
        entries = [JSON.parse(args[i + 1])];
      } catch (e) {
        console.error(`Error: Invalid JSON: ${e.message}`);
        process.exit(2);
      }
      break;
    }
  }

  // If no args processed, read from stdin
  if (entries.length === 0) {
    const chunks = [];
    process.stdin.on('data', chunk => chunks.push(chunk));
    process.stdin.on('end', () => {
      const content = chunks.join('');
      if (!content.trim()) {
        console.error('Error: No input provided');
        process.exit(2);
      }
      const lines = content.trim().split('\n').filter(Boolean);
      entries = lines.map(line => {
        try {
          return JSON.parse(line);
        } catch (e) {
          console.error(`Error parsing line: ${e.message}`);
          process.exit(2);
        }
      });
      runJudgments(entries);
    });
    return;
  }

  runJudgments(entries);
}

function runJudgments(entries) {
  for (const entry of entries) {
    const verdict = judgeSession(entry);
    process.stdout.write(JSON.stringify(verdict) + '\n');
  }
}

// ── Exports ───────────────────────────────────────────────────────────────────
module.exports = {
  judgeSession,
  scoreCompleteness,
  scoreRelevance,
  scoreReusability,
  scoreClean,
  MIN_PASS_SCORE,
  /**
   * Determine if entry should be pushed to shared memory
   * @param {Object} entry - raw session JSON
   * @returns {Object} { shouldPush, total_score, reason }
   */
  shouldPushToSharedMemory(entry) {
    const verdict = judgeSession(entry);
    return {
      shouldPush: verdict.pass,
      total_score: verdict.total_score,
      reason: verdict.reason,
    };
  },
};

// Run CLI if called directly
if (require.main === module) {
  main();
}
