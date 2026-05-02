'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function getRuntimeOwnerId() {
    if (typeof process.getuid === 'function') {
        return String(process.getuid());
    }
    const user = os.userInfo?.().username || process.env.USER || process.env.USERNAME || 'unknown';
    return user.replace(/[^A-Za-z0-9_.-]/g, '_');
}

function getRuntimeDir() {
    const configured = String(process.env.AGENT_NOTIFIER_RUNTIME_DIR || '').trim();
    const dir = configured || path.join(os.tmpdir(), `agent-notifier-${getRuntimeOwnerId()}`);
    try {
        fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
        fs.chmodSync(dir, 0o700);
    } catch {}
    return dir;
}

function pathInRuntime(name) {
    return path.join(getRuntimeDir(), name);
}

function ptyOutputPath(ptsNum) {
    return pathInRuntime(`claude-pty-output-${ptsNum}`);
}

function fifoPath(ptsNum) {
    return pathInRuntime(`agent-inject-pts${ptsNum}`);
}

function codexLiveBufferPath(ptsNum) {
    return pathInRuntime(`codex-live-${ptsNum}.jsonl`);
}

function codexSessionWatcherLockPath(ptsNum) {
    return pathInRuntime(`codex-session-watcher-${ptsNum}.lock`);
}

function claudeLiveBufferPath(sessionId) {
    return pathInRuntime(`claude-live-${String(sessionId || 'unknown').slice(0, 8)}.jsonl`);
}

function sessionStatePath() {
    return pathInRuntime('session-state.json');
}

module.exports = {
    getRuntimeDir,
    ptyOutputPath,
    fifoPath,
    codexLiveBufferPath,
    codexSessionWatcherLockPath,
    claudeLiveBufferPath,
    sessionStatePath,
};
