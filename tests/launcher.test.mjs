// The launcher on stand-in checkouts (no real app needed): which problems it reports and with which kind,
// that a server crashing at startup still gets a stand-in, the per-process bundle and its cleanup, the file
// roots it passes on, and the status and config commands.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import test from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

import { dirOf, expandHome, fileRoots, NOT_SET_UP, ready, suite } from '../plugin/bin/apps.mjs';
import { launcher, text } from './suite.js';

// A server in the shape the launcher expects of MATERIA, with one tool that reports what it was started with.
const SERVER = `import { createInterface } from 'node:readline';
if (process.env.FAKE_SERVER === 'crash') { console.error('fake server: cannot load the core'); process.exit(3); }
const send = (m) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...m }) + '\\n');
createInterface({ input: process.stdin }).on('line', (line) => {
  const msg = JSON.parse(line);
  if (msg.id === undefined) return;
  if (msg.method === 'initialize') send({ id: msg.id, result: { protocolVersion: msg.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'fake', version: '0' } } });
  else if (msg.method === 'tools/list') send({ id: msg.id, result: { tools: [{ name: 'whoami', description: 'What this server was started with.', inputSchema: { type: 'object', properties: {} } }] } });
  else if (msg.method === 'tools/call') send({ id: msg.id, result: { content: [{ type: 'text', text: JSON.stringify({ roots: process.env.MATERIA_ROOTS ?? null, bundle: process.argv[1], cwd: process.cwd() }) }] } });
  else send({ id: msg.id, error: { code: -32601, message: 'no' } });
});
`;

const BUILD = `import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
if (process.env.FAKE_BUILD === 'fail') { console.error('fake build: Could not resolve "@/core/refinement"'); process.exit(1); }
const at = process.argv.indexOf('--outfile');
const out = resolve(at > 0 ? process.argv[at + 1] : 'dist/mcp-server.mjs');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, ${JSON.stringify(SERVER)});
console.error('built ' + out);
`;

/** A folder (with a space in its path) holding a fake MATERIA checkout, removed after the test. */
function fakeMateria(t, { version = '0.4.0', installed = true, script = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'scattering launcher '));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const dir = join(root, 'web-refinement');
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'web-refinement', version }));
  if (installed) mkdirSync(join(dir, 'node_modules'));
  if (script) writeFileSync(join(dir, 'scripts', 'build-mcp.mjs'), BUILD);
  return { root, dir, bundles: join(dir, 'node_modules', '.cache', 'scattering-suite') };
}

/** Start the launcher for `name` with `env` added; the client and what the server lists. */
async function launch(t, name, env) {
  const transport = new StdioClientTransport({ command: process.execPath, args: [launcher, name], env: { ...process.env, ...env }, stderr: 'pipe' });
  transport.stderr?.resume();
  const client = new Client({ name: 'launcher-test', version: '0' });
  t.after(() => client.close());
  await client.connect(transport);
  const { tools } = await client.listTools();
  return { client, tools, transport };
}

/** The stand-in's report: { kind, problem, text }. */
async function standIn(t, env) {
  const { client, tools } = await launch(t, 'materia', env);
  assert.deepEqual(tools.map((x) => x.name), ['setup_status']);
  const r = await client.callTool({ name: 'setup_status', arguments: {} });
  assert.equal(r.isError, true);
  return { ...r.structuredContent, text: text(r) };
}

const exited = async (pid) => {
  for (let i = 0; i < 100; i++) {
    try {
      process.kill(pid, 0);
    } catch {
      return true;
    }
    await sleep(50);
  }
  return false;
};

test('a missing checkout is "missing", with an https clone into the right folder', async (t) => {
  const r = await standIn(t, { MATERIA_DIR: join(tmpdir(), 'no-such-checkout') });
  assert.equal(r.kind, 'missing');
  assert.match(r.problem, /git clone https:\/\/github\.com\/drthyang\/web-refinement\.git ".*no-such-checkout"/);
  assert.ok(NOT_SET_UP.has(r.kind));
});

test('no node_modules is "not-installed"', async (t) => {
  const { dir } = fakeMateria(t, { installed: false });
  const r = await standIn(t, { MATERIA_DIR: dir });
  assert.equal(r.kind, 'not-installed');
  assert.ok(NOT_SET_UP.has(r.kind));
});

test('a missing required file, an old version and a failed build are faults, not skips', async (t) => {
  const old = fakeMateria(t, { version: '0.2.9' });
  const r1 = await standIn(t, { MATERIA_DIR: old.dir });
  assert.equal(r1.kind, 'too-old');

  const noScript = fakeMateria(t, { script: false });
  const r2 = await standIn(t, { MATERIA_DIR: noScript.dir });
  assert.equal(r2.kind, 'missing-file');

  const broken = fakeMateria(t);
  const r3 = await standIn(t, { MATERIA_DIR: broken.dir, FAKE_BUILD: 'fail' });
  assert.equal(r3.kind, 'build-failed');
  assert.match(r3.problem, /Could not resolve "@\/core\/refinement"/, 'the build\'s own error is in the report');

  for (const r of [r1, r2, r3]) assert.ok(!NOT_SET_UP.has(r.kind));
  assert.deepEqual(existsSync(broken.bundles) ? readdirSync(broken.bundles) : [], [], 'no bundle left behind');
});

test('a server that stops before it answers gets a stand-in ("crashed"), not a closed connection', async (t) => {
  const { dir, bundles } = fakeMateria(t);
  const r = await standIn(t, { MATERIA_DIR: dir, FAKE_SERVER: 'crash' });
  assert.equal(r.kind, 'crashed');
  assert.match(r.problem, /exit 3/);
  assert.match(r.problem, /cannot load the core/, 'the server\'s last output is in the report');
  assert.deepEqual(readdirSync(bundles), [], 'its bundle is deleted');
});

test('a running server: its own bundle, deleted on exit, stale ones swept; roots passed on with ~ expanded', async (t) => {
  const { dir, bundles } = fakeMateria(t);
  mkdirSync(bundles, { recursive: true });
  const gone = spawnSync(process.execPath, ['-e', '']).pid; // a process that has exited
  const stale = join(bundles, `materia-mcp-${gone}.mjs`);
  writeFileSync(stale, '');
  const elsewhere = mkdtempSync(join(tmpdir(), 'scattering-roots-'));
  t.after(() => rmSync(elsewhere, { recursive: true, force: true }));

  const { client, transport } = await launch(t, 'materia', { MATERIA_DIR: dir, SCATTERING_FILE_ROOTS: ['~/data', elsewhere].join(delimiter) });
  const who = JSON.parse(text(await client.callTool({ name: 'whoami', arguments: {} })));
  assert.equal(who.roots, [join(homedir(), 'data'), elsewhere].join(delimiter));
  assert.equal(who.bundle, join(bundles, `materia-mcp-${transport.pid}.mjs`), 'built for this launcher, in the checkout');
  assert.equal(who.cwd, process.cwd(), 'the server runs in the client\'s working directory');
  assert.ok(existsSync(who.bundle));
  assert.ok(!existsSync(stale), 'a bundle whose launcher is gone is swept');

  // A second server of the same app has a bundle of its own: rebuilding never replaces a running one's.
  const second = await launch(t, 'materia', { MATERIA_DIR: dir });
  const other = JSON.parse(text(await second.client.callTool({ name: 'whoami', arguments: {} })));
  assert.notEqual(other.bundle, who.bundle);
  assert.equal(other.roots, null, 'without roots the app keeps its own default');

  const pid = transport.pid;
  await client.close();
  assert.ok(await exited(pid), 'the launcher exits with its client');
  assert.ok(!existsSync(who.bundle), 'and deletes its bundle');
  assert.ok(existsSync(other.bundle), 'the other server\'s bundle stays');
});

test('a root list set by the user for the app wins over SCATTERING_FILE_ROOTS', async (t) => {
  const { dir } = fakeMateria(t);
  const { client } = await launch(t, 'materia', { MATERIA_DIR: dir, SCATTERING_FILE_ROOTS: tmpdir(), MATERIA_ROOTS: '/elsewhere' });
  assert.equal(JSON.parse(text(await client.callTool({ name: 'whoami', arguments: {} }))).roots, '/elsewhere');
});

test('status builds what needs a build, and reports what does not', (t) => {
  const good = fakeMateria(t), bad = fakeMateria(t);
  // Only the fake app: the other checkouts are looked for in its folder, where they are not.
  const only = Object.fromEntries(Object.values(suite.servers).map((s) => [s.dir_env, '']));
  const status = (env, ...flags) => spawnSync(process.execPath, [launcher, 'status', ...flags], { env: { ...process.env, ...only, [suite.repos.env]: good.root, ...env }, encoding: 'utf8' });
  const ok = status({ MATERIA_DIR: good.dir });
  assert.match(ok.stdout, /^✗ nexplan .*\n +NEXPLAN is not at /m);
  assert.match(ok.stdout, /^✓ materia +0\.4\.0 /m);
  const failed = status({ MATERIA_DIR: bad.dir, FAKE_BUILD: 'fail' });
  assert.match(failed.stdout, /^✗ materia .*\n +building it failed/m);
  assert.equal(failed.status, 1);
  const quick = status({ MATERIA_DIR: bad.dir, FAKE_BUILD: 'fail' }, '--no-build');
  assert.match(quick.stdout, /^\? materia .*\n +found, not built/m);
  assert.deepEqual(readdirSync(good.bundles), [], 'status leaves no bundle behind');
});

test('config: this node by its full path, and the variables the launcher reads', () => {
  const env = { ...process.env, SCATTERING_REPOS: '~/src', MATERIA_DIR: '/opt/materia', NEXPLAN_DIR: '', UNRELATED_DIR: 'x' };
  const out = spawnSync(process.execPath, [launcher, 'config'], { env, encoding: 'utf8' });
  const { mcpServers } = JSON.parse(out.stdout);
  assert.deepEqual(Object.keys(mcpServers), ready);
  for (const [name, s] of Object.entries(mcpServers)) {
    assert.equal(s.command, process.execPath);
    assert.deepEqual(s.args, [launcher, name]);
    assert.equal(s.env.SCATTERING_REPOS, '~/src');
    assert.equal(s.env.MATERIA_DIR, '/opt/materia');
    assert.ok(!('NEXPLAN_DIR' in s.env) && !('UNRELATED_DIR' in s.env));
  }
});

test('checkouts and roots: ~ and (on Windows) ~\\ expanded, an empty variable read as unset', (t) => {
  assert.equal(expandHome('~'), homedir());
  assert.equal(expandHome('~/a/b'), join(homedir(), 'a/b'));
  assert.equal(expandHome('~\\a', 'win32'), join(homedir(), 'a'));
  assert.equal(expandHome('~\\a', 'linux'), '~\\a');
  assert.equal(expandHome('/x/~/y'), '/x/~/y');

  const saved = { ...process.env };
  t.after(() => {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  });
  process.env[suite.repos.env] = '~/repos';
  process.env.NEXPLAN_DIR = '';
  assert.equal(dirOf('nexplan'), join(homedir(), 'repos', 'nexplan'));
  process.env.NEXPLAN_DIR = '~/elsewhere/nexplan';
  assert.equal(dirOf('nexplan'), join(homedir(), 'elsewhere', 'nexplan'));
  process.env[suite.file_roots_env] = ['~/a', '', '/b'].join(delimiter);
  assert.deepEqual(fileRoots(), [join(homedir(), 'a'), resolve('/b')]);
});

// serverTest itself, run in a child test runner on a fixture.
function runFixture(t, body, env) {
  const { root } = fakeMateria(t);
  const file = join(root, 'fixture.test.mjs');
  writeFileSync(file, `import { serverTest } from ${JSON.stringify(new URL('./suite.js', import.meta.url).href)};\n${body}\n`);
  const { NODE_TEST_CONTEXT, ...outer } = process.env; // else the child reports to this runner, not to stdout
  return spawnSync(process.execPath, ['--test', '--test-reporter=spec', file], { env: { ...outer, ...env }, encoding: 'utf8', timeout: 60_000 });
}

test('a hand-off whose second server crashes fails with its stderr, and closes the first (no hang)', (t) => {
  const { dir } = fakeMateria(t);
  const r = runFixture(t, `serverTest('two servers', async (t, start) => {
    await start('materia');
    await start('materia', { FAKE_SERVER: 'crash' });
  });`, { MATERIA_DIR: dir, SCATTERING_TEST_STRICT: '' });
  assert.equal(r.signal, null, 'the run finished on its own');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /did not start \(crashed\)/);
  assert.match(r.stdout, /materia stderr:[\s\S]*cannot load the core/);
});

test('an app that is not set up is skipped, and fails under SCATTERING_TEST_STRICT=1', (t) => {
  const body = `serverTest('needs materia', async (t, start) => { await start('materia'); });`;
  const env = { MATERIA_DIR: join(tmpdir(), 'no-such-checkout') };
  const skipped = runFixture(t, body, { ...env, SCATTERING_TEST_STRICT: '' });
  assert.equal(skipped.status, 0);
  assert.match(skipped.stdout, /ℹ skipped 1/);
  assert.match(skipped.stdout, /needs materia .*MATERIA is not at/);
  const strict = runFixture(t, body, { ...env, SCATTERING_TEST_STRICT: '1' });
  assert.equal(strict.status, 1);
  assert.match(strict.stdout, /SCATTERING_TEST_STRICT: would skip/);
});
