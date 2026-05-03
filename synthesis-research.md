<!--
    ███████╗██╗  ██╗ █████╗  ██████╗██╗  ██╗    ███╗   ███╗ ██████╗ ███╗   ██╗██╗   ██╗
    ██╔════╝██║  ██║██╔══██╗██╔════╝██║ ██╔╝    ████╗ ████║██╔═══██╗████╗  ██║██║   ██║
    ███████╗███████║███████║██║     █████╔╝     ██╔████╔██║██║   ██║██╔██╗ ██║██║   ██║
    ╚════██║██╔══██║██╔══██║██║     ██╔═██╗     ██║╚██╔╝██║██║   ██║██║╚██╗██║██║   ██║
    ███████║██║  ██║██║  ██║╚██████╗██║  ██╗    ██║ ╚═╝ ██║╚██████╔╝██║ ╚████║╚██████╔╝
    ╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝    ╚═╝     ╚═╝ ╚═════╝ ╚═╝  ╚═══╝ ╚═════╝
    research → plan → synthesize → report
    Research Synthesis — MyTeamBrain
-->

# Research Synthesis — MyTeamBrain

**索引（一句话）**：团队 AI 记忆系统 MVP 技术路径已验证，Stop Hook + SessionStart Hook + Verifier-Judge 三段架构完整，/query 命令决定推迟。

---

## Summary

| 来源 | 结论 |
|------|------|
| **gstack research** | SessionStart BM25 评分 + Stop Hook 三段架构技术可行 |
| **CEO_PLAN** | MVP 2 天跑通，Week 4 根据 dogfood 反馈决定产品化 |
| **Hooks 验证** | stop-hook.js + session-start-hook.js 均已实现并注册 |
| **/query 命令** | 推迟决策，MVP 阶段先验证核心价值再决定 UI |

---

## 1. gstack Pattern Insights

### SessionStart Hook 架构
- **BM25 relevance scoring** (k1=1.5, b=0.75) 作为默认
- **Keyword fallback** 当 corpus < 50 docs 时触发
- **输入**：cwd、branch、recent commits
- **输出**：top-k 记忆条目，格式含 topic/tags/summary/details
- **Idempotency**：Set + session state file 防重复注入

### Knowledge Store 架构
- **Append-only JSONL**：每行一个知识条目，含 id/timestamp/author/session_id/content/tags/importance
- **原子写入**：tmp file + rename 防止数据损坏
- **Git sync**：启动 pull，写入后 push 到 gitee + github

### Verifier-Judge Quality Gate
- **确定性评分**：importance/relevance/novelty 三个维度（1-5）
- **Safety check**：PII、secrets、harmful content 模式匹配
- **Rejection rules**：safety=fail 或 importance<2 或 relevance<2 → REJECT
- **No LLM**：纯规则引擎，每次输入产生相同 verdict

---

## 2. CEO_PLAN Scope Decision

### 核心判断
| 维度 | 结论 |
|------|------|
| 市场空白 | 真实且大 — 所有现有产品停在个人维度 |
| 技术可行性 | 已验证 — hooks + JSONL + git 路径社区跑通 |
| 竞争窗口 | 现在 — Anthropic 官方无原生方案 |
| 最大风险 | 知识质量控制（垃圾进/垃圾出） |

### 执行路径（三阶段）
```
MVP（2天）：Stop Hook → shared/daily.md → git push → SessionStart 注入
Week 1-2：验证知识质量（verifier-judge 裁判）
Week 3+：扩展外部团队 dogfood
```

### 关键约束
- 先 dogfood 再 productize
- 所有功能开发在 worktree，不直接改 main
- 必须有 verifier-judge 质量门控

---

## 3. Hooks 验证结果

### stop-hook.js
- 读取 `~/.claude/transcripts/current.jsonl` 最新 100 行
- 调用 `claude -p` 提炼，提取关键决策/发现/模式/行动项
- 写入 `~/.myteambrain/knowledge/daily/{date}.md`
- 自动 git push 到 gitee
- Idempotency via session_id dedup

### session-start-hook.js
- 读取 `~/.myteambrain/knowledge/daily/*.md` 最近 7 天文件
- 注入到 `~/.myteambrain/session-context.md`
- 桌面通知 "Knowledge loaded. Type /query to search"
- git pull 拉取远程最新

### 注册配置
```json
{
  "hooks": {
    "SessionStart": {
      "command": "node /path/to/session-start-hook.js",
      "context": "currentWorkingDirectory"
    }
  }
}
```

---

## 4. Key Decisions Made

| Decision | Rationale |
|----------|-----------|
| **JSONL 格式** | Append-only、易解析、git merge 友好 |
| **BM25 + keyword fallback** | 50+ docs 用 BM25，不够时用加权 keyword 交集 |
| **Dual remote (gitee + github)** | HPC/国内走 gitee，全球走 github |
| **Verifier-Judge pre-commit** | 防止垃圾知识入库，确保知识质量 |
| **Session dedup via session_id** | 同一 session 重复运行不产生重复条目 |
| **/query 命令推迟** | MVP 阶段先验证核心价值，CLI query 满足初期需求 |

---

## 5. Open Questions

| Question | Status |
|----------|--------|
| /query 命令 UI 是否需要 | 推迟 — MVP 用 CLI query 验证需求 |
| 向量存储何时引入 | MVP 后（4-8 周）根据 dogfood 反馈决定 |
| HyDE 语义检索 | 完整版功能，MVP 暂不需要 |

---

## 6. File Inventory

```
hooks/
  stop-hook.js              # 已实现
  session-start-hook.js     # 已实现

scripts/
  stop-hook.js              # 同上
  session-start-hook.js     # 同上
  verifier-judge.js         # 已实现（质量门控）
  knowledge-store.js        # 已实现（JSONL 读写）
  git-sync.js               # 已实现（双端同步）
  cli.js                    # CLI 入口
  setup.js                  # 安装脚本

docs/features/
  stop-hook.md              # SPEC
  session-start-hook.md     # SPEC
  knowledge-store.md        # SPEC
  verifier-judge.md         # SPEC

docs/research/
  team-ai-memory-research.md  # 竞品调研
```

---

## 7. 下一步行动

1. **立即**：用 stop-hook 自己跑一轮，验证知识提炼质量
2. **Week 1**：SessionStart hook 注入到真实 session，确认上下文读取
3. **Week 2**：verifier-judge 集成到 pre-commit，验证质量门控效果
4. **Week 3**：扩展到 2-3 人团队 dogfood