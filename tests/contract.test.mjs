// What the plugin promises, against suite.json and the live servers: .mcp.json registers exactly the
// ready servers, through the launcher, and every tool and argument a skill names exists.
//
// A skill names a tool call as `server` `tool {arg, arg: value, a | b}` (the server may be left out when
// the skill names it elsewhere), or `server` `tool`. Arguments are checked against the tool's input schema;
// values are not. A bare `name` not after a server is read as a field or value, and not checked.

import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

import { ready, serverTest, suite } from './suite.js';

const plugin = new URL('../plugin/', import.meta.url);
const SERVERS = new Set(Object.keys(suite.servers));

/** The argument names in `a, b: 1, c | d, e: [1, 2]`. */
export function argNames(body) {
  const parts = [];
  let depth = 0, quote = null, cur = '';
  for (const ch of body) {
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if ('[{('.includes(ch)) {
      depth++;
    } else if (']})'.includes(ch)) {
      depth--;
    } else if (depth === 0 && (ch === ',' || ch === '|')) {
      parts.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  parts.push(cur);
  return parts.map((p) => p.trim()).filter(Boolean).map((p) => p.match(/^([A-Za-z_]\w*)\s*(?::|$)/)?.[1] ?? p);
}

/** The tool calls a skill names: { server?, tool, args, line }. */
export function callsIn(markdown) {
  const md = markdown.replace(/```[\s\S]*?```/g, (block) => block.replace(/[^\n]/g, ' '));
  const spans = [...md.matchAll(/`([^`]+)`/g)].map((m) => ({ code: m[1].replace(/\s+/g, ' ').trim(), start: m.index, end: m.index + m[0].length }));
  const calls = [];
  spans.forEach((span, i) => {
    if (SERVERS.has(span.code)) return;
    const m = span.code.match(/^([a-z][a-z0-9_]*)(?: ?\{(.*)\})?$/);
    if (!m) return;
    const prev = spans[i - 1];
    const server = prev && SERVERS.has(prev.code) && !md.slice(prev.end, span.start).trim() ? prev.code : undefined;
    if (m[2] === undefined && !server) return;
    calls.push({ server, tool: m[1], args: m[2] === undefined ? [] : argNames(m[2]), line: md.slice(0, span.start).split('\n').length });
  });
  return calls;
}

test('.mcp.json registers exactly the ready servers, each through the launcher', () => {
  const { mcpServers } = JSON.parse(readFileSync(new URL('.mcp.json', plugin), 'utf8'));
  assert.deepEqual(Object.keys(mcpServers).sort(), [...ready].sort());
  for (const [name, s] of Object.entries(mcpServers)) {
    assert.equal(s.command, 'node', name);
    assert.deepEqual(s.args, ['${CLAUDE_PLUGIN_ROOT}/bin/launch.mjs', name]);
  }
});

test('the skill notation is read as intended', () => {
  const calls = callsIn('`nexplan` `load_structure {path}`, then `laue_symmetry {structure_id, grid}`; `nexus-viewer`\n`set_symmetry` with `laue_class: x`; `read_points {volume_id, box: 1, a | b, p: [[1,0,0]]}`; a field `cell`.');
  assert.deepEqual(calls.map(({ line, ...c }) => c), [
    { server: 'nexplan', tool: 'load_structure', args: ['path'] },
    { server: undefined, tool: 'laue_symmetry', args: ['structure_id', 'grid'] },
    { server: 'nexus-viewer', tool: 'set_symmetry', args: [] },
    { server: undefined, tool: 'read_points', args: ['volume_id', 'box', 'a', 'b', 'p'] },
  ]);
});

const skills = new URL('skills/', plugin);
for (const skill of readdirSync(skills).filter((d) => existsSync(new URL(`${d}/SKILL.md`, skills)))) {
  const file = new URL(`${skill}/SKILL.md`, skills);
  const md = readFileSync(file, 'utf8');

  test(`${skill}: front matter, and the notes it cites exist`, () => {
    const front = md.match(/^---\n([\s\S]*?)\n---\n/)?.[1] ?? '';
    assert.match(front, new RegExp(`^name: ${skill}$`, 'm'));
    assert.match(front, /^description: .{40,}$/m);
    for (const [, path] of md.matchAll(/`(\.\.?\/[^`]+\.md)`/g)) assert.ok(existsSync(new URL(path, file)), `${path} does not exist`);
  });

  const calls = callsIn(md);
  const named = [...new Set(calls.map((c) => c.server).filter(Boolean))];
  serverTest(`${skill}: every tool and argument it names exists`, async (t, start) => {
    assert.ok(calls.length, 'the skill names no tool call');
    const live = new Map();
    for (const name of named.filter((n) => ready.includes(n))) live.set(name, new Map((await start(name)).tools.map((x) => [x.name, x])));
    const problems = [];
    for (const c of calls) {
      if (c.server && !live.has(c.server)) continue; // a planned server: nothing to check yet
      const tools = (c.server ? [c.server] : [...live.keys()]).map((s) => live.get(s).get(c.tool)).filter(Boolean);
      if (!tools.length) {
        problems.push(`line ${c.line}: ${c.server ? `${c.server} has no tool` : `no server it names (${[...live.keys()].join(', ')}) has a tool`} ${c.tool}`);
        continue;
      }
      for (const arg of c.args) {
        if (!tools.some((tool) => Object.hasOwn(tool.inputSchema?.properties ?? {}, arg))) problems.push(`line ${c.line}: ${c.tool} takes no argument ${arg}`);
      }
    }
    t.diagnostic(`${calls.length} calls on ${[...live.keys()].join(', ')}`);
    assert.deepEqual(problems, [], problems.join('\n'));
  });
}
