# MyTeamBrain Architecture

___
 ███████╗ ██████╗██╗  ██╗ ██████╗  ██████╗ ███████╗
██╔════╝██╔════╝██║  ██║██╔═══██╗██╔═══██╗██╔════╝
███████╗██║     ███████║██║   ██║██║   ██║███████╗
╚════██║██║     ██╔══██║██║   ██║██║   ██║╚════██║
███████║╚██████╗██║  ██║╚██████╔╝╚██████╔╝███████║
╚══════╝ ╚═════╝╚═╝  ╚═╝ ╚═════╝  ╚═════╝ ╚══════╝

## 索引（一句话）

SessionStart hook 注入学到的团队记忆到每个新 session，Stop hook 提炼 session 为知识，git sync 跨成员同步。

---

## Summary

MyTeamBrain 让团队每个人的 AI 同时拥有全团队经验。核心管道：Stop hook 提炼 session 为 JSONL 知识 → git 双端同步 → SessionStart hook BM25 评分注入到新 session。另有 Verifier-Judge 做入库前质量门控。

---

## 1. 系统概览

```
┌─────────────────────────────────────────────────────────────┐
│  Alice Session (Day 1)                                       │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐              │
│  │  Stop    │───>│  JSONL   │───>│   Git    │              │
│  │  Hook    │    │  写入     │    │  push    │              │
│  └──────────┘    └──────────┘    └──────────┘              │
│       │              │               │                      │
│       │  提炼 session              gitee+github            │
│       │  为知识条目                 双端同步               │
└───────┼──────────────┼───────────────┼──────────────────────┘
        │              │               │
        │         ~/.myteambrain/knowledge/
        │              │               │
        │              v               │
        │    ┌─────────────────┐       │
        │    │  2026-05.jsonl  │<──────┘
        │    └─────────────────┘
        │              │
        │              │  Bob Session (Day 2) 拉取
        │              v
        │    ┌──────────────────────────────────┐
        │    │       SessionStart Hook          │
        │    │  ┌────────────────────────────┐  │
        │    │  │ BM25  relevance scoring    │  │
        │    │  │ cwd + branch + commits     │  │
        │    │  └────────────────────────────┘  │
        │    │  ┌────────────────────────────┐  │
        │    │  │ Top-K 知识条目注入 session │  │
        │    │  └────────────────────────────┘  │
        │    └──────────────────────────────────┘
        │              │
        │              v
        │    ┌──────────────────────────────────┐
        │    │  Bob 的 Claude Code session      │
        │    │  "已知道：Alice 的 JWT gotcha"  │
        │    └──────────────────────────────────┘
        │
        │  Verifier-Judge (PR 前置门控)
        v
┌───────────────────────────────────────────────────────────────┐
│  知识入库前质量门控                                           │
│  importance/relevance/novelty 评分                           │
│  PII/secrets 检测 → approved/rejected                       │
└───────────────────────────────────────────────────────────────┘
```

---

## 2. 核心组件

### 2.1 Stop Hook (session-end)

**职责**：读取 transcript，提炼知识，写入 JSONL。

| 字段 | 说明 |
|------|------|
| `timestamp` | ISO 8601 含时区 |
| `author` | `"claude"` 或用户名 |
| `session_id` | Claude Code session ID |
| `content` | 知识内容（中文简洁）|
| `tags` | 标签数组 |
| `importance` | `high/medium/low` |

### 2.2 SessionStart Hook (session-start)

**职责**：读 JSONL → BM25 评分 → 注入 top-k 记忆到 session。

**Relevance Scoring 策略**：

| 字段 | 权重 |
|------|------|
| `topic` | 2.0 |
| `tags` | 1.5 |
| `summary` | 1.0 |
| `details` | 0.5 |

**注入格式**：

```
=== Team Memory (3 entries) ===
[alice@2026-05-03] JWT refresh token gotcha
Tags: auth, security, tokens
Summary: Always rotate refresh tokens on use...
Details: The old refresh token flow allowed reuse...
---
```

### 2.3 Verifier-Judge (质量门控)

**职责**：知识入库前裁判，deterministic JSONL processor。

**拒绝规则**：safety=fail OR importance<2 OR relevance<2

---

## 3. SessionStart 注入架构（gstack 模式）

参考 gstack"30 秒安装"模式，CLAUDE.md 注入机制：

```
GitHub repo → ~/.claude/skills/myteambrain/ → symlink → CLAUDE.md → Claude Code
```

---

## 4. 验收标准

| 组件 | 标准 |
|------|------|
| Stop hook | 6 字段完整，session 去重，PII scrubbing |
| SessionStart | 2s 内完成，BM25 评分，topK 注入，minScore 过滤 |
| Verifier-Judge | deterministic JSONL，rejection rules |

---

## Detail（来源）

- SessionStart SPEC：`docs/features/session-start-hook.md`
- Stop Hook SPEC：`docs/features/stop-hook.md`
- Knowledge Store：`docs/features/knowledge-store.md`
- Verifier-Judge：`docs/features/verifier-judge.md`
- 深度调研：`docs/research/team-ai-memory-research.md`
- gstack 模式研究：`research-gstack.md`
- /query 范围决定：`research-ceoplan.md`
- Git commit：`f7ac297` — feat: add Claude Code hooks for session lifecycle management