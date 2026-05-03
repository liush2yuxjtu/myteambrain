# End-to-End Flow Testing: MyTeamBrain Hooks

## Execution Flow Traced

### Session Start Flow

```
1. Claude Code starts → SessionStart hook fires
2. Hook runs: session-start-hook.js
3. git pull from ~/.myteambrain/knowledge (gitee main or origin main)
4. Reads last 7 .md files from ~/.myteambrain/knowledge/daily/
5. Writes to ~/.myteambrain/session-context.md
6. Prints "Type /query to search"
```

**Critical Path Issue**: Claude Code does NOT auto-load `~/.myteambrain/session-context.md`. Claude Code reads context from project-level `.claude/` directory, not from arbitrary external files.

### Session Stop Flow

```
1. Claude Code stops → Stop hook fires
2. Hook runs: stop-hook.js
3. Reads transcript from CLAUDE_TRANSCRIPT env or ~/.claude/transcripts/current.jsonl
4. Extracts last 100 lines
5. Calls `claude -p "..."` for extraction (ISSUE: recursive call!)
6. Saves to ~/.myteambrain/knowledge/daily/YYYY-MM-DD.md
7. git add + commit + push to gitee
```

**Critical Path Issue**: `claude -p` at line 54 would trigger another Claude session, causing infinite recursion or failure.

---

## Potential Failure Points

| Step | File | Issue | Severity |
|------|------|-------|----------|
| 1 | settings.json | Hook path references `.claude/hooks/` but actual hooks at `hooks/` | CRITICAL |
| 2 | session-start-hook.js | Claude Code doesn't auto-load external ~/.myteambrain/session-context.md | CRITICAL |
| 3 | stop-hook.js | Calls `claude -p` recursively → may spawn nested session | HIGH |
| 4 | setup.js | Config references `injectVia: "env"` but no env injection happens | MEDIUM |
| 5 | Both hooks | Git remote `gitee` may not be configured in knowledge dir | MEDIUM |

---

## Detailed Analysis

### 1. Hook Path Mismatch (CRITICAL - FAIL)

**settings.json** expects: `{CLAUDE_CWD}/.claude/hooks/session-start-hook.js`
**Actual location**: `{CLAUDE_CWD}/hooks/session-start-hook.js`

Claude Code will fail to find the hook file because `.claude/hooks/` doesn't exist.

### 2. Context Injection Mechanism (CRITICAL - FAIL)

**session-start-hook.js** writes to: `~/.myteambrain/session-context.md`

Claude Code does NOT automatically read this file. Claude Code loads context from:
- Project-level `CLAUDE.md`
- Project-level `.claude/` directory files
- Environment variables set in settings

The hook's comment says "Type /query to search" but Claude Code has no built-in `/query` command. This is a non-functional workflow.

### 3. Recursive Claude Call in Stop Hook (HIGH - FAIL)

**stop-hook.js** line 54:
```javascript
const result = execSync(`claude -p "${extractionPrompt.replace(/"/g, '\\"')}" 2>/dev/null`, {
```

This calls `claude -p` which would start another Claude process. If Claude Code's Stop hook fires, calling `claude -p` may:
- Spawn a nested session that never completes
- Fail if recursive spawning is blocked
- Cause unpredictable behavior

### 4. Git Configuration

**Both hooks** use:
```javascript
execSync('git pull gitee main 2>/dev/null || git pull origin main 2>/dev/null || true', {
```

The `gitee` remote must be configured in `~/.myteambrain/knowledge/`. If not, command silently succeeds due to `|| true`.

---

## Pass/Fail Assessment

| Component | Status | Reason |
|-----------|--------|--------|
| Hook path resolution | **FAIL** | `.claude/hooks/` doesn't exist, should be `hooks/` |
| Context injection into Claude | **FAIL** | Claude Code doesn't read ~/.myteambrain/session-context.md |
| Session stop extraction | **FAIL** | Recursive `claude -p` call is problematic |
| Git sync (gitee) | **PASS** (if configured) | Silent fallback with `|| true` |
| Daily knowledge storage | **PASS** (if reached) | File write logic is correct |

---

## Recommendations

1. **Move hooks to `.claude/hooks/`** OR update settings.json to point to `hooks/`

2. **Inject context via environment or proper mechanism**:
   - Write to `.claude/context/inject.md` (Claude Code reads `.claude/` recursively)
   - Or use environment injection via settings.json

3. **Fix recursive call in stop-hook.js**:
   - Use direct file parsing instead of `claude -p`
   - Or use a lightweight LLM API call instead of spawning Claude CLI

4. **Add explicit git remote check** before operations

---

## Required Files Check

| File | Exists? | Path |
|------|---------|------|
| session-start-hook.js | YES | `/Users/m1/projects/MyTeamBrain/.claude/worktrees/demo3/hooks/session-start-hook.js` |
| stop-hook.js | YES | `/Users/m1/projects/MyTeamBrain/.claude/worktrees/demo3/hooks/stop-hook.js` |
| setup.js | YES | `/Users/m1/projects/MyTeamBrain/.claude/worktrees/demo3/scripts/setup.js` |
| .claude/hooks/ (for settings.json) | **NO** | Actual: `hooks/` not `.claude/hooks/` |
| ~/.myteambrain/knowledge/ | Unknown | Not in worktree |

---

## Static Trace Conclusion

The hooks have the right intent but the implementation has critical structural issues:
1. Path mismatch between settings.json and actual hook location
2. Claude Code context injection mechanism doesn't work as implemented
3. Recursive Claude call in stop hook is dangerous

**Overall: NOT READY FOR USE** - Critical issues need fixing before functional.