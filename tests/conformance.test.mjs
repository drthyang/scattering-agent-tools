// Every ready server against docs/CONVENTIONS.md. MUST rules fail the test; SHOULD rules are reported
// as diagnostics (node --test prints them), so a server can be brought in line one rule at a time.

import assert from 'node:assert/strict';

import { ready, serverTest, text } from './suite.js';

const NAME = /^[a-z][a-z0-9_]{0,63}$/;
const WRITES = ['output_path', 'outDir', 'out_dir'];

for (const name of ready) {
  serverTest(`${name} follows the tool conventions`, async (t, start) => {
    const { client, tools } = await start(name);
    // SHOULD findings by rule: rule → tool names.
    const must = [], should = new Map();
    if (!tools.length) must.push('the server lists no tools');
    const flag = (rule, id) => should.set(rule, [...(should.get(rule) ?? []), id]);
    if (!client.getInstructions()?.trim()) flag('give server instructions (how the tools fit together)', 'server');
    const names = new Set();
    for (const tool of tools) {
      const id = tool.name;
      if (!NAME.test(id)) must.push(`${id}: names are snake_case, at most 64 characters`);
      if (names.has(id)) must.push(`${id}: listed twice`);
      names.add(id);
      if (!(tool.description?.length >= 40)) must.push(`${id}: the description should say what it does and returns (≥ 40 characters)`);
      if (tool.inputSchema?.type !== 'object') must.push(`${id}: inputSchema is not an object schema`);
      if (!tool.title && !tool.annotations?.title) flag('give each tool a title', id);
      if (tool.annotations?.readOnlyHint === undefined) flag('annotate readOnlyHint', id);
      if (tool.inputSchema?.additionalProperties !== false) flag('refuse unknown arguments (additionalProperties: false)', id);
      const props = Object.keys(tool.inputSchema?.properties ?? {});
      if (props.some((p) => WRITES.includes(p)) && !props.includes('overwrite')) flag('take overwrite where a tool writes files (keep existing files by default)', id);
    }
    // A bad call is a tool error the model can read, not a protocol error.
    const needy = tools.find((tool) => tool.inputSchema?.required?.length);
    if (needy) {
      let r;
      try {
        r = await client.callTool({ name: needy.name, arguments: {} });
      } catch (err) {
        must.push(`${needy.name}: a call without its required arguments threw a protocol error (${err.message}) instead of returning isError`);
      }
      if (r && !r.isError) must.push(`${needy.name}: a call without its required arguments did not fail`);
      if (r?.isError && !(text(r).length > 10)) must.push(`${needy.name}: its error says nothing about what to change`);
    }
    t.diagnostic(`${tools.length} tools`);
    for (const [rule, ids] of should) t.diagnostic(`SHOULD ${rule}: ${ids.length} of ${tools.length} (${ids.slice(0, 4).join(', ')}${ids.length > 4 ? ', …' : ''})`);
    assert.deepEqual(must, [], must.join('\n'));
  });
}
