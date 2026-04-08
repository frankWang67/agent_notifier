#!/usr/bin/env bash
#
# Claude/Codex CLI 通知系统 - 一键安装脚本
# 幂等设计：重复运行不会重复注入
#

set -euo pipefail

# ── 颜色定义 ─────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ── 安装目录 ─────────────────────────────────────────────
INSTALL_DIR="$(cd "$(dirname "$0")" && pwd)"

info()    { echo -e "${BLUE}[信息]${NC} $1"; }
success() { echo -e "${GREEN}[成功]${NC} $1"; }
warn()    { echo -e "${YELLOW}[警告]${NC} $1"; }
error()   { echo -e "${RED}[错误]${NC} $1"; }

# ── 1. 检查依赖 ──────────────────────────────────────────
info "正在检查系统依赖..."

missing=0

if ! command -v node &>/dev/null; then
    error "未找到 node，请先安装 Node.js (https://nodejs.org/)"
    missing=1
else
    success "node $(node --version)"
fi

if ! command -v npm &>/dev/null; then
    error "未找到 npm，请先安装 Node.js (https://nodejs.org/)"
    missing=1
else
    success "npm $(npm --version)"
fi

if ! command -v python3 &>/dev/null; then
    error "未找到 python3，请先安装 Python 3"
    missing=1
else
    success "python3 $(python3 --version 2>&1 | awk '{print $2}')"
fi

if [ "$missing" -eq 1 ]; then
    error "缺少必要依赖，请安装后重新运行此脚本"
    exit 1
fi

echo ""

# ── 2. 安装 npm 依赖 ─────────────────────────────────────
info "正在安装 npm 依赖..."
cd "$INSTALL_DIR"
npm install --no-fund --no-audit 2>&1 | tail -1
success "npm 依赖安装完成"
echo ""

# ── 3. 配置 .env ─────────────────────────────────────────
if [ ! -f "$INSTALL_DIR/.env" ]; then
    cp "$INSTALL_DIR/.env.example" "$INSTALL_DIR/.env"
    warn ".env 文件已从模板创建，请编辑填入实际配置："
    warn "  $INSTALL_DIR/.env"
    echo ""
else
    success ".env 文件已存在，跳过"
    echo ""
fi

# ── 4. 配置 Claude Code Hooks ────────────────────────────
info "正在配置 Claude Code Hooks..."

SETTINGS_FILE="$HOME/.claude/settings.json"

# 确保 ~/.claude 目录存在
mkdir -p "$HOME/.claude"

# 如果 settings.json 不存在则创建空 JSON
if [ ! -f "$SETTINGS_FILE" ]; then
    echo '{}' > "$SETTINGS_FILE"
    info "已创建 $SETTINGS_FILE"
fi

# 用 node 内联脚本合并 hooks 配置（幂等：已有相同 hook 则跳过）
node -e "
const fs = require('fs');
const settingsPath = '$SETTINGS_FILE';
const installDir = '$INSTALL_DIR';
const hookCommand = 'node ' + installDir + '/hook-handler.js';
const liveCommand = 'node ' + installDir + '/live-handler.js';
const askCommand = 'node ' + installDir + '/ask-handler.js';

let settings;
try {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
} catch (e) {
    settings = {};
}

if (!settings.hooks) settings.hooks = {};

const hooksConfig = {
    'Stop': [
        {
            hooks: [{ type: 'command', command: hookCommand }]
        }
    ],
    'Notification': [
        {
            matcher: 'permission_prompt|idle_prompt|elicitation_dialog',
            hooks: [{ type: 'command', command: hookCommand }]
        }
    ],
    'StopFailure': [
        {
            hooks: [{ type: 'command', command: hookCommand }]
        }
    ],
    'PostToolUse': [
        {
            matcher: 'Bash|Write|Edit|NotebookEdit',
            hooks: [{ type: 'command', command: liveCommand }]
        }
    ],
    'PreToolUse': [
        {
            matcher: 'AskUserQuestion',
            hooks: [{ type: 'command', command: askCommand }]
        }
    ]
};

let changed = false;

for (const [event, newRules] of Object.entries(hooksConfig)) {
    if (!settings.hooks[event]) {
        settings.hooks[event] = newRules;
        changed = true;
        console.log('  + 添加 Hook: ' + event);
        continue;
    }

    // 检查是否已有相同 command 的 hook
    const existing = settings.hooks[event];
    const targetCmd = event === 'PostToolUse' ? liveCommand : event === 'PreToolUse' ? askCommand : hookCommand;
    const hasHook = existing.some(rule =>
        rule.hooks && rule.hooks.some(h => h.command === targetCmd)
    );

    if (!hasHook) {
        // 追加到已有的 hook 列表
        settings.hooks[event].push(...newRules);
        changed = true;
        console.log('  + 添加 Hook: ' + event);
    } else {
        console.log('  - 跳过 Hook: ' + event + '（已存在）');
    }
}

if (changed) {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
}
"

success "Claude Code Hooks 配置完成"
echo ""

# ── 5. 注入 shell 函数 ───────────────────────────────────
info "正在配置 shell 函数..."

# 确定 shell 配置文件
if [ -n "${ZSH_VERSION:-}" ] || [ -f "$HOME/.zshrc" ]; then
    SHELL_RC="$HOME/.zshrc"
elif [ -f "$HOME/.bashrc" ]; then
    SHELL_RC="$HOME/.bashrc"
else
    SHELL_RC="$HOME/.bashrc"
fi

# claude()/codex() 函数内容
AGENT_FUNCS=$(cat <<'EOF'
# ── Claude Code PTY 中继（由 claude-notifier 安装脚本注入） ──
claude() {
    if [[ -z "$TMUX" && -z "$PTY_RELAY_ACTIVE" ]]; then
        PTY_RELAY_ACTIVE=1 python3 __INSTALL_DIR__/pty-relay.py $(which claude) "$@"
    else
        command claude "$@"
    fi
}
# ── Claude Code PTY 中继结束 ──

# ── Codex CLI PTY 中继（由 claude-notifier 安装脚本注入） ──
codex() {
    local CODEX_BIN_CMD="${CODEX_BIN:-codex}"
    if [[ -z "$TMUX" && -z "$PTY_RELAY_ACTIVE" ]]; then
        PTY_RELAY_ACTIVE=1 python3 __INSTALL_DIR__/pty-relay.py "$CODEX_BIN_CMD" "$@"
    else
        command "$CODEX_BIN_CMD" "$@"
    fi
}
# ── Codex CLI PTY 中继结束 ──
EOF
)
AGENT_FUNCS=${AGENT_FUNCS//__INSTALL_DIR__/$INSTALL_DIR}

# 幂等检查：只在不存在时注入
if grep -q "Claude Code PTY 中继" "$SHELL_RC" 2>/dev/null && grep -q "Codex CLI PTY 中继" "$SHELL_RC" 2>/dev/null; then
    success "shell 函数已存在于 $SHELL_RC，跳过"
else
    echo "" >> "$SHELL_RC"
    echo "$AGENT_FUNCS" >> "$SHELL_RC"
    success "已将 claude()/codex() 函数注入 $SHELL_RC"
    warn "请运行 source $SHELL_RC 或重新打开终端使其生效"
fi

echo ""

# ── 6. 询问是否启动飞书监听器 ────────────────────────────
if [ -f "$INSTALL_DIR/.env" ]; then
    # 检查 .env 中是否配置了有效的 FEISHU_APP_ID
    FEISHU_APP_ID=$(grep -E '^FEISHU_APP_ID=' "$INSTALL_DIR/.env" 2>/dev/null | cut -d= -f2 | tr -d '[:space:]')
    if [ -n "$FEISHU_APP_ID" ] && [ "$FEISHU_APP_ID" != "your_app_id_here" ]; then
        echo ""
        read -rp "$(echo -e "${BLUE}[询问]${NC}") 检测到飞书应用配置，是否启动飞书监听器？(y/N) " start_feishu
        if [[ "$start_feishu" =~ ^[Yy]$ ]]; then
            info "正在启动飞书监听器..."
            cd "$INSTALL_DIR"
            npm run feishu-listener:start
            success "飞书监听器已在后台启动"
        else
            info "跳过启动飞书监听器，稍后可通过以下命令手动启动："
            echo "  cd $INSTALL_DIR && npm run feishu-listener:start"
        fi
    fi
fi

echo ""

# ── 7. 完成信息 ──────────────────────────────────────────
echo -e "${GREEN}════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Claude/Codex CLI 通知系统安装完成！${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════════${NC}"
echo ""
info "安装目录: $INSTALL_DIR"
info "配置文件: $INSTALL_DIR/.env"
info "Hooks 配置: $SETTINGS_FILE"
info "Shell 函数: $SHELL_RC"
echo ""
info "后续步骤："
echo "  1. 编辑 .env 填入飞书配置"
echo "  2. 运行 source $SHELL_RC 加载 shell 函数"
echo "  3. 启动飞书监听器: cd $INSTALL_DIR && npm run feishu-listener:start"
echo "  4. 使用 codex() 包装函数时，可通过 CODEX_BIN 指定可执行名"
echo ""
success "祝使用愉快！"
