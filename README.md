# Claude / Codex CLI 飞书通知助手

把 Claude Code 和 Codex CLI 的完成通知、报错、权限确认、方案选择、文本输入等交互，同步到飞书卡片，并支持直接从手机回流到本地终端。

> 当前支持：`Claude Hooks` + `Codex CLI`。不包含 `codex_app` 云端任务模式。

---

## 它能做什么

这个项目主要解决两个问题：

1. **你不用一直盯着终端**
   - Claude / Codex 任务完成、报错、等待你确认时，会主动发飞书卡片
2. **你可以直接在手机上继续操作**
   - 点按钮、选方案、输入文本，都能回流到本地终端

典型场景：
- Claude 申请执行命令，需要你批准
- AskUserQuestion 弹出单选 / 多选方案
- Codex CLI 在执行过程中需要审批或继续输入
- 任务完成后，你想直接在飞书里接一句“继续改这里”

---

## 功能概览

### 通知能力
- 飞书交互式卡片通知
- 任务完成 / 失败通知
- 权限确认、方案选择、文本输入卡片
- Claude / Codex 实时执行摘要卡片
- 会话时长与 Token 统计
- 本地语音提醒

### 交互能力
- 按钮点击回流到终端
- 文本输入回流到终端
- 多终端并行路由
- Claude 与 Codex 共用一套飞书交互入口

### 当前支持的卡片场景

| 场景 | 卡片颜色 | 说明 |
|------|---------|------|
| 权限确认 | 🟠 橙色 | 允许 / 本次会话允许 / 拒绝 + 输入框 |
| AskUserQuestion 单选 | 🟠 橙色 | 动态选项按钮 + Other + 输入框 |
| AskUserQuestion 多题 | 🟠 橙色 | Q1 → Q2 → Q3 逐张发送 |
| 任务完成 | 🟢 绿色 | 摘要、时长、Token + 输入框 |
| 异常退出 | 🔴 红色 | 错误详情 + 输入框 |
| 实时执行摘要 | 🔵 蓝色 | 同一任务原地 patch 更新 |

---

## 效果说明

后续你可以在这里补几张飞书手机截图，建议放这些：

1. 权限确认卡
2. AskUserQuestion 选项卡
3. Codex 实时执行卡
4. 任务完成卡（带输入框）

可以在这里补一个章节：

```md
## 界面截图

### 权限确认
![权限确认](./docs/screenshots/permission-card.png)

### 任务完成
![任务完成](./docs/screenshots/stop-card.png)
```

---

## 快速开始

### 1. 克隆仓库

```bash
git clone <repo-url>
cd claude-notifier
```

### 2. 一键安装

```bash
bash install.sh
```

安装脚本会自动完成：
- 安装 Node.js 依赖
- 从 `.env.example` 创建 `.env`
- 写入 Claude Code hooks 到 `~/.claude/settings.json`
- 注入 `claude` / `codex` shell 包装函数

### 3. 配置飞书应用

编辑 `.env`：

```bash
FEISHU_APP_ID=your_app_id_here
FEISHU_APP_SECRET=your_app_secret_here
# FEISHU_CHAT_ID=
```

### 4. 启动飞书监听器

```bash
npm run feishu-listener:start
```

### 5. 重新加载 shell

```bash
source ~/.zshrc
# 或 source ~/.bashrc
```

### 6. 开始使用

```bash
claude
# 或
codex
```

---

## 安装后你会得到什么

安装完成后，系统会自动接管两类入口：

### Claude
- 通过 Claude Hooks 捕获 `Stop / Notification / StopFailure / PostToolUse`
- 自动发送飞书卡片

### Codex
- 通过 `pty-relay.py` 建立终端桥接
- 支持输入回流、交互卡、实时摘要

如果你平时不在 tmux 里跑，也可以正常使用。

---

## 配置说明

### `.env` 示例

```bash
# 飞书自建应用
FEISHU_APP_ID=your_app_id_here
FEISHU_APP_SECRET=your_app_secret_here
# FEISHU_CHAT_ID=

# 默认宿主（可选）
# DEFAULT_AGENT_HOST=claude
# CODEX_BIN=codex

# 显式指定 tmux pane（可选）
# CLAUDE_TMUX_TARGET=claude:0.0

# 实时摘要（可选）
# FEISHU_LIVE_CAPTURE=1
# FEISHU_LIVE_DEBOUNCE_MS=3000

NOTIFICATION_ENABLED=true
# NOTIFICATION_EXPIRE_HOURS=12
# ENABLE_ESC_BUTTON=true
SOUND_ENABLED=true
```

### `FEISHU_LIVE_CAPTURE` 的含义

可选值：
- `1` / `true`：全部开启
- `tools`：工具 / 命令摘要
- `output`：助手输出内容
- `results`：工具执行结果摘要
- 也可以组合：`tools,output,results`

Codex 的输出来自 `~/.codex/sessions/*.jsonl`，不是靠终端文本猜测。

---

## 飞书配置步骤

### 1. 创建自建应用
登录 [飞书开放平台](https://open.feishu.cn)，创建企业自建应用。

### 2. 获取 App ID / App Secret
在应用后台复制凭证，填入 `.env`。

### 3. 开启机器人能力
在应用能力里启用机器人。

### 4. 事件订阅选择长连接
不需要公网 IP 或域名。

### 5. 添加事件
- `card.action.trigger`

### 6. 申请权限
- `im:message`
- `im:message:send_as_bot`
- `im:chat:readonly`

### 7. 发布应用版本
发布后把机器人加入目标群。

---

## Hook 配置

如果你使用 `install.sh`，这一步通常不需要手动做。

写入到 `~/.claude/settings.json` 的核心配置如下：

```json
{
  "hooks": {
    "Stop": [{ "hooks": [{ "type": "command", "command": "node /path/to/claude-notifier/hook-handler.js" }] }],
    "Notification": [{ "matcher": "permission_prompt|idle_prompt|elicitation_dialog", "hooks": [{ "type": "command", "command": "node /path/to/claude-notifier/hook-handler.js" }] }],
    "StopFailure": [{ "hooks": [{ "type": "command", "command": "node /path/to/claude-notifier/hook-handler.js" }] }],
    "PostToolUse": [{ "matcher": "Bash|Write|Edit|NotebookEdit", "hooks": [{ "type": "command", "command": "node /path/to/claude-notifier/live-handler.js" }] }]
  }
}
```

把 `/path/to/claude-notifier/` 改成你的真实路径即可。

---

## 终端注入方式

飞书输入想要真正送回 Claude / Codex，本项目支持 3 种方式：

### 1. tmux（推荐）

```bash
tmux new-session -s claude
cd /your/project
claude
```

### 2. PTY 代理（非 tmux 环境）

`pty-relay.py` 会在终端与 shell 之间创建 PTY 代理层，通过 FIFO 注入按键，等效于真实键盘输入。

手动运行示例：

```bash
python3 /path/to/claude-notifier/pty-relay.py claude
python3 /path/to/claude-notifier/pty-relay.py codex
```

### 3. 显式指定 tmux pane

```bash
CLAUDE_TMUX_TARGET=claude:0.0
```

### 注入优先级
1. `CLAUDE_TMUX_TARGET`
2. 自动检测 tmux pane
3. FIFO 中继
4. pty master 直写
5. TIOCSTI 备用方案

---

## 常用命令

### 飞书监听器

```bash
npm run feishu-listener
npm run feishu-listener:start
npm run feishu-listener:stop
```

### Codex 相关

```bash
npm run codex-watcher
npm run codex-watcher:start
npm run codex-watcher:stop
```

---

## 验证与联调

### 跑测试

```bash
bun test tests/
python3 -m py_compile pty-relay.py
```

### 发测试卡

```bash
node scripts/send-codex-feishu-test-cards.js --pts /dev/pts/<N>
npm run ask:e2e:card
```

### 建议至少手动验证
- Claude 完成卡发送是否正常
- Codex 文本输入 / 审批 / 单选 / 多选是否都能回流
- Codex live 卡是否同任务 patch、新任务 create
- 长文本是否被正确分块

---

## 架构概览

### Claude 链路
- Claude Hooks 触发事件
- `src/apps/claude-hook.js` 生成卡片
- 飞书监听器接收回调
- 注入回本地终端

### Codex 链路
- `pty-relay.py` 建立终端桥接
- `src/apps/codex-watcher.js` 负责交互卡
- `src/apps/codex-session-watcher.js` 负责读取 session 文件
- `src/apps/codex-live.js` 负责实时摘要卡

---

## 注意事项

- PTY raw mode 下 Enter 是 `\r`，不是 `\n`
- 完成类卡片会带输入框，方便直接续聊
- `im.message.patch` 会丢失输入框，所以完成卡通常新建，执行中卡使用 patch
- 敏感配置放在 `.env`，不要提交

---

## 适合谁用

如果你：
- 经常跑 Claude Code / Codex CLI
- 不想一直盯着终端
- 希望在手机上直接确认、输入、继续对话

那这个项目就是给你用的。

---

## 开发说明

如果你是来二次开发的，优先看：
- `docs/ai_rules.md`
- `docs/ai_docs/README.md`
- `src/apps/claude-hook.js`
- `src/apps/codex-live.js`
- `src/apps/codex-watcher.js`
- `src/channels/feishu/feishu-interaction-handler.js`
