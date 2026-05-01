'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveFeishuChatId } = require('../../src/channels/feishu/resolve-chat-id');

test('resolveFeishuChatId: returns configured chat id directly', async () => {
  const chatId = await resolveFeishuChatId({
    preferredChatId: 'oc_configured',
    larkClient: null,
  });

  assert.equal(chatId, 'oc_configured');
});

test('resolveFeishuChatId: does not guess a chat when config missing', async () => {
  const calls = [];
  const chatId = await resolveFeishuChatId({
    preferredChatId: '',
    larkClient: {
      im: {
        chat: {
          list: async (payload) => {
            calls.push(payload);
            return {
              data: {
                items: [{ chat_id: 'oc_first' }, { chat_id: 'oc_second' }],
              },
            };
          },
        },
      },
    },
  });

  assert.equal(chatId, '');
  assert.equal(calls.length, 0);
});

test('resolveFeishuChatId: returns empty string when no chats found', async () => {
  const chatId = await resolveFeishuChatId({
    preferredChatId: '',
    larkClient: {
      im: { chat: { list: async () => ({ data: { items: [] } }) } },
    },
  });

  assert.equal(chatId, '');
});
