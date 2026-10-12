// Shared by the tests: the suite manifest, and MCP clients on servers started by the launcher, as Claude
// Code starts them. When an app cannot start, the launcher's stand-in says why, with a machine-readable
// kind: an app that is not cloned or not installed here is skipped (and the reason given), so the tests run
// on any machine with some of the apps; a failed build, a version below min_version, a missing file or a
// server that crashes fails the test. With SCATTERING_TEST_STRICT=1 every skip fails too.

import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

import { NOT_SET_UP, dirOf, ready, suite } from '../plugin/bin/apps.mjs';

export { dirOf, ready, suite };
export const launcher = fileURLToPath(new URL('../plugin/bin/launch.mjs', import.meta.url));
export const strict = /^(1|true|yes)$/i.test(process.env.SCATTERING_TEST_STRICT ?? '');

export const text = (r) => r.content.find((c) => c.type === 'text')?.text ?? '';
export const json = (r) => {
  if (r.isError) throw new Error(text(r));
  return JSON.parse(text(r));
};

/** Thrown to skip the current test: the app it needs is not set up here. */
export class Skip extends Error {}

/** Skip a test with its reason, or fail it in strict mode. */
export function skip(t, reason) {
  if (strict) assert.fail(`SCATTERING_TEST_STRICT: would skip: ${reason}`);
  t.skip(reason);
}

const LOG = 20_000;

/** A client on `name` through the launcher, kept in `open` (so it is closed whatever happens). */
async function start(open, name, env = {}) {
  const transport = new StdioClientTransport({ command: process.execPath, args: [launcher, name], env: { ...process.env, ...env }, stderr: 'pipe' });
  let log = '';
  transport.stderr?.on('data', (chunk) => {
    log = (log + chunk).slice(-LOG);
  });
  const client = new Client({ name: 'scattering-suite-tests', version: '0' });
  open.push({ name, client, stderr: () => log.trim() });
  await client.connect(transport);
  const { tools } = await client.listTools();
  if (tools.length === 1 && tools[0].name === 'setup_status') {
    const r = await client.callTool({ name: 'setup_status', arguments: {} });
    const kind = r.structuredContent?.kind ?? 'unknown';
    if (NOT_SET_UP.has(kind)) throw new Skip(text(r));
    throw new Error(`${name} did not start (${kind}): ${text(r)}`);
  }
  return { client, tools };
}

/**
 * A test on live servers. `body(t, start)`, where `start(name, env?)` resolves to { client, tools } on a
 * server started by the launcher, or skips the test when that app is not set up here. Every client is
 * closed when the test ends, however it ends; when it fails, each server's stderr is printed.
 */
export function serverTest(title, body) {
  return test(title, async (t) => {
    const open = [];
    try {
      await body(t, (name, env) => start(open, name, env));
    } catch (err) {
      if (err instanceof Skip) return skip(t, err.message);
      for (const c of open) if (c.stderr()) t.diagnostic(`${c.name} stderr:\n${c.stderr()}`);
      throw err;
    } finally {
      await Promise.allSettled(open.map((c) => c.client.close()));
    }
  });
}
