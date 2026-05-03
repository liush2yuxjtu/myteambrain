# MyTeamBrain Architecture

```
    ╔═══════════════════════════════════════════════════════════════════════╗
    ║                         MyTeamBrain Architecture                     ║
    ╠═══════════════════════════════════════════════════════════════════════╣
    ║                                                                        ║
    ║  Session End Flow          Data Storage           Git Sync             ║
    ║  ───────────────          ───────────           ────────             ║
    ║                                                                        ║
    ║  ┌───────────┐     ┌───────────┐   ┌─────────┐    ┌───────────────┐  ║
    ║  │ Claude    │────►│ Stop Hook │──►│Verifier │───►│  Knowledge    │  ║
    ║  │ Code Exit │     │ (extract) │   │ Judge   │    │  Store (JSONL)│  ║
    ║  └───────────┘     └───────────┘   └────┬────┘    └───────┬───────┘  ║
    ║                                         │ reject           │          ║
    ║                                         ▼                  │          ║
    ║                                  ┌────────────┐           │          ║
    ║                                  │ Rejected   │           │          ║
    ║                                  │ Entries    │           │          ║
    ║                                  └────────────┘           │          ║
    ║                                                           ▼          ║
    ║                                              ┌─────────────────────┐ ║
    ║   ┌───────────┐                              │ Git Sync (gitee +  │ ║
    ║   │ Claude    │◄─────────────────────────────│ github remotes)     │ ║
    ║   │ Code      │     Memory Injection        └─────────────────────┘ ║
    ║   │ Start     │                                                        ║
    ║   └─────┬─────┘                                                        ║
    ║         │ Session Start                                                ║
    ║         ▼                                                              ║
    ║  ┌────────────────┐   ┌───────────┐   ┌─────────────┐                 ║
    ║  │ SessionStart   │──►│ Knowledge │◄──│ BM25-lite   │                 ║
    ║  │ Hook (load)    │   │ Store     │   │ scoring     │                 ║
    ║  └────────────────┘   └───────────┘   └─────────────┘                 ║
    ║                                                                        ║
    ╚═══════════════════════════════════════════════════════════════════════╝
```

---

## Component Overview

| Component | File | Type | Description |
|-----------|------|------|-------------|
| **Stop Hook** | `hooks/stop-hook.js` | Hook | Entry point; delegates to `scripts/stop-hook.js` |
| **Stop Hook Core** | `scripts/stop-hook.js` | Hook Logic | Extracts knowledge from transcript on session end |
| **SessionStart Hook** | `hooks/session-start-hook.js` | Hook | Entry point; delegates to `scripts/session-start-hook.js` |
| **SessionStart Core** | `scripts/session-start-hook.js` | Hook Logic | Injects memories on session start (BM25 scoring) |
| **Knowledge Store** | `scripts/knowledge-store.js` | Module | JSONL append-only storage with in-memory index |
| **Git Sync** | `scripts/git-sync.js` | Module | Team memory sync via gitee + github |
| **Verifier Judge** | `scripts/verifier-judge.js` | Quality Gate | 4-dimension quality check before storage |
| **CLI** | `scripts/cli.js` | Interface | Command-line interface for memory operations |
| **Setup** | `scripts/setup.js` | Installer | Initializes configuration and hooks |

---

## Data Flow

### Session End Flow

```
1. User types "exit" or closes terminal
       │
       ▼
2. Stop Hook triggers automatically (registered in settings.json)
       │
       ▼
3. hooks/stop-hook.js delegates to scripts/stop-hook.js
       │
       ▼
4. Read transcript from ~/.claude/transcripts/<session_id>.jsonl
       │
       ▼
5. LLM extracts key decisions/insights/patterns
       │
       ▼
6. Send to Verifier Judge for quality check (completeness/relevance/reusability/clean)
       │
       ├─── PASS (score >= 60) ──► Append to ~/.myteambrain/memory/{user}/sessions/{date}-{session-id}.jsonl
       │
       └─── FAIL (score < 60) ───► Log rejected entry, discard
       │
       ▼
7. Git Sync pushes to gitee + github remotes
```

### Session Start Flow

```
1. User runs "claude" command
       │
       ▼
2. SessionStart Hook triggers automatically
       │
       ▼
3. hooks/session-start-hook.js delegates to scripts/session-start-hook.js
       │
       ▼
4. Read memories from ~/.myteambrain/memory/{user}/sessions/
       │
       ▼
5. Build BM25-lite query tokens from cwd, git branch, recent files
       │
       ▼
6. Score each memory by token overlap with IDF weighting
       │
       ▼
7. Select top-K most relevant entries (default K=5)
       │
       ▼
8. Inject as console output (visible in session)
       │
       ▼
9. AI sees memories in context naturally
```

---

## Component Details

### Stop Hook (`hooks/stop-hook.js` + `scripts/stop-hook.js`)

**Purpose**: Captures session knowledge on Claude Code exit.

**Flow**:
1. `hooks/stop-hook.js` — Entry point, registered in `settings.json` as "stop" hook
2. Delegates to `scripts/stop-hook.js` — Core logic
3. Reads transcript from `~/.claude/transcripts/`
4. Extracts key decisions/learnings via LLM
5. Runs quality check via `verifier-judge.js`
6. Saves to `knowledge-store.js`
7. Triggers `git-sync.js` on quality pass

**Input**: Transcript file (`~/.claude/transcripts/current.jsonl`)

**Output**: JSONL entry to `~/.myteambrain/memory/{username}/sessions/`

**Key Features**:
- Idempotent execution (safe to run multiple times)
- Minimum turn threshold (skip short sessions)
- Automatic git sync after extraction
- Quality gate before storage

---

### SessionStart Hook (`hooks/session-start-hook.js` + `scripts/session-start-hook.js`)

**Purpose**: Injects relevant team memories at session start.

**Input**: Reads from two sources:
- `~/.myteambrain/knowledge/daily/` — markdown summaries from stop-hook
- `~/.myteambrain/memory/{user}/sessions/` — JSONL entries from knowledge-store

**Scoring Methods**:
- BM25-lite: Token overlap with IDF weighting (default)
- Keyword fallback: Simple token match when corpus < 50 docs

**Output**: Console output with top-K relevant memories visible in session

---

### Knowledge Store (`scripts/knowledge-store.js`)

**Purpose**: Append-only JSONL storage for team knowledge. In-memory index + file system dual write.

**Storage Path**: `~/.myteambrain/memory/{username}/sessions/{date}-{session-id}.jsonl`

**Interface**:
```javascript
// Save session memory
knowledgeStore.save({ username, sessionId, projectPath, content, tags, importance, timestamp })

// Search memories
knowledgeStore.search(query, { username, projectPath, startDate, endDate, tags, limit })

// Get recent memories
knowledgeStore.getRecent(username, days)

// Get all memories for a project
knowledgeStore.getByProject(projectPath)
```

**Features**:
- Atomic writes (temp file + rename)
- In-memory BM25-lite index for fast search
- Per-user, per-session organization
- Fuzzy search on content and tags

---

### Git Sync (`scripts/git-sync.js`)

**Purpose**: Synchronize knowledge across team machines.

**Remotes**:
- `gitee` — Primary (HPC/China network)
- `github` — Secondary (global access)

**Operations**:
- On init: `git pull --ff-only`
- After write: `git push gitee main && git push github main`
- Conflict handling: Skip push if pull fails

---

### Verifier Judge (`scripts/verifier-judge.js`)

**Purpose**: Quality gate for knowledge entries. Third-party judge evaluates session memory quality across 4 dimensions.

**Scoring Dimensions**:
| Dimension | Range | Description |
|-----------|-------|-------------|
| completeness | 0-100 | Has meaningful task description, decisions, code changes |
| relevance | 0-100 | Matches project/team keywords (hook, agent, skill, memory, etc.) |
| reusability | 0-100 | Contains rationale others can learn from |
| clean | 0-100 | No secrets, PII, debug noise, or stopping noise |

**Garbage Patterns Rejected**:
- Secrets/credentials (API keys, tokens, passwords, private keys)
- PII (SSN patterns)
- Debug noise (console.log, TODO, DEBUG flags)
- Stopping noise (sessions with "just stopping" + <100 chars)

**Pass Threshold**: total_score >= 60 (average of 4 dimensions)

**Output**: JSON verdict with `{ exit_code, scores, total_score, pass, summary, reason }`

---

## Extension Points

### Custom Scoring Algorithms

Extend `scripts/session-start-hook.js` scoring logic:

```javascript
// Current: BM25-lite in scoreMemory() function
// To add custom: modify tokenize() and scoreMemory() functions
```

### Additional Hooks

Hooks follow Claude Code hook registration format in `.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": {
      "command": "node /path/to/session-start-hook.js",
      "context": "currentWorkingDirectory"
    },
    "Stop": {
      "command": "node /path/to/stop-hook.js"
    }
  }
}
```

### Knowledge Filters

Extend `scripts/knowledge-store.js` save function:

```javascript
// Add pre-processing in save() function
function save(sessionData) {
  sessionData.content = scrubPII(sessionData.content);
  sessionData.tags = filterTags(sessionData.tags);
  // ... rest of implementation
}
```

### Custom Verifier Judge Dimensions

Extend `scripts/verifier-judge.js` scoring functions:

```javascript
// Add new dimension in judgeSession()
function scoreCustomDimension(entry) {
  // Implement custom scoring logic
}
```

---

## File Inventory

```
myteambrain/
├── hooks/
│   ├── session-start-hook.js     # SessionStart hook entry point
│   └── stop-hook.js              # Stop hook entry point
├── scripts/
│   ├── cli.js                    # CLI commands (init, status, memory)
│   ├── setup.js                  # Init script + config generation
│   ├── stop-hook.js              # Stop hook core logic
│   ├── session-start-hook.js     # SessionStart hook core logic
│   ├── knowledge-store.js        # JSONL storage module
│   ├── git-sync.js               # Git sync module
│   └── verifier-judge.js         # Quality gate
├── docs/
│   └── architecture.md           # This file
├── README.md
├── package.json
└── setup.sh
```

---

## Security Considerations

1. **No Secrets**: Verifier Judge rejects entries with API keys, tokens, private keys
2. **PII Filtering**: Rejects entries with SSN patterns and other PII
3. **Git Auth**: Uses SSH keys or token-based auth for gitee/github remotes
4. **Local Storage**: Knowledge stored in `~/.myteambrain/` with user-only permissions
5. **Quality Gate**: Low-quality or garbage entries rejected before storage
