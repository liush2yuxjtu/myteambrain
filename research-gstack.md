# gstack "install in 30 seconds" Research

```
  ___   __  ______  ______
 /   | / / / / __ \/ ____/
/ /| |/ / / / / / / __/
/ ___ / /_/ / /_/ / /___
/_/  |_\____/_____/_____/
```

## 1. gstack 安装模式

### 文件写入位置

| 路径 | 用途 |
|------|------|
| `~/.claude/skills/gstack/` | 主安装目录（克隆的 repo） |
| `~/.gstack/` | 全局状态和配置 |
| `~/.claude/skills/gstack/bin/` | CLI 可执行文件 |
| 项目级 `.claude/` | 项目本地 skill 配置 |
| `CLAUDE.md` | 项目根配置文件 |

### 安装流程
1. 用户粘贴一条命令，克隆单分支 GitHub repo
2. 运行 setup 脚本，创建 symlink 到 `~/.claude/skills/` 指向克隆目录
3. 升级只需 `git pull` 最新 commit

**关键**：`setup --team` 模式会将 `.claude/` 和 `CLAUDE.md` 提交到 repo，队友下次会话时通过自动更新检查（每小时限速）自动获得 gstack。

---

## 2. 会话启动时的即时上下文注入机制

gstack 通过**修改项目根 `CLAUDE.md`** 实现上下文注入：

```markdown
## gstack
Use /browse from gstack for all web browsing. Never use mcp__claude-in-chrome__* tools.
Available skills: /office-hours, /plan-ceo-review, /review, /qa, ...
```

Claude Code 启动时读取项目 `CLAUDE.md`，从而知道：
- 哪些 skill 存在（slash commands）
- 如何路由浏览器请求（`/browse`）

**不是**通过传统的 hook 或 MCP server 实现，而是纯文件注入。

---

## 3. MyTeamBrain SessionStart Hook 推荐方案

### 核心发现
gstack 的"30 秒安装"核心是：
1. **单分支克隆** → 最少文件
2. **symlink 注入** → `~/.claude/skills/` 指向克隆目录
3. **CLAUDE.md 修改** → 路由 skill 给 Claude Code

### 适用于 MyTeamBrain 的模式

```
~/.claude/skills/myteambrain/   ← 项目级 skill symlink 指向
~/.claude/worktrees/demo3/      ← 当前 worktree

SessionStart hook 应：
1. 写 skill 目录到 ~/.claude/skills/myteambrain/
2. 在 CLAUDE.md 中追加 skill routing 段落
3. 用 --team 模式将 .claude/ 提交到 repo
```

**推荐实现**：
- SessionStart hook 读取 `~/.claude/worktrees/demo3/.claude/skills/` 下的 skill
- 追加路由指令到项目 `CLAUDE.md`
- 确保 slash commands (`/browse` 等) 可用

---

## 4. 关键文件位置总结

```
gstack 注入链：
  GitHub repo (单分支克隆)
      ↓
  ~/.claude/skills/gstack/ (安装目录)
      ↓ symlink
  ~/.claude/skills/ (Claude Code 读取)
      ↓
  CLAUDE.md (项目根，Claude Code 启动读取)
      ↓
  Claude Code 获知 skill 路由
```

**验证方法**：`claudefast -p "what skills are available"` 应返回 gstack skills。
