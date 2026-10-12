// The documents against the live servers: every tool a ready server lists is named in CAPABILITIES.md,
// so the tool list there cannot fall behind an app silently.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { ready, serverTest, suite } from './suite.js';

const capabilities = readFileSync(new URL('../docs/CAPABILITIES.md', import.meta.url), 'utf8');

for (const name of ready) {
  serverTest(`CAPABILITIES.md lists every ${suite.servers[name].app} tool`, async (t, start) => {
    const { tools } = await start(name);
    const missing = tools.map((tool) => tool.name).filter((tool) => !capabilities.includes(`\`${tool}\``));
    assert.deepEqual(missing, [], `add to docs/CAPABILITIES.md (Tools by app): ${missing.join(', ')}`);
  });
}
