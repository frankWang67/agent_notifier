const test = require('node:test');
const assert = require('node:assert/strict');
const { createFeishuInteractionHandler } = require('../../src/channels/feishu/feishu-interaction-handler');
const { createCodexInputBridge } = require('../../src/adapters/codex/cli-input-bridge');
const { FeishuListener, buildCodexReplyCard } = require('../../src/apps/feishu-listener');

function buildPipeline() {
  const injected = [];
  const bridge = createCodexInputBridge({
    deliver: async (_target, value) => {
      injected.push(value);
      return true;
    },
  });

  const handler = createFeishuInteractionHandler({
    resolveInteraction: async () => ({ sessionId: 'codex_s1', host: 'codex' }),
    onResponse: async (response) => {
      await bridge.send(response, { ptsDevice: '/dev/pts/9' });
    },
  });

  return { handler, injected };
}

test('codex feishu scenario: text input', async () => {
  const { handler, injected } = buildPipeline();

  await handler.handleCardAction({
    action: {
      tag: 'input',
      input_value: 'continue with migration',
      value: { session_state_key: 'k1', action_type: 'text_submit' },
    },
  });

  assert.deepEqual(injected, ['continue with migration', '\r']);
});

test('codex feishu scenario: approval and reject', async () => {
  const { handler, injected } = buildPipeline();

  await handler.handleCardAction({
    action: { value: { session_state_key: 'k2', action_type: 'allow' } },
  });
  await handler.handleCardAction({
    action: { value: { session_state_key: 'k3', action_type: 'deny' } },
  });

  assert.deepEqual(injected, ['y', '\r', 'n', '\r']);
});

test('codex feishu scenario: single select', async () => {
  const { handler, injected } = buildPipeline();

  await handler.handleCardAction({
    action: {
      value: {
        session_state_key: 'k4',
        action_type: 'single_select',
        selected_values: ['option-b'],
      },
    },
  });

  assert.deepEqual(injected, ['option-b', '\r']);
});

test('codex feishu scenario: multi select', async () => {
  const { handler, injected } = buildPipeline();

  await handler.handleCardAction({
    action: {
      value: {
        session_state_key: 'k5',
        action_type: 'submit_multi',
        selected_values: ['1', '3', 'other:custom'],
      },
    },
  });

  assert.deepEqual(injected, ['1 3 other:custom', '\r']);
});

test('codex reply card shows submitted approval response', () => {
  const card = buildCodexReplyCard(
    { responseType: 'approve', value: 'allow' },
    { pts_device: 'fifo:/tmp/agent-notifier-1005/agent-inject-pts110' }
  );

  assert.equal(card.header.template, 'green');
  assert.equal(card.header.title.content, '✅ 已回复 Codex');
  const content = card.elements[0].text.content;
  assert.match(content, /已回复 Codex/);
  assert.match(content, /允许 \(y\)/);
  const footer = card.elements.find((el) => el.tag === 'markdown');
  assert.match(footer.content, /Codex/);
  assert.match(footer.content, /pts110/);
});

test('codex card action returns toast text and sends separate receipt card', async () => {
  const listener = Object.create(FeishuListener.prototype);
  const sentCards = [];
  const notifications = {
    k6: {
      host: 'codex',
      session_id: 'codex_110',
      notification_type: 'codex_auto_prompt',
      pts_device: 'fifo:/tmp/agent-notifier-1005/agent-inject-pts110',
      responses: {},
    },
  };
  listener.state = {
    getNotification: (key) => notifications[key],
    setLastInteractedDevice: () => {},
  };
  listener.codexInputBridge = {
    send: async () => true,
  };
  listener.sendCodexReplyReceipt = async (response, notification) => {
    sentCards.push(buildCodexReplyCard(response, notification));
  };
  listener.unifiedInteractionHandler = createFeishuInteractionHandler({
    resolveInteraction: async (key) => ({
      sessionId: notifications[key].session_id,
      host: notifications[key].host,
    }),
    onResponse: async (response) => {
      await listener.codexInputBridge.send(response, notifications[response.interactionKey].pts_device);
      listener.state.setLastInteractedDevice(notifications[response.interactionKey].pts_device);
    },
  });

  const result = await listener.handleCardAction({
    action: {
      value: {
        session_state_key: 'k6',
        action_type: 'allow',
      },
    },
  });

  assert.equal(result, '已回复：允许 (y)');
  assert.equal(sentCards.length, 1);
  assert.equal(sentCards[0].header.title.content, '✅ 已回复 Codex');
});
