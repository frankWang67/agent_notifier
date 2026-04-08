'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseSessionLine,
  recoverStateFromContent,
} = require('../../src/apps/codex-session-watcher');

test('parseSessionLine tracks turn id from turn_context', () => {
  const result = parseSessionLine(
    JSON.stringify({
      type: 'turn_context',
      payload: { turn_id: 'turn-123' },
    }),
    { turnId: '' }
  );

  assert.equal(result.state.turnId, 'turn-123');
  assert.equal(result.entry, null);
});

test('parseSessionLine tracks turn start time from task_started', () => {
  const result = parseSessionLine(
    JSON.stringify({
      timestamp: '2026-04-07T10:00:00.000Z',
      type: 'event_msg',
      payload: {
        type: 'task_started',
        turn_id: 'turn-123',
      },
    }),
    { turnId: '', turnStartedAt: null }
  );

  assert.equal(result.state.turnId, 'turn-123');
  assert.equal(result.state.turnStartedAt, '2026-04-07T10:00:00.000Z');
  assert.equal(result.entry, null);
});

test('parseSessionLine tracks latest token_count usage', () => {
  const result = parseSessionLine(
    JSON.stringify({
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: {
          last_token_usage: {
            input_tokens: 1234,
            cached_input_tokens: 345,
            output_tokens: 56,
            total_tokens: 1290,
          },
        },
      },
    }),
    { turnId: 'turn-123', tokens: null }
  );

  assert.deepEqual(result.state.tokens, {
    input: 1234,
    cached: 345,
    output: 56,
    total: 1290,
  });
  assert.equal(result.entry, null);
});

test('parseSessionLine emits assistant output_text with current turn id', () => {
  const result = parseSessionLine(
    JSON.stringify({
      type: 'response_item',
      payload: {
        type: 'message',
        role: 'assistant',
        phase: 'commentary',
        content: [
          { type: 'output_text', text: '第一段' },
          { type: 'output_text', text: '第二段' },
        ],
      },
    }),
    {
      turnId: 'turn-abc',
      turnStartedAt: '2026-04-07T10:00:00.000Z',
      tokens: { input: 1234, cached: 345, output: 56, total: 1290 },
    }
  );

  assert.deepEqual(result.entry, {
    text: '第一段\n第二段',
    assistantKey: 'turn-abc',
    phase: 'commentary',
    turnStartedAt: '2026-04-07T10:00:00.000Z',
    tokens: { input: 1234, cached: 345, output: 56, total: 1290 },
  });
});

test('parseSessionLine ignores non assistant response items and event_msg mirror rows', () => {
  const userRow = parseSessionLine(
    JSON.stringify({
      type: 'response_item',
      payload: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: 'hi' }],
      },
    }),
    { turnId: 'turn-abc' }
  );
  assert.equal(userRow.entry, null);

  const mirrorRow = parseSessionLine(
    JSON.stringify({
      type: 'event_msg',
      payload: {
        type: 'agent_message',
        message: '镜像事件',
        phase: 'commentary',
      },
    }),
    { turnId: 'turn-abc' }
  );
  assert.equal(mirrorRow.entry, null);
});

test('recoverStateFromContent restores latest turn id from existing session tail', () => {
  const state = recoverStateFromContent([
    JSON.stringify({ type: 'turn_context', payload: { turn_id: 'turn-old' } }),
    JSON.stringify({ type: 'turn_context', payload: { turn_id: 'turn-new' } }),
  ].join('\n'));

  assert.equal(state.turnId, 'turn-new');
});
