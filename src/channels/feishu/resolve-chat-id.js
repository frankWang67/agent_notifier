'use strict';

async function resolveFeishuChatId({ preferredChatId }) {
    const configured = String(preferredChatId || '').trim();
    if (configured) return configured;
    return '';
}

module.exports = { resolveFeishuChatId };
