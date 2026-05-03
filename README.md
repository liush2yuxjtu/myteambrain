# MyTeamBrain

    _   __  ______  ______
   / | / / / / __ \/ ____/
  /  |/ / / / / / / __/
 / /|  / / / /_/ / /___
//_/ |_/ /_/_____/_____/

**AI Collective Memory for Development Teams**

MyTeamBrain captures and shares AI context across sessions — your team thinks as one, not as individuals.

[![npm version](https://img.shields.io/npm/v/myteambrain)](https://www.npmjs.com/package/myteambrain)
[![Node.js](https://img.shields.io/badge/node-18%2B-green)](https://nodejs.org/)

---

## Quick Start

```bash
# 1. Install
npm install -g myteambrain

# 2. Initialize in your project
cd /path/to/your/project
myteambrain init

# 3. Start coding — AI remembers context automatically
claude
```

### Complete Initialization Flow

After `npm install -g myteambrain`, follow this steps:

```bash
# Step 1: Navigate to your project
cd /path/to/your/project

# Step 2: Initialize MyTeamBrain
myteambrain init

# Step 3: Verify initialization
myteambrain status

# Step 4: Configure git remotes (if not already set)
git remote add gitee https://gitee.com/yourname/myteambrain-memory.git
git remote add github https://github.com/yourname/myteambrain-memory.git

# Step 5: First push to share with team
myteambrain push

# Step 6: Start using Claude Code
claude
# AI will automatically load relevant memories at session start
# And extract knowledge when session ends
```

### First Time Setup (Team)

```bash
# Clone your team's shared memory repo
git clone https://github.com/your-team/myteambrain-memory.git
cd myteambrain-memory

# Initialize MyTeamBrain
myteambrain init

# Push to share with team
git add .
git commit -m "Initialize shared memory"
git push gitee main && git push github main
```

---

## How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│                        MyTeamBrain Flow                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Session End                      Session Start                 │
│       │                                 │                         │
│       ▼                                 ▼                         │
│  ┌────────┐    JSONL    ┌────────┐    ┌──────────────┐         │
│  │ Stop   │ ──────────► │  Git   │ ──►│ SessionStart │         │
│  │ Hook   │   push      │  Sync  │    │   Hook       │         │
│  └────────┘             └────────┘    └──────────────┘         │
│       │                                      │                   │
│       ▼                                      ▼                   │
│  ┌─────────────────────────────────────────────────────┐        │
│  │              Knowledge Store (JSONL)                │        │
│  │   ~/.myteambrain/knowledge/{date}.jsonl            │        │
│  └─────────────────────────────────────────────────────┘        │
│                                                                  │
│   Alice's context          Shared Memory          Bob's context │
│   gets extracted          ──────────────          gets loaded  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Core Components

| Component | Description |
|------------|-------------|
| **Stop Hook** | Triggers on Claude Code exit, extracts knowledge from transcript |
| **Knowledge Store** | Append-only JSONL storage with git sync |
| **SessionStart Hook** | Loads relevant memories when new session begins |
| **Verifier Judge** | Quality gate for knowledge entries |
| **Git Sync** | Synchronizes memory across team machines |

### Knowledge Flow

1. **Session End**: Stop Hook reads transcript, LLM extracts key decisions/insights
2. **Processing**: Verifier Judge validates quality and safety
3. **Storage**: Entry appended to JSONL file with tags and importance
4. **Sync**: Git push shares new entries with team
5. **Session Start**: SessionStart Hook loads relevant memories from team pool
6. **Context**: AI sees past decisions automatically, no re-learning needed

---

## Demo: Alice & Bob Share Knowledge

**Alice's session** (Day 1):
```
$ claude
# Works on user authentication flow
# Implements JWT refresh token logic
# Leaves session
[Stop Hook] → Extracts: JWT refresh gotcha, token rotation strategy
[Git Push]   → syncs to shared repo
```

**Bob's session** (Day 2):
```
$ claude
[SessionStart] → Loads auth-flow memory from Alice
# Already knows: JWT refresh gotcha, token rotation strategy
# No re-learning, no misalignment
```

---

## Configuration

`.myteambrain.json` in your project root:

```json
{
  "memoryDir": "./.myteambrain/knowledge",
  "sessionHooks": true,
  "autoPush": true,
  "stopHook": {
    "enabled": true,
    "minTurns": 5
  },
  "sessionStart": {
    "enabled": true,
    "topK": 5,
    "scorer": "bm25",
    "minScore": 0.1
  },
  "verifierJudge": {
    "enabled": true,
    "rejectOnLowQuality": true
  }
}
```

### Config Fields

`.myteambrain.json` configuration options:

| Field | Default | Description |
|-------|---------|-------------|
| `version` | `"0.1.0"` | Config version |
| `memoryDir` | `./.myteambrain/knowledge` | Local knowledge storage path |
| `knowledge_dir` | `~/.myteambrain/knowledge` | Global knowledge base location |
| `sessionHooks` | `true` | Enable/disable all hooks |
| `autoPush` | `true` | Auto-push to git remotes after extraction |
| `stopHook.enabled` | `true` | Enable stop hook |
| `stopHook.minTurns` | `5` | Min turns before extraction triggers |
| `sessionStart.enabled` | `true` | Enable session start hook |
| `sessionStart.topK` | `5` | Max memories to inject at session start |
| `sessionStart.scorer` | `"bm25"` | Relevance scoring method (bm25/keyword) |
| `sessionStart.minScore` | `0.1` | Minimum relevance score threshold |
| `verifierJudge.enabled` | `true` | Enable quality gate |
| `verifierJudge.rejectOnLowQuality` | `true` | Reject entries with quality score < 2 |
| `initialized` | - | ISO timestamp of initialization |

---

## CLI Commands

MyTeamBrain provides the following commands:

### init
```bash
myteambrain init
```
Initialize the knowledge base in the current project. Creates:
- `.myteambrain.json` config file
- `~/.myteambrain/knowledge/` directory structure
- Hooks registration check

### status
```bash
myteambrain status
```
Show knowledge base statistics:
- Total files and size
- Git branch and modified files count
- Hook installation status

### push
```bash
myteambrain push
```
Push local knowledge to git remotes (gitee + github).

### pull
```bash
myteambrain pull
```
Pull latest knowledge from git remotes.

### search
```bash
myteambrain search <query>
```
Search local knowledge base for entries matching query. Searches last 3 months of entries.

### Full Usage
```bash
myteambrain [command] [options]

Commands:
  init              Initialize knowledge base
  status            Show knowledge base stats
  push              Push knowledge to remote
  pull              Pull knowledge from remote
  search <text>     Search local knowledge base
```

---

## Project Structure

```
myteambrain/
├── hooks/
│   └── stop-hook.js          # Session stop hook implementation
├── scripts/
│   ├── cli.js                # CLI entry point
│   ├── setup.js              # Initialization script
│   ├── stop-hook.js          # Stop hook (legacy)
│   ├── session-start-hook.js # Session start hook
│   ├── knowledge-store.js    # JSONL read/write/query
│   ├── git-sync.js           # Git sync logic
│   └── verifier-judge.js     # Quality gate
├── docs/
│   └── features/            # Feature specifications
│       ├── stop-hook.md
│       ├── session-start-hook.md
│       ├── knowledge-store.md
│       └── verifier-judge.md
└── README.md
```

---

## Troubleshooting

### Common Issues

**Q: Hooks not triggering on session end/start**
```bash
# Verify hooks are registered
claude hooks list

# Re-register hooks if needed
myteambrain init --force
```

**Q: Knowledge not syncing to team**
```bash
# Check git remotes
git remote -v

# Manual push
git push gitee main && git push github main
```

**Q: "No transcript found" error**
```bash
# Ensure transcripts are enabled
export CLAUDE_TRANSCRIPT_DIR=~/.claude/transcripts
```

**Q: Memory injection seems slow**
- Reduce `topK` in config (default: 5)
- Increase `minScore` threshold to filter low-relevance entries

---

## Contributing

Contributions welcome! Please follow these guidelines:

### Process

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Make changes with tests
4. Run the judge harness: `npm run judge`
5. Commit with clear messages
6. Push to both remotes: `git push gitee main && git push github main`
7. Open a Pull Request

### Code Style

- Use Chinese comments for user-facing strings
- Keep functions under 50 lines
- Test every scoring dimension
- Idempotent operations only

### Docs

- Update `docs/features/*.md` for any behavior changes
- Add ASCII art diagrams for visual clarity
- Keep READMEs under 200 lines

---

## Changelog

All notable changes will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

### [0.1.0] - MVP Release

#### Added
- **CLI Commands**: `init`, `status`, `push`, `pull`, `search`
- **Stop Hook**: Session knowledge extraction on Claude Code exit
- **SessionStart Hook**: Memory injection at session start with BM25 scoring
- **Knowledge Store**: Append-only JSONL storage with per-month归档
- **Verifier Judge**: Quality gate with importance/relevance/novelty/safety scoring
- **Git Sync**: Dual remote sync (gitee + github) for team collaboration
- **Architecture Documentation**: Complete system design in `docs/architecture.md`

#### Features
- Minimum turn threshold for extraction (default: 5 turns)
- Relevance-based memory injection with configurable top-K
- PII and secrets filtering in Verifier Judge
- Idempotent hook execution (safe to run multiple times)
- Atomic JSONL writes with temp file + rename

---

## Links

- [Documentation](./docs/)
- [Architecture](./docs/architecture.md)
- [Feature Specs](./docs/features/)
- [npm Package](https://www.npmjs.com/package/myteambrain)

---

## License

MIT
