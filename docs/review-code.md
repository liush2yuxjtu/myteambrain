# Code Review: session-start-hook.js & verifier-judge.js

## reviewer-code Review Summary

---

## session-start-hook.js

### Security Assessment

| Category | Status | Notes |
|----------|--------|-------|
| **Command Injection** | PASS | `execSync` uses hardcoded cmd strings, not user input. `cwd` is derived from fixed path `~/.myteambrain` |
| **Path Traversal** | PASS | `projectDir` from `CLAUDE_CWD` env or `cwd()` — both safe, no user-controlled path manipulation |
| **Symlink Attack** | PASS | `skillSrc` uses `PWD` + fixed suffix, symlink created in protected `~/.claude/skills/` |
| **File Write Safety** | PASS | CLAUDE.md injection uses controlled markers and regex replacement, no direct user input in path |
| **Git Pull Safety** | PASS | Uses `|| true` fallback, `timeout: 10000`, `stdio: 'ignore'` — fails gracefully |

### Error Handling

| Scenario | Status | Notes |
|----------|--------|-------|
| No memories | PASS | Line 37-40: skips injection gracefully |
| KNOWLEDGE_DIR missing | PASS | Line 101-104: logs and returns |
| daily dir missing | PASS | Line 118-121: logs and returns |
| No knowledge files | PASS | Line 125-128: handles empty array |
| Git pull fails | PASS | Line 113-115: caught, logged, continues |
| Async exception | PASS | Line 165-166: catches and logs |

### Edge Cases

| Case | Status | Notes |
|------|--------|-------|
| Empty memories array | PASS | `if (!memories.length)` check present |
| CLAUDE.md doesn't exist | PASS | Line 62-64: `existsSync` check, creates if missing |
| CLAUDE.md already has section | PASS | Line 67-72: regex replacement handles existing section |
| PWD env var empty | PASS | Line 83: `process.env.PWD \|\| ''` fallback |
| Very long memory content | PASS | Line 140: `substring(0, 200)` limits size |

### CEO_PLAN Dogfood Principle

| Criterion | Status | Notes |
|-----------|--------|-------|
| stop hook mechanism | PASS | Uses hook system correctly |
| 提炼 (extract/refine) | PASS | Reads from knowledge base, limits to 200 chars |
| git push | PASS | Pulls from remote before injection |
| SessionStart injection | PASS | Uses `hookSpecificOutput` pattern |
| gstack pattern following | PASS | Injects into CLAUDE.md like gstack does |

### Issues Found

**None critical.** Minor observations:

1. **Line 88**: `symlinkSync` may fail silently if dest exists. Log says "may already exist" but doesn't verify. Not a security issue, just informational.

2. **Line 166**: `injectKnowledge().catch()` only logs, doesn't affect exit code. For a hook that should be fire-and-forget this is OK.

---

## verifier-judge.js

### Security Assessment

| Category | Status | Notes |
|----------|--------|-------|
| **JSON Injection** | PASS | Uses native `JSON.parse`, caught by try/catch |
| **File Path Injection** | PASS | Path comes from git hook args (pre-commit context) |
| **Regex Denial of Service** | PASS | SAFETY_PATTERNS use `g` flag but resets properly; input-controlled, not user-driven |
| **ReDoS in safety patterns** | PASS | Patterns are static, pre-compiled, no exponential backtracking |
| **External Calls** | PASS | No network calls, no exec, deterministic |
| **Secret Detection Bypass** | PASS | Multi-layer filtering (line 114-122) catches common false positives |

### Error Handling

| Scenario | Status | Notes |
|----------|--------|-------|
| Invalid JSON in --entry | PASS | Line 186-190: catches parse error, exits with code 2 |
| Cannot read --file | PASS | Line 197-200: catches read error, exits with code 2 |
| Empty stdin | PASS | Line 210-213: errors if no input |
| Malformed JSON lines | PASS | Line 221-223: catches parse errors per line, exits code 2 |
| Missing arguments | PASS | Falls through to stdin mode (line 206) |

### Edge Cases

| Case | Status | Notes |
|------|--------|-------|
| Empty content | PASS | `entry.content \|\| ''` default |
| No tags | PASS | `entry.tags \|\| []` default |
| No type | PASS | `entry.type \|\| ''` default |
| Very long matches | PASS | Line 120: filters long strings without secret keyword |
| Date patterns | PASS | Line 115: filters `YYYY-MM-DD` formats |
| Version numbers | PASS | Line 116: filters `x.y.z` formats |
| Generic responses | PASS | Line 100-102: penalizes generic yes/no phrases |

### Determinism

| Criterion | Status | Notes |
|----------|--------|-------|
| No random | PASS | No Math.random(), Date-based variance only in timestamps |
| No external calls | PASS | No network, no exec, no file system beyond input |
| Same input = same output | PASS | Pure functions, no mutation of external state |

### Issues Found

**None critical.** Minor observations:

1. **Line 91-96**: `seenTopics` is a Set passed as parameter. Caller must manage state. Not an issue for CLI usage but if used as library could cause confusion.

2. **Line 120**: Long string filter `m.length > 24 && !/(secret|password|token|key)/i.test(m)` - could miss cases like `my_super_secret_key_12345678` where "secret" isn't present. Low risk since this is a heuristic.

---

## Overall Assessment

### session-start-hook.js: **PASS**

- Security: No injection risks identified
- Error handling: Graceful degradation for all edge cases
- CEO_PLAN alignment: Correctly implements stop hook → 提炼 → git pull → SessionStart injection flow
- Uses hookSpecificOutput correctly (line 157-162)
- Follows gstack pattern for CLAUDE.md injection

### verifier-judge.js: **PASS**

- Security: Deterministic, no injection vectors, comprehensive secret detection
- Error handling: Proper exit codes (2), descriptive error messages
- Edge cases: All handled with defaults
- No external dependencies, no randomness — suitable as quality gate

---

## Recommendations

1. **session-start-hook.js**: Consider adding `fsync` after write (line 74) to ensure CLAUDE.md is flushed before session reads it. Low priority.

2. **verifier-judge.js**: The `scoreNovelty` function takes `seenTopics` as parameter — if this is called in a loop for multiple entries, the caller should maintain the Set. Document this if the code is used as a library.

Both files are **ready for production use**.