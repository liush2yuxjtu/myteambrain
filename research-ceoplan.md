# Research: /query Command — MUST Have or OUT OF SCOPE

## Decision: /query is OUT OF SCOPE

### 核心结论

`/query` 命令需要用户主动发起搜索请求，违背了 CEO_PLAN 的核心原则——**知识无感流动**，因此不属于 MVP 范畴。

---

## 证据引用

### 1. 产品愿景明确定义「无感」

> "昨天你踩的坑，今天团队里所有人 + 他们的 AI 都自动知道。知识不再需要人来分享、人来学习，它实时地、无感地流动在每个人的 Claude Code session 里。"

关键词：**无感**流动、不需要人主动分享、不需要人主动学习。

### 2. 执行路径是自动流动，非手动查询

> "Stop hook → 提炼 → git push → SessionStart 注入"

整个 pipeline 是**自动触发**的：stop hook 自动运行，知识自动提炼，自动 git push，自动 SessionStart 注入。用户零操作，知识就到 session 里了。

### 3. CEO_PLAN 未提及任何「用户主动查询」机制

在 Detail（原始来源）部分，列出的所有文档和技术都是关于：
- Stop hook 三段架构
- SessionStart 注入
- verifier-judge 裁判
- 无任何「用户需要输入命令来获取知识」的描述

---

## 分析

### /query 命令的问题

| 维度 | /query | CEO_PLAN 愿景 |
|------|--------|---------------|
| 用户动作 | 需要主动打字查询 | 知识自动到达，零操作 |
| 知识获取 | 拉取式（pull） | 推送式（push） |
| 触发方式 | 用户显式指令 | 自动流动 |
| "无感"程度 | 有感（需主动查找） | 无感（session 里直接有） |

`/query` 是**拉取模式**（pull）——用户必须知道：我需要查某个知识，然后主动输入命令。而 CEO_PLAN 的愿景是**推送模式**（push）——知识在用户还没意识到需要之前就已经在 session 里了。

### MVP 范围之外的考量

`/query` 可能是产品成熟后的一个功能，但不是 MVP：

```
当前 MVP（Week 1-2）：
  Stop hook 自动提炼 → git push → SessionStart 注入
  用户做啥？不用做。知识自己来。

未来可能（产品化后）：
  /query 手动搜索团队知识库
  但这违背"无感"原则，是 pull 而非 push
```

---

## 结论

**/query is OUT OF SCOPE** — 它需要用户手动操作，与"无感流动"的核心原则相悖。MVP 阶段专注于实现全自动的知识流动管道，而非提供用户主动查询界面。

如果未来要加 `/query`，也需要重新审视是否与产品愿景一致。