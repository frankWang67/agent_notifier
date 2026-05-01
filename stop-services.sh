#!/usr/bin/env bash
#
# Claude/Codex CLI notifier - persistent service stop script.
# Stops services started by install.sh without removing hooks, shell functions, or auto-start config.
#

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m'

INSTALL_DIR="$(cd "$(dirname "$0")" && pwd)"

# Prints an informational CLI message.
# Args:
#   $1: message text.
# Return:
#   Writes the message to stdout.
info()    { echo -e "${BLUE}[信息]${NC} $1"; }

# Prints a success CLI message.
# Args:
#   $1: message text.
# Return:
#   Writes the message to stdout.
success() { echo -e "${GREEN}[成功]${NC} $1"; }

# Prints a warning CLI message.
# Args:
#   $1: message text.
# Return:
#   Writes the message to stdout.
warn()    { echo -e "${YELLOW}[警告]${NC} $1"; }

# Prints an error CLI message.
# Args:
#   $1: message text.
# Return:
#   Writes the message to stdout.
error()   { echo -e "${RED}[错误]${NC} $1"; }

FEISHU_PLIST_LABEL="com.agent-notifier.feishu-listener"
FEISHU_PLIST_FILE="$HOME/Library/LaunchAgents/${FEISHU_PLIST_LABEL}.plist"
CODEX_PLIST_LABEL="com.agent-notifier.codex-watcher"
CODEX_PLIST_FILE="$HOME/Library/LaunchAgents/${CODEX_PLIST_LABEL}.plist"
FEISHU_SYSTEMD_SERVICE="agent-notifier-feishu.service"
CODEX_SYSTEMD_SERVICE="agent-notifier-codex-watcher.service"

# Stops a launchd job if the plist exists in the current user's LaunchAgents.
# Args:
#   $1: launchd label.
#   $2: absolute plist path.
# Return:
#   Returns 0 after attempting to stop the job; missing plists are skipped.
stop_launchd_service() {
    local label="$1"
    local plist_file="$2"

    if [ ! -f "$plist_file" ]; then
        info "launchd 服务未安装，跳过: $label"
        return 0
    fi

    if launchctl print "gui/$(id -u)/${label}" &>/dev/null; then
        launchctl bootout "gui/$(id -u)" "$plist_file" 2>/dev/null || true
        success "已停止 launchd 服务: $label"
    else
        info "launchd 服务未运行: $label"
    fi
}

# Stops a user systemd service while preserving its enabled state.
# Args:
#   $1: user systemd service name.
# Return:
#   Returns 0 after attempting to stop the service; unavailable systemd is skipped.
stop_systemd_service() {
    local service_name="$1"

    if ! systemctl --user list-unit-files "$service_name" &>/dev/null; then
        info "systemd 服务未安装，跳过: $service_name"
        return 0
    fi

    if systemctl --user is-active "$service_name" &>/dev/null; then
        systemctl --user stop "$service_name" 2>/dev/null || true
        success "已停止 systemd 服务: $service_name"
    else
        info "systemd 服务未运行: $service_name"
    fi
}

# Stops a nohup-managed process from a PID file created by package scripts.
# Args:
#   $1: PID file path.
#   $2: display name used in CLI output.
# Return:
#   Returns 0 after stopping the process or confirming it is absent.
stop_pid_file_process() {
    local pid_file="$1"
    local display_name="$2"

    if [ ! -f "$pid_file" ]; then
        info "$display_name 未发现 PID 文件，跳过"
        return 0
    fi

    local pid
    pid="$(cat "$pid_file" 2>/dev/null || true)"
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
        kill "$pid" 2>/dev/null || true
        success "已停止 $display_name (PID: $pid)"
    else
        info "$display_name 未在运行"
    fi
    rm -f "$pid_file"
}

# Stops a process that matches this project's exact command path.
# Args:
#   $1: process match pattern.
#   $2: display name used in CLI output.
# Return:
#   Returns 0 whether or not a matching process is found.
stop_matching_process() {
    local pattern="$1"
    local display_name="$2"

    if pkill -f "$pattern" 2>/dev/null; then
        success "已停止 $display_name"
    else
        info "$display_name 未在运行"
    fi
}

echo -e "${YELLOW}════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}  Claude/Codex CLI 通知系统 - 停止服务${NC}"
echo -e "${YELLOW}════════════════════════════════════════════════════════${NC}"
echo ""

if [[ "$OSTYPE" == darwin* ]]; then
    info "正在停止 launchd 常驻服务..."
    stop_launchd_service "$FEISHU_PLIST_LABEL" "$FEISHU_PLIST_FILE"
    stop_launchd_service "$CODEX_PLIST_LABEL" "$CODEX_PLIST_FILE"
else
    export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
    if command -v systemctl &>/dev/null && systemctl --user list-unit-files &>/dev/null 2>&1; then
        info "正在停止 systemd user 常驻服务..."
        stop_systemd_service "$FEISHU_SYSTEMD_SERVICE"
        stop_systemd_service "$CODEX_SYSTEMD_SERVICE"
    else
        info "systemd user 不可用，尝试停止 nohup 后台进程..."
    fi

    stop_pid_file_process "$INSTALL_DIR/feishu-listener.pid" "feishu-listener"
    stop_pid_file_process "$INSTALL_DIR/codex-watcher.pid" "codex-watcher"
    stop_matching_process "node ${INSTALL_DIR}/feishu-listener.js" "feishu-listener 兜底进程"
    stop_matching_process "node ${INSTALL_DIR}/src/apps/codex-watcher.js" "codex-watcher 兜底进程"
fi

echo ""
success "常驻服务已停止。自启动配置仍保留，重启系统或重新运行 install.sh 后会再次启动。"
info "如需彻底卸载并移除 hooks/shell 注入，请运行: bash uninstall.sh"
