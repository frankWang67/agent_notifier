'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');

const {
  getRuntimeDir,
  ptyOutputPath,
  fifoPath,
  codexLiveBufferPath,
  sessionStatePath,
} = require('../../src/lib/runtime-paths');

test('runtime paths are grouped under a per-user runtime directory', () => {
  const runtimeDir = getRuntimeDir();
  assert.equal(path.dirname(ptyOutputPath('7')), runtimeDir);
  assert.equal(path.dirname(fifoPath('7')), runtimeDir);
  assert.equal(path.dirname(codexLiveBufferPath('7')), runtimeDir);
  assert.equal(path.dirname(sessionStatePath()), runtimeDir);
  assert.match(runtimeDir, new RegExp(`${os.tmpdir().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/agent-notifier-`));
});
