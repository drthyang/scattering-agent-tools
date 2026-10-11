// Shared by the tests: the suite manifest, and an MCP client on a server started by the launcher, as
// Claude Code starts it. A server whose app is missing answers with the launcher's stand-in; the tests
// skip it then (and say why), so they run on any machine with some of the apps checked out.

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

export const suite = JSON.parse(readFileSync(new URL('../plugin/suite.json', import.meta.url), 'utf8'));
export const launcher = new URL('../plugin/bin/launch.mjs', import.meta.url).pathname;
export const ready = Object.entries(suite.servers).filter(([, s]) => s.status === 'ready').map(([name]) => name);

const home = (p) => (p.startsWith('~/') ? homedir() + p.slice(1) : p);

/** An app's checkout, as the launcher finds it. */
export function dirOf(name) {
  const s = suite.servers[name];
  return resolve(home(process.env[s.dir_env] ?? process.env[suite.repos.env] ?? suite.repos.default), process.env[s.dir_env] ? '' : s.dir);
}

/** A connected client, or { skip: reason } when the launcher could only start its stand-in. */
export async function connect(name, env = {}) {
  const client = new Client({ name: 'scattering-suite-tests', version: '0' });
  await client.connect(new StdioClientTransport({ command: 'node', args: [launcher, name], env: { ...process.env, ...env }, stderr: 'ignore' }));
  const { tools } = await client.listTools();
  if (tools.length === 1 && tools[0].name === 'setup_status') {
    const reason = text(await client.callTool({ name: 'setup_status', arguments: {} }));
    await client.close();
    return { skip: reason };
  }
  return { client, tools };
}

export const text = (r) => r.content.find((c) => c.type === 'text')?.text ?? '';
export const json = (r) => {
  if (r.isError) throw new Error(text(r));
  return JSON.parse(text(r));
};
