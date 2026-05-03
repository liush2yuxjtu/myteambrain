# End-to-End Flow Testing: MyTeamBrain Hooks

**Updated for commit 0ff00b3 (SessionStart hook fix)**

## Execution Flow Traced

### Session Start Flow (session-start-hook.js after fix)

```
1. Claude Code starts → SessionStart hook fires
2. Hook runs: session-start-hook.js
3. git pull from ~/.myteambrain/knowledge (gitee main or origin main)
4. Reads last 7 .md files from ~/.myteambrain/knowledge/daily/
5. Outputs JSON to stdout: { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: ... } }
6. Claude Code reads stdout and injects additionalContext into session
```

**FIXED**: Now uses `hookSpecificOutput.additionalContext` mechanism which Claude Code recognizes on SessionStart.

### Session Stop Flow (stop-hook.js - STILL BROKEN)

```
1. Claude Code stops → Stop hook fires
2. Hook runs: stop-hook.js
3. Reads transcript from CLAUDE_TRANSCRIPT env or ~/.claude/transcripts/current.jsonl
4. Extracts last 100 lines
5. Calls `claude -p "..."` for extraction (CRITICAL BUG - recursive call!)
6. Saves to ~/.myteambrain/knowledge/daily/YYYY-MM-DD.md
7. git add + commit + push to gitee
```

**STILL BROKEN**: Line 54 calls `claude -p` which would spawn another Claude session, causing infinite recursion or failure.

---

## Potential Failure Points (Post-Fix Assessment)

| Step | File | Issue | Severity | Status |
|------|------|-------|----------|--------|
| 1 | settings.json | Hook path references `.claude/hooks/` but actual hooks at `hooks/` | CRITICAL | **FAIL** |
| 2 | session-start-hook.js | Context injection via hookSpecificOutput | HIGH | **FIXED** |
| 3 | stop-hook.js | Calls `claude -p` recursively → may spawn nested session | HIGH | **FAIL** |
| 4 | setup.js | Config references `injectVia: "env"` but no env injection happens | MEDIUM | MEDIUM |
| 5 | Both hooks | Git remote `gitee` may not be configured | MEDIUM | MEDIUM |

---

## Detailed Analysis

### 1. Hook Path Mismatch (CRITICAL - FAIL)

**settings.json** expects: `{CLAUDE_CWD}/.claude/hooks/session-start-hook.js`
**Actual location**: `{CLAUDE_CWD}/hooks/session-start-hook.js`

Claude Code will fail to find the hook file because `.claude/hooks/` doesn't exist. **This was NOT fixed in 0ff00b3.**

### 2. Context Injection Mechanism (FIXED in session-start-hook.js)

**session-start-hook.js** now outputs JSON to stdout:
```javascript
const output = {
  hookSpecificOutput: {
    hookEventName: 'SessionStart',
    additionalContext: contextContent
  }
};
console.log(JSON.stringify(output));
```

Claude Code reads this JSON from stdout and injects `additionalContext` into the session. **This is the correct mechanism.**

### 3. Recursive Claude Call in Stop Hook (STILL BROKEN)

**stop-hook.js** line 54:
```javascript
const result = execSync(`claude -p "${extractionPrompt.replace(/"/g, '\\"')}" 2>/dev/null`, {
```

This calls `claude -p` which would start another Claude process. If Claude Code's Stop hook fires, calling `claude -p` may:
- Spawn a nested session that never completes
- Fail if recursive spawning is blocked
- Cause unpredictable behavior

**This was NOT addressed in commit 0ff00b3.**

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
| Context injection (SessionStart) | **PASS** | hookSpecificOutput mechanism is correct |
| Session stop extraction | **FAIL** | Recursive `claude -p` call is problematic |
| Git sync (gitee) | **PASS** (if configured) | Silent fallback with `|| true` |
| Daily knowledge storage | **PASS** (if reached) | File write logic is correct |

---

## Recommendations

1. **Fix hook path in settings.json**: Change `.claude/hooks/` to `hooks/`

2. **Fix recursive call in stop-hook.js**:
   - Use direct file parsing instead of `claude -p`
   - Or use a lightweight LLM API call instead of spawning Claude CLI
   - Or spawn `claude -p` in background mode with timeout

3. **Test the full flow end-to-end** once both issues are fixed

---

## Required Files Check

| File | Exists? | Path |
|------|---------|------|
| session-start-hook.js | YES | `/Users/m1/projects/MyTeamBrain/.claude/worktrees/demo3/hooks/session-start-hook.js` |
| stop-hook.js | YES | `/Users/m1/projects/MyTeamBrain/.claude/worktrees/demo3/hooks/stop-hook.js` |
| setup.js | YES | `/Users/m1/projects/MyTeamBrain/.claude/worktrees/demo3/scripts/setup.js` |
| .claude/hooks/ (for settings.json) | **NO** | Actual: `hooks/` not `.claude/hooks/` |

---

## Static Trace Conclusion (Post-Fix 0ff00b3)

**SessionStart hook**: FIXED - hookSpecificOutput mechanism correctly injects context.

**Stop hook**: STILL BROKEN - recursive `claude -p` call at line 54.

**Hook path**: STILL BROKEN - settings.json expects `.claude/hooks/` which doesn't exist.

**Overall: PARTIALLY FUNCTIONAL** - SessionStart works, but Stop hook and hook path still need fixing.