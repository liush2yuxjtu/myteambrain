# MyTeamBrain — MVP

    _   __  ______  ______
   / | / / / / __ \/ ____/
  /  |/ / / / / / / __/
 / /|  / / / /_/ / /___
/_/ |_/ /_/_____/_____/

## 核心原则

**知识无感流动** — 昨天你踩的坑，今天团队里所有人 + 他们的 AI 都自动知道。知识不再需要人主动分享，它实时地、无感地流动在每个人的 Claude Code session 里。

## MVP Pipeline

```
Stop hook → 提炼 → git push → SessionStart 注入
```

用户零操作，知识就到 session 里了。

## 工作流

1. **Session End**: 用户结束 session，`stop-hook.sh` 自动触发
2. **Extract**: `extract-knowledge.js` 将 session 内容提炼为结构化知识
3. **Push**: `push-knowledge.sh` 将结果同步到 `gitee` + `github`
4. **Session Start**: 下次新 session 启动时，`sessionstart-inject.js` 自动注入相关知识

## 组件

| 组件 | 描述 |
|------|------|
| `hooks/stop-hook.sh` | session 结束时自动触发提炼脚本 |
| `hooks/extract-knowledge.js` | 将 session 内容提炼为结构化知识块 |
| `hooks/push-knowledge.sh` | 将提炼结果 git push 到远端 |
| `hooks/sessionstart-inject.js` | 新 session 启动时自动注入知识 |
| `verifier-judge` | 裁判：评估知识质量与相关性 |

## 验证

每次 commit 前必须通过 `verifier-judge` 的质量门控。

---

## 文件索引

- `hooks/` — 所有 hook 脚本
- `docs/` — 文档与研究
- `.claude/` — Claude Code 配置