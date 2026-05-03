#!/usr/bin/env node
/**
 * stop-hook.js - Claude Code Session Stop Hook (Core Logic)
 *
 * Triggered when a Claude Code session ends.
 * Extracts knowledge from session transcript, runs quality checks,
 * and saves to the shared knowledge base.
 *
 * Usage: node stop-hook.js [session_id]
 *   session_id: optional, defaults to reading from CLAUDE_SESSION_ID env
 *
 * Environment:
 *   CLAUDE_SESSION_ID     - current session identifier
 *   CLAUDE_TRANSCRIPT     - path to transcript file
 *   HOME                  - home directory
 *
 * Flow:
 *   1. READ transcript from env or default path
 *   2. EXTRACT key decisions/learnings/actions
 *   3. JUDGE via verifier-judge.js quality gate
 *   4. STORE via knowledge-store.js JSONL append
 *   5. SYNC via git-sync.js push (on quality pass)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { randomUUID } = require('crypto');

// ── Config ───────────────────────────────────────────────────────────────────
const HOME = process.env.HOME || os.homedir();
const CONFIG_DIR = path.join(HOME, '.myteambrain');
const KNOWLEDGE_DIR = path.join(CONFIG_DIR, 'knowledge');
const TRANSCRIPT_DIR = path.join(HOME, '.claude', 'transcripts');
const SESSION_ID = process.env.CLAUDE_SESSION_ID || '';
const TRANSCRIPT_PATH = process.env.CLAUDE_TRANSCRIPT ||
  path.join(TRANSCRIPT_DIR, 'current.jsonl');
const VERIFIER_JUDGE = path.join(__dirname, 'verifier-judge.js');
const KNOWLEDGE_STORE = path.join(__dirname, 'knowledge-store.js');
const GIT_SYNC = path.join(__dirname, 'git-sync.js');
const MIN_TURNS = 5;

// ── Logging ─────────────────────────────────────────────────────────────────
function log(level, ...args) {
  const prefix = '[stop-hook]';
  console.error(`${prefix} [${level}]`, ...args);
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function execAsync(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: opts.timeout || 30000,
      ...opts,
    });
    let stdout = '';
    let stderr = '';
    const timer = opts.timeout ?
      setTimeout(() => { child.kill('SIGTERM'); reject(new Error(`${cmd} timed out`)); }, opts.timeout) :
      null;
    child.stdout.on('data', d => stdout += d.toString());
    child.stderr.on('data', d => stderr += d.toString());
    child.on('close', code => {
      if (timer) clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
    child.on('error', reject);
  });
}

function execSync(cmd, args, opts = {}) {
  const { spawn: sp } = require('child_process');
  return sp.sync(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'], ...opts });
}

// ── Transcript reading ───────────────────────────────────────────────────────
function getLatestTranscript() {
  if (!fs.existsSync(TRANSCRIPT_DIR)) return null;
  const files = fs.readdirSync(TRANSCRIPT_DIR)
    .filter(f => f.endsWith('.jsonl') && f !== 'interactions.jsonl')
    .map(f => ({
      name: f,
      mtime: fs.statSync(path.join(TRANSCRIPT_DIR, f)).mtime.getTime(),
    }))
    .sort((a, b) => b.mtime - a.mtime);
  return files.length > 0 ? path.join(TRANSCRIPT_DIR, files[0].name) : null;
}

function parseTranscript(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());
  const turns = [];
  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      if (obj.type === 'user' || obj.type === 'assistant') {
        turns.push(obj);
      }
    } catch {
      // skip malformed lines
    }
  }
  return turns;
}

// ── Knowledge extraction ────────────────────────────────────────────────────
function inferTags(content) {
  const tags = [];
  const lower = content.toLowerCase();
  const tagMap = [
    { kw: /决策|决定|采用|选择/, tag: '决策' },
    { kw: /发现|注意到|原来/, tag: '发现' },
    { kw: /模式|架构|重构/, tag: '架构' },
    { kw: /竞品|augment|tabnine/, tag: '竞品分析' },
    { kw: /产品|用户需求|mvp/, tag: '产品' },
    { kw: /风险|问题|bug/, tag: '风险' },
    { kw: /团队记忆|知识流动|shared/, tag: '团队记忆' },
    { kw: /技术路径|实现方式/, tag: '技术路径' },
    { kw: /测试|验证|回归/, tag: '测试' },
    { kw: /文档|readme|spec/, tag: '文档' },
  ];
  for (const { kw, tag } of tagMap) {
    if (kw.test(lower)) tags.push(tag);
  }
  return tags.length > 0 ? tags : ['通用'];
}

function inferImportance(content) {
  const lower = content.toLowerCase();
  if (/决策|风险|关键|重要/.test(lower)) return 'high';
  if (/发现|产品|竞品/.test(lower)) return 'high';
  if (/模式|架构/.test(lower)) return 'medium';
  return 'medium';
}

function scrubPII(text) {
  return text
    .replace(/[\w.-]+@[\w.-]+\.\w+/g, '[EMAIL]')
    .replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[PHONE]')
    .replace(/\b\d{11,}\b/g, '[ID]');
}

function extractKnowledge(turns, sessionId) {
  if (turns.length < MIN_TURNS) {
    log('info', `Session ${sessionId}: ${turns.length} turns, skipping (min ${MIN_TURNS})`);
    return [];
  }

  const now = new Date().toISOString();
  const items = [];

  // Last 20 turns for context
  const transcriptText = turns
    .slice(-20)
    .map(t => `[${t.type}] ${typeof t.message?.content === 'string' ? t.message.content.slice(0, 500) : ''}`)
    .join('\n');

  // Pattern-based extraction
  const patterns = [
    { trigger: /决策[：:]/g, importance: 'high', tag: '决策' },
    { trigger: /决定[：:]/g, importance: 'high', tag: '决策' },
    { trigger: /采用[：:]/g, importance: 'high', tag: '技术路径' },
    { trigger: /发现[：:]/g, importance: 'high', tag: '发现' },
    { trigger: /MVP[：:]/g, importance: 'medium', tag: '产品' },
    { trigger: /团队记忆[：:]/g, importance: 'high', tag: '团队记忆' },
    { trigger: /Stop Hook[：:]/g, importance: 'high', tag: '技术路径' },
    { trigger: /SessionStart[：:]/g, importance: 'medium', tag: '架构' },
    { trigger: /实现[：:]/g, importance: 'medium', tag: '技术路径' },
    { trigger: /修复[：:]/g, importance: 'medium', tag: '风险' },
  ];

  const lines = transcriptText.split('\n');
  const seenContent = new Set();

  for (const line of lines) {
    for (const p of patterns) {
      if (p.trigger.test(line)) {
        const rawContent = line.replace(p.trigger, '').trim();
        const content = scrubPII(rawContent);
        if (content.length > 10 && !seenContent.has(content)) {
          seenContent.add(content);
          items.push({
            id: randomUUID(),
            timestamp: now,
            author: 'claude',
            session_id: sessionId,
            content,
            tags: [...new Set([p.tag, ...inferTags(content)])].slice(0, 5),
            importance: p.importance,
          });
        }
        break;
      }
    }
  }

  if (items.length === 0) {
    const summary = scrubPII(`Session ${sessionId} 结束，共 ${turns.length} 轮对话`);
    items.push({
      id: randomUUID(),
      timestamp: now,
      author: 'claude',
      session_id: sessionId,
      content: summary,
      tags: ['通用'],
      importance: 'low',
    });
  }

  return items;
}

// ── Verifier judge ───────────────────────────────────────────────────────────
let verifierJudge;
try {
  verifierJudge = require('./verifier-judge.js');
} catch {
  log('warn', 'Could not require verifier-judge.js, will use subprocess');
}

// Synchronous quality check using required module
function judgeEntrySync(entry) {
  try {
    const { shouldPush, total_score, reason } = verifierJudge.shouldPushToSharedMemory(entry);
    return { approved: shouldPush, total_score, reason };
  } catch (err) {
    log('warn', `Judge sync error: ${err.message}`);
    return { approved: false, reason: `judge error: ${err.message}` };
  }
}

async function judgeEntries(entries) {
  if (!fs.existsSync(VERIFIER_JUDGE)) {
    log('warn', 'verifier-judge.js not found, skipping quality check');
    return entries.map(e => ({ approved: true, reason: 'no judge available' }));
  }

  // Use direct require when available (faster, no subprocess)
  if (verifierJudge) {
    return entries.map(entry => judgeEntrySync(entry));
  }

  // Fallback: subprocess per entry
  const results = [];
  for (const entry of entries) {
    try {
      const { stdout } = await execAsync('node', [VERIFIER_JUDGE, '--json', JSON.stringify(entry)], {
        timeout: 10000,
      });
      const verdict = JSON.parse(stdout.trim().split('\n').pop());
      verdict.approved = verdict.pass;
      results.push(verdict);
    } catch (err) {
      log('warn', `Judge failed for entry ${entry.id}: ${err.message}`);
      results.push({ approved: false, reason: `judge error: ${err.message}` });
    }
  }
  return results;
}

// ── Knowledge store ───────────────────────────────────────────────────────────
function appendKnowledgeStore(entries) {
  if (!fs.existsSync(KNOWLEDGE_STORE)) {
    // Fallback: direct append to JSONL
    return appendJSONLDirect(entries);
  }

  const results = [];
  for (const entry of entries) {
    try {
      // Use 'save' command (not 'append')
      const { stdout } = execSync('node', [
        KNOWLEDGE_STORE, 'save',
        entry.author || 'claude',
        entry.session_id || 'unknown',
        entry.projectPath || '',
        '--tags', (entry.tags || []).join(','),
        '--importance', entry.importance === 'high' ? '4' : entry.importance === 'medium' ? '3' : '2',
      ], { encoding: 'utf-8' });
      results.push({ success: true, entry: JSON.parse(stdout.trim()) });
    } catch (err) {
      log('warn', `knowledge-store failed for entry ${entry.id}: ${err.message}`);
      // Rollback: write to backup
      appendJSONLDirect([entry]);
      results.push({ success: false, entry });
    }
  }
  return results;
}

function appendJSONLDirect(entries) {
  ensureDir(KNOWLEDGE_DIR);
  const yearMonth = new Date().toISOString().slice(0, 7);
  const filePath = path.join(KNOWLEDGE_DIR, `${yearMonth}.jsonl`);
  const lines = entries.map(e => JSON.stringify(e)).join('\n') + '\n';
  fs.appendFileSync(filePath, lines, 'utf-8');
  log('info', `Appended ${entries.length} entries to ${filePath}`);
  return entries.map(e => ({ success: true, entry: e }));
}

// ── Git sync ─────────────────────────────────────────────────────────────────
async function gitSyncPush() {
  if (!fs.existsSync(GIT_SYNC)) {
    log('warn', 'git-sync.js not found, skipping sync');
    return false;
  }

  try {
    const { stdout, stderr, code } = await execAsync('node', [GIT_SYNC, 'push'], {
      timeout: 30000,
      cwd: KNOWLEDGE_DIR,
    });
    if (code === 0) {
      log('info', 'Git push succeeded');
      return true;
    } else {
      log('warn', `Git push failed: ${stderr.slice(0, 200)}`);
      return false;
    }
  } catch (err) {
    log('warn', `Git sync error: ${err.message}`);
    return false;
  }
}

// ── Session dedup ─────────────────────────────────────────────────────────────
function isSessionProcessed(sessionId) {
  if (!sessionId || !fs.existsSync(KNOWLEDGE_DIR)) return false;
  const yearMonth = new Date().toISOString().slice(0, 7);
  const filePath = path.join(KNOWLEDGE_DIR, `${yearMonth}.jsonl`);
  if (!fs.existsSync(filePath)) return false;

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());
  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      if (obj.session_id === sessionId) return true;
    } catch {
      // skip
    }
  }
  return false;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  // Determine session ID
  const sessionIdArg = process.argv[2];
  let sessionId = sessionIdArg || SESSION_ID;

  // Get transcript path
  let transcriptPath = TRANSCRIPT_PATH;
  if (!fs.existsSync(transcriptPath)) {
    transcriptPath = getLatestTranscript();
    if (!transcriptPath) {
      log('info', 'No transcript found, skipping');
      return;
    }
  }

  // If no session ID, derive from transcript filename
  if (!sessionId) {
    sessionId = path.basename(transcriptPath, '.jsonl');
  }

  log('info', `Processing session: ${sessionId}`);
  log('debug', `Transcript: ${transcriptPath}`);

  // Idempotency check
  if (isSessionProcessed(sessionId)) {
    log('info', `Session ${sessionId} already processed, skipping`);
    return;
  }

  // Read and parse transcript
  let turns;
  try {
    turns = parseTranscript(transcriptPath);
    log('debug', `Loaded ${turns.length} turns`);
  } catch (err) {
    log('error', `Failed to read transcript: ${err.message}`);
    return;
  }

  // Extract knowledge
  const entries = extractKnowledge(turns, sessionId);
  if (entries.length === 0) {
    log('info', 'No knowledge to extract');
    return;
  }

  log('info', `Extracted ${entries.length} knowledge items`);

  // Judge quality
  const verdicts = await judgeEntries(entries);
  const approved = verdicts.filter(v => v.approved);

  log('info', `Quality check: ${approved.length}/${entries.length} approved`);

  if (approved.length === 0) {
    log('info', 'No entries passed quality gate, skipping store');
    return;
  }

  // Store approved entries
  const storeResults = appendKnowledgeStore(approved.map(v => v.entry));
  const stored = storeResults.filter(r => r.success).length;
  log('info', `Stored ${stored}/${approved.length} entries`);

  // Git sync (async, non-blocking on failure)
  if (stored > 0) {
    gitSyncPush().catch(() => {});
  }

  log('info', `Done for session ${sessionId}`);
}

// ── Entry point ──────────────────────────────────────────────────────────────
main().catch(err => {
  log('error', `Fatal: ${err.message}`);
  process.exit(1);
});