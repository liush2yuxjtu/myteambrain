# Architecture Review — SessionStart Hook Fix

**Reviewer**: reviewer-architecture
**Date**: 2026-05-03
**Commit**: 0ff00b3 (worktree-demo3)
**Subject**: SessionStart hook context injection via hookSpecificOutput

---

## 1. Architecture Assessment

### Approach

The fix uses `hookSpecificOutput` JSON envelope to inject team knowledge as `additionalContext` at session start. This is the correct Claude Code hook mechanism for passing context to the LLM session.

**What works:**
- `hookSpecificOutput` is the proper Claude Code hook output format
- Simple file-based approach (reads `~/.myteambrain/knowledge/daily/*.md`)
- JSON envelope with `hookEventName` + `additionalContext` correctly formed
- Graceful degradation (exit 0 always, null context when no knowledge)

### Simplicity (2-Day MVP Principle)

| Criterion | Assessment |
|-----------|------------|
| Scope | ✅ Single responsibility: read files + output JSON |
| Complexity | ✅ No BM25, no scoring engine — just sorted file read |
| Time to implement | ✅ < 2 hours given the gstack pattern |
| Lines of code | ✅ ~70 lines vs SPEC's elaborate BM25 which is overkill for MVP |

**Verdict**: Architecture is appropriately simple for MVP dogfood. Do not over-engineer at this stage.

### Correctness

**Will it actually work?**

1. ✅ Claude Code `SessionStart` hook fires on new session
2. ✅ `hookSpecificOutput.additionalContext` is the correct injection mechanism (per gstack pattern)
3. ✅ JSON format is valid: `{hookSpecificOutput: {hookEventName, additionalContext}}`
4. ✅ Exit 0 always — hook never blocks session start
5. ⚠️ `console.log(JSON.stringify(output))` sends JSON to stdout — but Claude Code hooks receive stdout as the hook result. The `hookSpecificOutput` mechanism requires the output to be processed by Claude Code itself. Need to verify if `console.log` is the correct channel vs some other mechanism.

**Potential correctness issue**: The hook writes to stdout, but Claude Code's hook system may expect the hook to write to a specific file or use a different IPC mechanism. The gstack pattern was not fully verified.

### Alignment with CEO_PLAN

| CEO_PLAN Principle | Implementation Status |
|--------------------|---------------------|
| Dogfood first | ✅ Using it in own Claude Code session |
| 2-day MVP | ✅ Simple file read + JSON output |
| Stop hook →提炼 → git push → SessionStart注入 | ✅ SessionStart reads from the knowledge extracted by Stop hook |
| Quality gate via verifier-judge | ⚠️ Not implemented yet — only in SPEC |
| Worktree development | ✅ All changes in worktree-demo3 |

---

## 2. Potential Issues

### Issue 1: Documentation Drift (SPEC vs Implementation)

The SPEC (`docs/features/session-start-hook.md`) describes:
- BM25 relevance scoring with weighted fields
- Keyword fallback when corpus < 50 docs
- Min score threshold of 0.1
- Session state file for idempotency

The implementation:
- Just reads last 7 `.md` files from `daily/`, sorted by filename (date)
- No scoring, no threshold, no idempotency tracking
- No `.myteambrain.json` config support

**Risk**: Someone reads the SPEC and implements BM25 instead of trusting the simple code.

**Recommendation**: Update SPEC to match implementation, or decide to implement BM25 and update code accordingly. Do not leave them divergent.

### Issue 2: Hook Output Channel Ambiguity

The code does `console.log(JSON.stringify(output))` expecting Claude Code to parse `hookSpecificOutput`. But:

1. Claude Code hooks documentation says output goes to `hookSpecificOutput` field
2. But HOW does Claude Code receive this? Is it from stdout? From a file? From an env var?

The gstack pattern was reference, but the actual mechanism needs verification.

**Recommendation**: Add a small test — create a dummy hook that outputs `hookSpecificOutput` and check if Claude Code actually receives the `additionalContext`.

### Issue 3: Path Context Not Used

The hook receives `context: currentWorkingDirectory` in hook registration, but the implementation does not use `cwd` for relevance filtering. It just reads ALL daily files regardless of project context.

**Current behavior**: All 7 most recent daily files are injected regardless of which project you are in.

**Impact**: If you are in `project-A` but your team's knowledge is about `project-B`, you will get irrelevant context injection.

**This is acceptable for MVP** (CEO_PLAN says dogfood first), but must be addressed before external users.

### Issue 4: No Quality Gate Yet

CEO_PLAN says "PR review + verifier-judge，防止垃圾知识入库". The SessionStart hook does not implement any quality filtering — it injects whatever is in the daily files.

**Impact**: Low for internal dogfood, critical for external users.

---

## 3. Recommendations

### Must Fix

1. **Verify hook output mechanism** — Test that `console.log` output actually reaches Claude Code as `hookSpecificOutput`. If not, we need the correct mechanism (maybe writing to a specific file path that Claude Code monitors).

2. **Align SPEC with implementation** — Either update SPEC to match simple file-read, or implement BM25 and update code to match SPEC. Documentation must not mislead future implementors.

### Should Fix

3. **Add basic path filtering** — At minimum, extract project name from `cwd` and filter knowledge files by project tag. Even a simple string match on `project` field in filename would help.

### Could Fix (Nice to Have)

4. **Add `minScore` threshold fallback** — Even without BM25, a simple "exclude files older than 7 days" or "exclude if filename project does not match cwd" could reduce noise.

5. **Idempotency tracking** — Track injected memory IDs in a session state file to prevent duplicate injections if hook re-fires.

---

## 4. Approval Decision

### ✅ **APPROVED** (with conditions)

**Rationale**:
1. The `hookSpecificOutput` approach is architecturally sound for the MVP
2. Simplicity wins — do not build BM25 until we have real user feedback
3. The team is using it dogfood-style, so issues will surface quickly
4. Worktree isolation means we can iterate safely

**Conditions for full approval**:
- [ ] Verify that `console.log` output actually reaches Claude Code as `hookSpecificOutput`
- [ ] Fix documentation drift (SPEC vs implementation)
- [ ] Add basic project-path filtering before external users

**Rejection triggers** (would need redesign):
- If `hookSpecificOutput` stdout mechanism does not actually work — the whole approach needs rethinking
- If BM25 is required before the first external user — current implementation will not scale

---

## 5. Summary for architect-sessionstart

The architecture is appropriate for a 2-day MVP. The main risks are:
1. Hook output channel not verified
2. SPEC drift from implementation
3. No project-path filtering yet

Recommend: Approve, then fix documentation drift, then add path filtering.