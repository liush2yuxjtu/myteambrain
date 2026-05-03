#!/usr/bin/env bash
# ==============================================================
#  __  __         __        __    __     __  __  ____  __  __
# |  \/  |__ _ __ \ \  /\  / / /\ \ \   / / / / / __ \/ / / /
# | |\  | / _| '_| \ \/  \/ / /  \ \ \ / / / / / / / / / / / /
# | |_\| \__| |     \  /\  / / /   \ \ V / / / / / / / /_/ / /
# |_|  \_\___|_|     \/  \/  _|    \ \_/ /_/ /_/ /_/\____/_/_/
#
# generate-sandbox.sh - 在 .claude/worktrees/ 下创建新的 git worktree sandbox
# ==============================================================

set -euo pipefail

WORKTREE_BASE="/Users/m1/projects/MyTeamBrain/.claude/worktrees"
REPO_DIR="/Users/m1/projects/MyTeamBrain"
BRANCH_PREFIX="worktree-"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

usage() {
    echo "用法: $0 <sandbox-name>"
    echo ""
    echo "在 .claude/worktrees/ 下创建新的 git worktree sandbox"
    echo ""
    echo "参数:"
    echo "  sandbox-name    沙箱名称（将自动添加 worktree- 前缀）"
    echo ""
    echo "示例:"
    echo "  $0 myfeature    # 创建 worktree-myfeature"
    echo "  $0 demo         # 创建 worktree-demo"
    exit 1
}

error() {
    echo -e "${RED}错误: $1${NC}" >&2
    exit 1
}

info() {
    echo -e "${GREEN}[INFO] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[WARN] $1${NC}"
}

# 检查参数
if [ $# -lt 1 ]; then
    warn "未提供沙箱名称"
    usage
fi

SANDBOX_NAME="$1"
WORKTREE_BRANCH="${BRANCH_PREFIX}${SANDBOX_NAME}"
WORKTREE_PATH="${WORKTREE_BASE}/${WORKTREE_BRANCH}"

# 检查沙箱是否已存在
if [ -d "$WORKTREE_PATH" ]; then
    error "沙箱 '${WORKTREE_BRANCH}' 已存在: $WORKTREE_PATH"
fi

# 检查仓库目录
if [ ! -d "$REPO_DIR" ]; then
    error "仓库目录不存在: $REPO_DIR"
fi

cd "$REPO_DIR" || error "无法进入仓库目录: $REPO_DIR"

# 检查远程分支是否已存在
if ! git rev-parse --verify "refs/remotes/github/${BRANCH_PREFIX}${SANDBOX_NAME}" >/dev/null 2>&1 && \
   ! git rev-parse --verify "refs/heads/${WORKTREE_BRANCH}" >/dev/null 2>&1; then
    warn "分支 '${WORKTREE_BRANCH}' 在远程不存在，将基于 main 创建"
    CREATE_BRANCH=true
else
    CREATE_BRANCH=false
fi

# 创建 worktree
info "正在创建 worktree: ${WORKTREE_BRANCH}"
info "路径: ${WORKTREE_PATH}"

if [ "$CREATE_BRANCH" = true ]; then
    git worktree add -b "$WORKTREE_BRANCH" "$WORKTREE_PATH" main
else
    if git rev-parse --verify "refs/heads/${WORKTREE_BRANCH}" >/dev/null 2>&1; then
        git worktree add "$WORKTREE_PATH" "$WORKTREE_BRANCH"
    else
        git worktree add "$WORKTREE_PATH" "refs/remotes/github/${WORKTREE_BRANCH}"
    fi
fi

# 设置执行权限
chmod +x "$WORKTREE_PATH/.claude" 2>/dev/null || true

# 验证
if [ -d "$WORKTREE_PATH" ]; then
    info "沙箱创建成功!"
    echo ""
    echo "=========================================="
    echo "沙箱名称: ${WORKTREE_BRANCH}"
    echo "路径: ${WORKTREE_PATH}"
    echo "分支: $(git -C "$WORKTREE_PATH" branch --show-current)"
    echo "=========================================="
else
    error "沙箱验证失败: 目录不存在"
fi
