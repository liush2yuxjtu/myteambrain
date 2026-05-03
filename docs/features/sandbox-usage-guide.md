# Sandbox 使用指南 — Dogfeed & Mock-Multi-Users Canary

___
   ___   __  ______  ______
  / / | / / / / __ \/ ____/
 / /  |/ / / / / / / __/
/ / /|  / / / /_/ / /___
/_/ |_|/_/_/\____/_____/

## 1. 概述

Sandbox 是基于 Git Worktree 的隔离开发环境，用于：
- **Dogfeed**：自喂测试，验证功能后再合并
- **Mock-Multi-Users Canary**：模拟多用户并发测试

## 2. 创建沙箱

```bash
# 使用脚本创建（推荐）
./scripts/generate-sandbox.sh <sandbox-name>

# 示例：创建 dogfeed 沙箱
./scripts/generate-sandbox.sh dogfeed-demo

# 示例：创建 canary 测试沙箱
./scripts/generate-sandbox.sh canary-user1
./scripts/generate-sandbox.sh canary-user2
```

## 3. Dogfeed 场景

自喂测试流程：

```bash
# 1. 创建沙箱
./scripts/generate-sandbox.sh feature-xyz

# 2. 进入沙箱
cd .claude/worktrees/worktree-feature-xyz

# 3. 在沙箱中进行实验性开发/测试
# ... 实现功能 ...

# 4. 验证功能正常后，提交代码
git add .
git commit -m "feat: 完成功能 XYZ"

# 5. 推送到远程（双重推送）
git push gitee worktree-feature-xyz   # HPC/国内服务器
git push github worktree-feature-xyz  # 全球备份

# 6. 切换回 main 并清理沙箱（可选）
cd /path/to/main
git worktree remove .claude/worktrees/worktree-feature-xyz --force
```

## 4. Mock-Multi-Users Canary 场景

模拟多用户并发测试：

```bash
# 为每个"用户"创建独立沙箱
./scripts/generate-sandbox.sh canary-alice
./scripts/generate-sandbox.sh canary-bob
./scripts/generate-sandbox.sh canary-charlie

# 每个沙箱可独立修改、独立提交
# 沙箱路径：
#   .claude/worktrees/worktree-canary-alice/
#   .claude/worktrees/worktree-canary-bob/
#   .claude/worktrees/worktree-canary-charlie/

# 查看所有沙箱
git worktree list
```

## 5. 常用命令

| 命令 | 说明 |
|------|------|
| `./scripts/generate-sandbox.sh <name>` | 创建新沙箱 |
| `git worktree list` | 列出所有 worktree |
| `git worktree remove <path> --force` | 删除沙箱 |
| `git push gitee <branch>` | 推送到 Gitee |
| `git push github <branch>` | 推送到 GitHub |

## 6. 最佳实践

1. **命名规范**：使用 `worktree-<场景>-<序号>` 格式
2. **及时清理**：完成测试后删除不需要的沙箱
3. **双重推送**：始终同时推送到 gitee 和 github
4. **隔离开发**：每个功能/用户使用独立沙箱

## 7. 故障排除

| 问题 | 解决方案 |
|------|----------|
| 沙箱已存在 | 使用 `git worktree list` 查看现有沙箱 |
| 分支冲突 | 在 main 分支 `git pull --ff-only` 后重试 |
| 推送失败 | 检查网络连接，确认远程已添加 |
