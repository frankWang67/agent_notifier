'use strict';

const ANSI_PATTERN = /\u001b\[[0-9;]*m/g;
const CSI_PATTERN = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;
const OSC_PATTERN = /\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g;
const ORPHAN_CSI_PATTERN = /(?:^|[\s(])\[[0-9;?]*[ -/]*[@-~]/g;
const APPROVAL_SUFFIX_PATTERN = /\s*\((?:y\/n|yes\/no)\)\s*$/i;
const NUMBERED_OPTION_PATTERN = /^\s*(\d+|[A-Za-z])[.)、]\s*(.+?)\s*$/;
const CHECKBOX_OPTION_PATTERN = /^\s*\[(?: |x|X)\]\s+(.+?)\s*$/;
const TEXT_INPUT_PATTERN = /^(?:enter|provide|type|input|reply with|respond with|share|give)\b/i;
const OPEN_QUESTION_PATTERN = /^(?:how|what|why|which|where|when|who)\b/i;
const COMPLETION_PATTERN = /\b(done|completed|complete|finished|resolved|successful(?:ly)?|all set|updated \d+ files?)\b|(?:已完成|完成了|处理完成|任务完成|执行完成|搞定)/i;
const NOISE_LINE_PATTERN = /^(?:[•\-\s]*working|thinking|pending|loading|please wait|wait|ok|okay|\d+%?)$/i;

function stripTerminalControl(text) {
    if (typeof text !== 'string' || !text) return '';
    return text
        .replace(OSC_PATTERN, '')
        .replace(CSI_PATTERN, '')
        .replace(ORPHAN_CSI_PATTERN, ' ')
        .replace(/\u001b[@-Z\\-_]/g, '')
        .replace(/\r/g, '\n')
        .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
}

function parseNumericToken(value) {
    if (value == null) return null;
    const n = Number.parseInt(String(value).replace(/,/g, ''), 10);
    return Number.isFinite(n) ? n : null;
}

function findTokenValue(text, patterns) {
    for (const pattern of patterns) {
        const m = text.match(pattern);
        if (m && m[1]) {
            const n = parseNumericToken(m[1]);
            if (n != null) return n;
        }
    }
    return null;
}

function normalizeBlock(block) {
    if (typeof block !== 'string') {
        return '';
    }

    const cleaned = block
        .replace(OSC_PATTERN, '')
        .replace(CSI_PATTERN, '')
        .replace(/\u001b[@-Z\\-_]/g, '')
        .replace(ANSI_PATTERN, '')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
    if (!block.includes('\x1b')) return cleaned;

    const screen = renderTerminalScreen(block);
    return screen || cleaned;
}

function renderTerminalScreen(text) {
    const rows = Array.from({ length: 80 }, () => []);
    const WIDE_PLACEHOLDER = Symbol('wide-placeholder');
    let row = 0;
    let col = 0;
    let i = 0;

    function charWidth(ch) {
        const cp = ch.codePointAt(0);
        if (!cp) return 0;
        if (cp >= 0x0300 && cp <= 0x036f) return 0;
        if (
            (cp >= 0x1100 && cp <= 0x115f) ||
            (cp >= 0x2329 && cp <= 0x232a) ||
            (cp >= 0x2e80 && cp <= 0xa4cf) ||
            (cp >= 0xac00 && cp <= 0xd7a3) ||
            (cp >= 0xf900 && cp <= 0xfaff) ||
            (cp >= 0xfe10 && cp <= 0xfe19) ||
            (cp >= 0xfe30 && cp <= 0xfe6f) ||
            (cp >= 0xff00 && cp <= 0xff60) ||
            (cp >= 0xffe0 && cp <= 0xffe6)
        ) {
            return 2;
        }
        return 1;
    }

    function setCell(ch) {
        if (row < 0 || row >= rows.length || col < 0) return;
        rows[row][col] = ch;
        const width = charWidth(ch);
        if (width > 1) {
            rows[row][col + 1] = WIDE_PLACEHOLDER;
        }
        col += Math.max(width, 1);
    }

    while (i < text.length) {
        const ch = text[i];
        if (ch === '\x1b') {
            if (text[i + 1] === '[') {
                const match = text.slice(i).match(/^\x1b\[([0-9;?]*)([ -/]*)([@-~])/);
                if (match) {
                    const params = match[1].replace(/^\?/, '').split(';').filter(Boolean).map((n) => parseInt(n, 10));
                    const final = match[3];
                    if (final === 'H' || final === 'f') {
                        row = Math.max(0, (params[0] || 1) - 1);
                        col = Math.max(0, (params[1] || 1) - 1);
                    } else if (final === 'G') {
                        col = Math.max(0, (params[0] || 1) - 1);
                    } else if (final === 'A') {
                        row = Math.max(0, row - (params[0] || 1));
                    } else if (final === 'B') {
                        row = Math.min(rows.length - 1, row + (params[0] || 1));
                    } else if (final === 'C') {
                        col += params[0] || 1;
                    } else if (final === 'D') {
                        col = Math.max(0, col - (params[0] || 1));
                    } else if (final === 'K') {
                        rows[row] = rows[row].slice(0, col);
                    } else if (final === 'J' && (params[0] || 0) === 2) {
                        for (let r = 0; r < rows.length; r += 1) rows[r] = [];
                        row = 0;
                        col = 0;
                    }
                    i += match[0].length;
                    continue;
                }
            }
            if (text[i + 1] === ']') {
                const endBell = text.indexOf('\x07', i + 2);
                const endSt = text.indexOf('\x1b\\', i + 2);
                const ends = [endBell, endSt].filter((n) => n >= 0);
                if (ends.length) {
                    i = Math.min(...ends) + (Math.min(...ends) === endSt ? 2 : 1);
                    continue;
                }
            }
            i += 1;
            continue;
        }
        if (ch === '\r') {
            col = 0;
        } else if (ch === '\n') {
            row = Math.min(rows.length - 1, row + 1);
            col = 0;
        } else if (ch.codePointAt(0) >= 0x20) {
            setCell(ch);
        }
        i += ch.length;
    }

    return rows
        .map((cells) => {
            const lastIdx = cells.reduce((last, cell, index) => (
                cell !== undefined && cell !== WIDE_PLACEHOLDER ? index : last
            ), -1);
            if (lastIdx < 0) return '';
            let line = '';
            for (let idx = 0; idx <= lastIdx; idx += 1) {
                if (cells[idx] === WIDE_PLACEHOLDER) continue;
                line += cells[idx] === undefined ? ' ' : cells[idx];
            }
            return line.trimEnd();
        })
        .filter((line) => line.trim())
        .join('\n');
}

function splitLines(text) {
    return text
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
}

function extractQuestion(line) {
    if (!line) {
        return undefined;
    }

    return line.replace(APPROVAL_SUFFIX_PATTERN, '').trim();
}

function parseNumberedOptions(lines) {
    const options = [];

    for (const line of lines) {
        const match = line.match(NUMBERED_OPTION_PATTERN);
        if (!match) {
            return [];
        }

        options.push({
            label: match[2].trim(),
            value: match[1],
        });
    }

    return options;
}

function parseCheckboxOptions(lines) {
    const options = [];

    for (const line of lines) {
        const match = line.match(CHECKBOX_OPTION_PATTERN);
        if (!match) {
            return [];
        }

        const label = match[1].trim();
        options.push({
            label,
            value: label,
        });
    }

    return options;
}

function isConfirmOptions(options) {
    if (options.length !== 2) {
        return false;
    }

    const labels = options.map((option) => option.label.toLowerCase());
    return labels.includes('yes') && labels.includes('no');
}

function parseOutputBlock(block) {
    const rawCodexApproval = parseRawCodexApproval(block);
    if (rawCodexApproval) return rawCodexApproval;

    const text = normalizeBlock(block);
    const trimmed = text.trim();

    if (!trimmed) {
        return { kind: 'none', confidence: 'low', rawBlock: block };
    }

    const lines = splitLines(trimmed);
    const codexApproval = parseCodexApprovalScreen(lines, block);
    if (codexApproval) return codexApproval;

    const question = extractQuestion(lines[0]);
    const remainingLines = lines.slice(1);

    if (remainingLines.length >= 2) {
        const checkboxOptions = parseCheckboxOptions(remainingLines);
        if (checkboxOptions.length === remainingLines.length) {
            return {
                kind: 'multi_select',
                confidence: 'high',
                question,
                options: checkboxOptions,
                allowFreeText: false,
                rawBlock: block,
            };
        }

        const numberedOptions = parseNumberedOptions(remainingLines);
        if (numberedOptions.length === remainingLines.length) {
            return {
                kind: isConfirmOptions(numberedOptions) ? 'confirm' : 'single_select',
                confidence: 'high',
                question,
                options: numberedOptions,
                rawBlock: block,
            };
        }
    }

    if (APPROVAL_SUFFIX_PATTERN.test(lines[0])) {
        return {
            kind: 'approval',
            confidence: 'high',
            question,
            rawBlock: block,
        };
    }

    if (TEXT_INPUT_PATTERN.test(lines[0])) {
        return {
            kind: 'text_input',
            confidence: 'medium',
            question: lines[0],
            rawBlock: block,
        };
    }

    if (lines.length === 1 && OPEN_QUESTION_PATTERN.test(lines[0]) && /[?]$/.test(lines[0])) {
        return {
            kind: 'open_question',
            confidence: 'medium',
            question: lines[0],
            rawBlock: block,
        };
    }

    return { kind: 'none', confidence: 'low', rawBlock: block };
}

function parseRawCodexApproval(block) {
    if (typeof block !== 'string' || !block.includes('\x1b')) return null;
    const screen = renderTerminalScreen(block);
    if (!screen) return null;
    if (!/would you like to run the following command\?/i.test(screen)) return null;
    if (!/yes,\s*proceed/i.test(screen)) return null;
    if (!/press enter to confirm/i.test(screen)) return null;

    const cleaned = screen;
    const start = cleaned.search(/would you like to run the following command\?/i);
    const end = cleaned.search(/press enter to confirm/i);
    const rawQuestion = (start >= 0
        ? cleaned.slice(start, end > start ? end : start + 2000)
        : screen || 'Codex is requesting approval.');
    const question = rawQuestion
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => line.replace(/^[$]\s*/, '$ '))
        .slice(0, 16)
        .join('\n');

    return {
        kind: 'approval',
        confidence: 'high',
        question: question || 'Codex is requesting approval.',
        rawBlock: block,
    };
}

function parseCodexApprovalScreen(lines, rawBlock) {
    if (!Array.isArray(lines) || !lines.length) return null;
    const joined = lines.join('\n');

    let questionIdx = lines.findLastIndex((line) =>
        /would you like to run the following command\?/i.test(line) ||
        /would you like to proceed\?/i.test(line)
    );
    const relevant = questionIdx >= 0 ? lines.slice(questionIdx) : lines;
    const relevantText = relevant.join('\n');
    const hasYesProceed = /(?:^|[\s›>])1[.)、]\s*yes,\s*proceed\b/i.test(relevantText);
    const hasNoOption = /(?:^|\s)3[.)、]\s*no,\s*and\b/i.test(relevantText) || /(?:^|\s)2[.)、]\s*no\b/i.test(relevantText);
    const hasConfirmHint = /press enter to confirm/i.test(relevantText);
    if (!hasYesProceed || !hasNoOption || !hasConfirmHint) return null;
    if (questionIdx < 0) questionIdx = 0;

    const detailLines = [];
    let inCommand = false;
    for (const line of relevant.slice(1)) {
        if (/^\s*\d+[.)、]\s*/.test(line)) break;
        if (/^reason:\s*/i.test(line)) {
            detailLines.push(line);
            continue;
        }
        if (line === '$' || line.startsWith('$')) {
            inCommand = true;
            detailLines.push(line);
            continue;
        }
        if (inCommand || detailLines.length) {
            detailLines.push(line);
        }
    }

    const question = [lines[questionIdx] || joined, ...detailLines]
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    return {
        kind: 'approval',
        confidence: 'high',
        question,
        rawBlock,
    };
}

function parseExecutionSummary(block) {
    if (typeof block !== 'string' || !block.trim()) {
        return null;
    }

    const cleaned = stripTerminalControl(block);
    if (!cleaned.trim()) return null;

    const lines = cleaned
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
    if (!lines.length) return null;

    const joined = lines.join('\n');
    const cwdMatch = joined.match(/(?:cwd|current(?:\s+working)?\s+directory|working\s+directory|当前目录|工作目录)\s*[:=：]\s*(.+)$/im);
    const cwd = cwdMatch?.[1]?.trim() || null;

    const input = findTokenValue(joined, [
        /\binput(?:\s+tokens?)?\s*[:=]\s*([0-9][0-9,]*)\b/i,
        /\bprompt(?:\s+tokens?)?\s*[:=]\s*([0-9][0-9,]*)\b/i,
        /输入\s*tokens?\s*[:=：]\s*([0-9][0-9,]*)/i,
    ]);
    const output = findTokenValue(joined, [
        /\boutput(?:\s+tokens?)?\s*[:=]\s*([0-9][0-9,]*)\b/i,
        /\bcompletion(?:\s+tokens?)?\s*[:=]\s*([0-9][0-9,]*)\b/i,
        /输出\s*tokens?\s*[:=：]\s*([0-9][0-9,]*)/i,
    ]);
    let total = findTokenValue(joined, [
        /\btotal(?:\s+tokens?)?\s*[:=]\s*([0-9][0-9,]*)\b/i,
        /\btokens?\s+used\s*[:=]\s*([0-9][0-9,]*)\b/i,
        /总\s*tokens?\s*[:=：]\s*([0-9][0-9,]*)/i,
        /总计\s*tokens?\s*[:=：]\s*([0-9][0-9,]*)/i,
    ]);
    if (total == null && input != null && output != null) {
        total = input + output;
    }

    const summaryLines = lines.filter((line) => {
        const lower = line.toLowerCase();
        if (/^(cwd|current(?:\s+working)?\s+directory|working\s+directory|当前目录|工作目录)\s*[:=：]/i.test(line)) return false;
        if (/\b(input|output|total|prompt|completion)\s+tokens?\s*[:=]/i.test(line)) return false;
        if (/\btokens?\s+used\s*[:=]/i.test(line)) return false;
        if (/^(输入|输出|总|总计)\s*tokens?\s*[:=：]/i.test(line)) return false;
        if (/^(yes|no|y|n)$/i.test(lower)) return false;
        if (/^\[[0-9;?]*[ -/]*[@-~]$/.test(line)) return false;
        if (/^[\d\s.,:;!?`~@#$%^&*()_+\-=[\]{}|\\/<>]+$/.test(line)) return false;
        if (NOISE_LINE_PATTERN.test(lower)) return false;
        return true;
    });
    const summary = summaryLines.join('\n');

    const hasTokenData = input != null || output != null || total != null;
    const looksComplete = COMPLETION_PATTERN.test(joined);
    const hasMeaningfulText = summaryLines.some((line) => /[A-Za-z0-9\u4e00-\u9fff]/.test(line));
    if (!hasTokenData && !looksComplete && !hasMeaningfulText) {
        return null;
    }

    const tokens = {};
    if (input != null) tokens.input = input;
    if (output != null) tokens.output = output;
    if (total != null) tokens.total = total;

    return {
        summary,
        cwd,
        tokens,
    };
}

module.exports = { parseOutputBlock, parseExecutionSummary };
