'use strict';

function normalizeResponse(response) {
    if (response == null) return {};
    if (typeof response === 'string') {
        return { responseType: 'text', value: response };
    }
    if (typeof response !== 'object') return {};
    return response;
}

function createTerminalInjector({ injectText }) {
    if (typeof injectText !== 'function') {
        throw new TypeError('createTerminalInjector requires injectText');
    }

    async function sendLine(target, value) {
        const text = value == null ? '' : String(value);
        if (text) {
            await injectText(target, text);
        }
        // 需要等文字先渲染到输入框，再发送 Enter 才能触发提交
        await new Promise(r => setTimeout(r, 100));
        return injectText(target, '\r');
    }

    return {
        async deliver(response, target) {
            const normalized = normalizeResponse(response);

            if (normalized.responseType === 'text') {
                return sendLine(target, normalized.value);
            }

            if (normalized.responseType === 'approve') {
                return sendLine(target, 'y');
            }

            if (normalized.responseType === 'reject') {
                return sendLine(target, 'n');
            }

            return null;
        },
    };
}

module.exports = { createTerminalInjector };
