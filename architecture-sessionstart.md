# SessionStart Context Injection Fix Architecture

```
  ___   __  ______  ______
 /   | / / / / __ \/ ____/
/ /| |/ / / / / / / __/
/ ___ / /_/ / /_/ / /___
/_/  |_\____/_____/_____/

SessionStart Hook 上下文注入修复设计
```

## 1. 问题分析

### 当前实现缺陷

| 问题 | 当前 `session-start-hook.js` | 期望行为 |
|------|----------------------------|----------|
| 上下文注入方式 | 写 `session-context.md` 文件 | 应直接修改 `CLAUDE.md` |
| 知识检索 | 按文件名倒序拼接所有 `.md` | 应 BM25 语义检索 + 评分 |
| 上下文来源 | 仅 `daily/` 目录 | 应跨多个 knowledge layers |
| 注入触发 | 每次启动都触发 | 应检查 `minScore` 阈值 |
| 无 session 感知 | 不考虑当前工作目录上下文 | 应基于当前 project 上下文检索 |

### gstack 成功模式

gstack 通过**修改 `CLAUDE.md`** 实现上下文注入：

```markdown
## gstack
Use /browse from gstack for all web browsing.
Available skills: /office-hours, /plan-ceo-review, ...
```

Claude Code 启动时读取 `CLAUDE.md`，直接获得路由信息。

---

## 2. 修复设计

### 2.1 核心原则

```
SessionStart hook 必须像 gstack 一样：
1. 通过修改 CLAUDE.md 实现真正的上下文注入
2. 而非仅写辅助文件让用户手动引用
3. 上下文内容必须经过 scoring/ranking 过滤
```

### 2.2 双模式注入

`setup.js` 中已定义 `injectVia: "env"` 或 `"file"`：

| 模式 | 实现 | 适用场景 |
|------|------|----------|
| `env` | 写 `/tmp/myteambrain-inject.json`，Claude Code 通过 `CLAUDE.md` 中的 env var 引用 | 临时注入，不修改项目文件 |
| `file` | 直接追加到项目 `CLAUDE.md` | 持久注入，队友共享 |

### 2.3 修复后的 SessionStart Hook 流程

```
SessionStart 触发
      │
      ▼
┌─────────────────────────────────┐
│ 1. Git pull knowledge base      │
│ 2. 解析当前项目上下文           │
│    (从 CLAUDE.md 提取 project)  │
└─────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────┐
│ 3. BM25 检索 (配置: topK=5,    │
│    scorer=bm25, minScore=0.1)   │
│    - 搜索 daily/ 目录          │
│    - 搜索 projects/ 目录        │
│    - 搜索 agents/ 目录          │
└─────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────┐
│ 4. 评分过滤                     │
│    - 丢弃 score < minScore 的项 │
│    - 按 score 降序排列          │
│    - 取 topK 条目               │
└─────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────┐
│ 5. 生成上下文注入块             │
│    ```                          │
│    ## MyTeamBrain Context       │
│    (BM25 检索结果，<200 tokens)  │
│    ```                          │
└─────────────────────────────────┘
      │
      ▼
      ┌──────────────────┐
      │ injectVia=file    │
      │ 追加到 CLAUDE.md   │
      └──────────────────┘
      OR
      ┌──────────────────┐
      │ injectVia=env     │
      │ 写 JSON 到 /tmp/  │
      │ CLAUDE.md 引用 env│
      └──────────────────┘
```

### 2.4 关键文件修改

#### A. `hooks/session-start-hook.js` (核心修改)

```javascript
// 核心新增函数
async function searchKnowledge(query, options = {}) {
  const { topK = 5, minScore = 0.1, scorer = 'bm25' } = options;
  // 1. 构建 BM25 索引 (简化实现)
  // 2. 检索 daily/, projects/, agents/ 目录
  // 3. 返回 { file, score, snippet }
}

async function injectContext() {
  // 1. 读取当前项目 CLAUDE.md 提取 project name
  // 2. searchKnowledge(projectContext, { topK, minScore, scorer })
  // 3. 生成 ## MyTeamBrain Context 块
  // 4. injectVia=file ? appendToCLAUDE() : writeEnvFile()
}
```

#### B. `scripts/setup.js` (配置保持不变)

```javascript
// DEFAULT_CONFIG 已正确定义，只需 hook 实现遵守
const DEFAULT_CONFIG = {
  sessionStart: {
    enabled: true,
    knowledgeDir: "~/.myteambrain/knowledge",
    topK: 5,
    scorer: "bm25",
    injectVia: "env",       // ← hook 应遵守此配置
    injectFile: "/tmp/myteambrain-inject.json",
    minScore: 0.1
  },
  // ...
};
```

### 2.5 CLAUDE.md 注入格式

**env 模式** (当前默认):
```markdown
<!-- auto-injected by MyTeamBrain SessionStart -->
<!-- source: ~/.myteambrain/knowledge -->
<!-- DO NOT EDIT MANUALLY -->
```

**file 模式**:
```markdown
## MyTeamBrain Session Context

### Project: {current_project}
### Retrieved: {timestamp}

**Top Knowledge Snippets:**
1. [score: 0.xx] {snippet}
2. [score: 0.xx] {snippet}
...
```

---

## 3. 实现要点

### 3.1 BM25 简化实现

不需要完整 BM25 库，可用简易 TF-IDF:

```javascript
function simpleScorer(query, document) {
  const queryTerms = query.toLowerCase().split(/\s+/);
  const docTerms = document.toLowerCase().split(/\s+/);
  let score = 0;
  for (const term of queryTerms) {
    const tf = docTerms.filter(t => t === term).length;
    if (tf > 0) score += tf * Math.log(docTerms.length / (tf + 1));
  }
  return score;
}
```

### 3.2 项目上下文提取

```javascript
function getProjectContext() {
  const claudeMdPath = path.join(process.cwd(), 'CLAUDE.md');
  if (!fs.existsSync(claudeMdPath)) return '';
  const content = fs.readFileSync(claudeMdPath, 'utf8');
  // 提取 project name 或主要描述
  const match = content.match(/^#\s+(.+)/m);
  return match ? match[1] : '';
}
```

### 3.3 防止重复注入

```javascript
function removeExistingInjections(claudeMd) {
  return claudeMd
    .replace(/<!-- auto-injected[\s\S]*?-->/g, '')
    .replace(/## MyTeamBrain Session Context[\s\S]*?(?=##\s|$)/g, '');
}
```

---

## 4. 验证方法

```bash
# 1. 启动新 session
# 2. 检查 CLAUDE.md 是否包含 MyTeamBrain Context 块
grep -A 10 "MyTeamBrain Session Context" CLAUDE.md

# 3. 验证检索结果
claudefast -p "what context did MyTeamBrain inject"

# 4. 验证无重复注入 (多次启动 session)
git diff CLAUDE.md  # 应该只有新增，无倍增
```

---

## 5. 风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| CLAUDE.md 被手动修改后覆盖 | 保留手动编辑部分，只注入 `## MyTeamBrain Session Context` 块 |
| 知识库过大检索慢 | 限制 `topK=5` + `minScore=0.1` |
| 隐私: 敏感知识泄露 | `minScore` 阈值过滤低相关性内容 |
| 注入内容过长撑爆 context | 限制注入块 `<200 tokens` |

---

## 6. 下一步

1. **实现**: 重写 `session-start-hook.js` 实现 BM25 检索 + CLAUDE.md 注入
2. **测试**: 在 `demo3` worktree 验证注入效果
3. **配置**: 确认 `setup.js` 的 `injectVia` 行为与 hook 实现一致
4. **文档**: 更新 `docs/` 说明新的上下文注入机制

---

## 7. 参考

- gstack 模式: `research-gstack.md`
- 当前 hook: `hooks/session-start-hook.js`
- 配置定义: `scripts/setup.js`