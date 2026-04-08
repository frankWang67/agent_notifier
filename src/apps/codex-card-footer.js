'use strict';

function formatTokenCount(n) {
    if (n == null || !Number.isFinite(Number(n))) return null;
    const value = Number(n);
    if (value >= 1000000) return (value / 1000000).toFixed(1) + 'M';
    if (value >= 1000) return (value / 1000).toFixed(1) + 'k';
    return String(value);
}

function normalizeTokenUsage(tokens) {
    if (!tokens || typeof tokens !== 'object') return null;
    const input = Number.isFinite(Number(tokens.input)) ? Number(tokens.input) : null;
    const cached = Number.isFinite(Number(tokens.cached)) ? Number(tokens.cached) : null;
    const cacheWrite = Number.isFinite(Number(tokens.cacheWrite)) ? Number(tokens.cacheWrite) : null;
    const output = Number.isFinite(Number(tokens.output)) ? Number(tokens.output) : null;
    const total = Number.isFinite(Number(tokens.total)) ? Number(tokens.total) : null;
    if (input == null && cached == null && cacheWrite == null && output == null && total == null) return null;
    return { input, cached, cacheWrite, output, total };
}

function nowText() {
    return new Date().toLocaleString('zh-CN', {
        hour12: false,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
}

function formatDuration(startedAt, endedAt = Date.now()) {
    if (!startedAt) return null;
    const startMs = new Date(startedAt).getTime();
    const endMs = typeof endedAt === 'number' ? endedAt : new Date(endedAt).getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return null;
    const totalSec = Math.floor((endMs - startMs) / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h}h${m}m${s}s`;
    if (m > 0) return `${m}m${s}s`;
    return `${s}s`;
}

function buildCodexFooter({ ptsDevice, projectName, tokens, startedAt = null, endedAt = Date.now(), timestamp = nowText() }) {
    const parts = ['🤖 Codex'];
    if (ptsDevice) parts.push(`🖥 ${String(ptsDevice).replace('/dev/', '')}`);
    if (projectName) parts.push(`📁 ${projectName}`);
    const duration = formatDuration(startedAt, endedAt);
    if (duration) parts.push(`⏱ ${duration}`);
    parts.push(`⏰ ${timestamp}`);

    const normalizedTokens = normalizeTokenUsage(tokens);
    if (normalizedTokens) {
        const tokenParts = [];
        if (normalizedTokens.input != null) tokenParts.push(`输入 ${formatTokenCount(normalizedTokens.input)}`);
        if (normalizedTokens.output != null) tokenParts.push(`输出 ${formatTokenCount(normalizedTokens.output)}`);
        if (normalizedTokens.cached != null) tokenParts.push(`缓存读 ${formatTokenCount(normalizedTokens.cached)}`);
        if (normalizedTokens.cacheWrite != null) tokenParts.push(`缓存写 ${formatTokenCount(normalizedTokens.cacheWrite)}`);
        if (normalizedTokens.total != null) tokenParts.push(`总计 ${formatTokenCount(normalizedTokens.total)}`);
        if (tokenParts.length) parts.push(`📊 ${tokenParts.join(' · ')}`);
    }
    return { tag: 'markdown', content: parts.join('  ·  ') };
}

module.exports = {
    buildCodexFooter,
    formatTokenCount,
    formatDuration,
    normalizeTokenUsage,
    nowText,
};
