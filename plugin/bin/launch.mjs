#!/usr/bin/env node
// Starts one app's MCP server from its own checkout, as suite.json describes it:
//
//   node launch.mjs <server>             run the server on stdio (what .mcp.json calls)
//   node launch.mjs status [--no-build]  which apps are found, their versions, whether they build, what is missing
//   node launch.mjs config               an "mcpServers" block for clients without the plugin (Claude Desktop, others)
//
// The tools stay in each app's repository, next to the code they call; this script only finds the
// checkout (apps.mjs), builds it when the app needs a build, and relays stdio to the app's server. When
// an app cannot start (not cloned, not installed, too old, its build fails, its server stops before it
// answers), a stand-in server answers instead, with one tool, setup_status, that says what to fix and
// which kind of problem it is, so the agent can tell the user rather than the server silently failing.
//
// No dependencies: the plugin is copied without node_modules.

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { basename, delimiter, dirname, join } from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { fileURLToPath } from 'node:url';

import { dirOf, fileRoots, problemOf, ready, suite, versionOf, versionWarning } from './apps.mjs';

// ---------------------------------------------------------------- commands

/** The folder of the node running this script, first on PATH: `#!/usr/bin/env node` scripts and npm then find it
 *  even when the client (a GUI app) was started without the shell's PATH, as under nvm. */
function nodeOnPath(base) {
  const env = { ...base };
  const key = Object.keys(env).find((k) => k.toUpperCase() === 'PATH') ?? 'PATH';
  const bin = dirname(process.execPath);
  const parts = (env[key] ?? '').split(delimiter).filter(Boolean);
  env[key] = [bin, ...parts.filter((p) => p !== bin)].join(delimiter);
  return env;
}

/** npm's own script next to this node (Windows layout, then the Unix one), so npm runs without a shell or PATH. */
function npmCli() {
  const bin = dirname(process.execPath);
  return [join(bin, 'node_modules', 'npm', 'bin', 'npm-cli.js'), join(bin, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js')].find((p) => existsSync(p)) ?? null;
}

const quoteWin = (a) => (/[\s"&|<>^%]/.test(a) ? `"${a.replaceAll('"', '""')}"` : a);

/** How to spawn an argv: `node` is this node, `npm` is its npm-cli.js; other commands by name (through a shell on
 *  Windows, where they are often .cmd shims). */
function commandOf([cmd, ...args]) {
  if (cmd === 'node') return { file: process.execPath, args };
  const cli = cmd === 'npm' ? npmCli() : null;
  if (cli) return { file: process.execPath, args: [cli, ...args] };
  if (process.platform === 'win32') return { file: quoteWin(cmd), args: args.map(quoteWin), shell: true };
  return { file: cmd, args };
}

/** A server's command lines with {dir}, {pid} and {bundle} filled. {bundle} is the server's per-process build output. */
function filler(name, dir) {
  const s = suite.servers[name];
  const base = (x) => x.replaceAll('{dir}', dir).replaceAll('{pid}', String(process.pid));
  const bundle = s.bundle ? base(s.bundle) : null;
  return { bundle, fill: (x) => base(x).replaceAll('{bundle}', bundle ?? '') };
}

const remove = (path) => {
  if (path) rmSync(path, { force: true });
};

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

/** Delete the per-process bundles of launchers that are gone (killed before they could delete their own). */
function sweepBundles(name, dir) {
  const template = suite.servers[name].bundle?.replaceAll('{dir}', dir);
  if (!template?.includes('{pid}') || dirname(template).includes('{pid}')) return;
  const escape = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^${basename(template).split('{pid}').map(escape).join('(\\d+)')}$`);
  let files;
  try {
    files = readdirSync(dirname(template));
  } catch {
    return;
  }
  for (const f of files) {
    const pid = Number(f.match(re)?.[1]);
    if (pid && pid !== process.pid && !alive(pid)) remove(join(dirname(template), f));
  }
}

/** The last few lines of a program's output, on one line. */
const lastLines = (text, n = 6) => text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(-n).join(' / ').slice(-800);

/** Build a server's app if it needs it: null, or the problem (kind build-failed). The output goes to stderr unless quiet. */
function build(name, dir, fill, bundle, { quiet = false } = {}) {
  const s = suite.servers[name];
  if (!s.build) return null;
  const argv = s.build.map(fill);
  if (bundle) mkdirSync(dirname(bundle), { recursive: true });
  const { file, args, shell } = commandOf(argv);
  // stdout is the protocol channel: the build's output is collected, then shown on stderr.
  const b = spawnSync(file, args, { cwd: dir, env: nodeOnPath(process.env), shell, encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'pipe'] });
  const output = `${b.stdout ?? ''}${b.stderr ?? ''}`;
  if (!quiet && output) process.stderr.write(output);
  if (b.status === 0) return null;
  const why = b.error ? b.error.message : `exit ${b.status ?? b.signal}`;
  const tail = lastLines(output);
  return {
    kind: 'build-failed',
    message: `building it failed (${argv.join(' ')} in ${dir}: ${why}). Run that command there to see why.${tail ? ` Its last output: ${tail}` : ''}`,
  };
}

/** The server's environment: the client's, node first on PATH, and the app's variables from suite.json (the user's own win). */
function serverEnv(name, fill) {
  const env = nodeOnPath(process.env);
  const roots = fileRoots();
  for (const [k, v] of Object.entries(suite.servers[name].env ?? {})) {
    if (process.env[k] !== undefined) continue;
    if (v.includes('{file_roots}') && !roots.length) continue; // keep the app's own default
    env[k] = fill(v).replaceAll('{file_roots}', roots.join(delimiter));
  }
  return env;
}

// ---------------------------------------------------------------- stdio

/** Splits a byte stream into lines. */
class Lines {
  constructor(onLine) {
    this.onLine = onLine;
    this.rest = '';
    this.decoder = new StringDecoder('utf8');
  }

  push(chunk) {
    const parts = (this.rest + this.decoder.write(chunk)).split('\n');
    this.rest = parts.pop();
    for (const part of parts) if (part.trim()) this.onLine(part.replace(/\r$/, ''));
  }
}

const parse = (line) => {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
};

const KINDS = ['planned', 'missing', 'not-installed', 'missing-file', 'too-old', 'build-failed', 'crashed'];

/** A minimal MCP server (newline-delimited JSON-RPC on stdio) whose one tool, setup_status, reports `problem`
 *  ({ kind, message }). Returns its line handler. */
function standIn(name, problem) {
  const s = suite.servers[name];
  const text = `The ${s.app} tools are not available: ${problem.message}`;
  const send = (msg) => process.stdout.write(`${JSON.stringify(msg)}\n`);
  console.error(text);
  return (line) => {
    const msg = parse(line);
    if (msg?.id === undefined || typeof msg.method !== 'string') return; // a notification, or not a request
    const reply = (result) => send({ jsonrpc: '2.0', id: msg.id, result });
    if (msg.method === 'initialize') {
      reply({ protocolVersion: msg.params?.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name, version: '0.0.0' }, instructions: text });
    } else if (msg.method === 'ping') {
      reply({});
    } else if (msg.method === 'tools/list') {
      reply({
        tools: [{
          name: 'setup_status',
          title: `${s.app} setup`,
          description: `Says why the ${s.app} tools (${s.role}) are not available here, and how to fix it.`,
          inputSchema: { type: 'object', properties: {}, additionalProperties: false },
          outputSchema: {
            type: 'object',
            properties: { server: { type: 'string' }, app: { type: 'string' }, kind: { type: 'string', enum: KINDS }, problem: { type: 'string' } },
            required: ['server', 'app', 'kind', 'problem'],
          },
          annotations: { readOnlyHint: true, openWorldHint: false },
        }],
      });
    } else if (msg.method === 'tools/call') {
      reply({ content: [{ type: 'text', text }], structuredContent: { server: name, app: s.app, kind: problem.kind, problem: problem.message }, isError: true });
    } else {
      send({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: `Method not found: ${msg.method}` } });
    }
  };
}

function serveStandIn(name, problem) {
  const lines = new Lines(standIn(name, problem));
  process.stdin.on('data', (chunk) => lines.push(chunk));
}

/**
 * Run the server and relay stdio. Until the server answers `initialize`, its output is held and the client's
 * messages are kept: if it stops first (a crash at startup), a stand-in answers them instead, so the client gets
 * setup_status rather than a closed connection.
 */
function relay(name, dir, fill, bundle) {
  const s = suite.servers[name];
  const argv = s.run.map(fill);
  const { file, args, shell } = commandOf(argv);
  // The server runs in the client's working directory, so relative paths in tool calls mean what the user expects.
  const child = spawn(file, args, { stdio: ['pipe', 'pipe', 'pipe'], env: serverEnv(name, fill), shell });
  let mode = 'starting'; // → 'relay' once the server answered initialize, or 'stand-in' if it stopped before
  let initId, answered = false, standInLine = null, tail = '';
  let stopping = false; // the client closed stdin or signalled: a server stopping now has not crashed
  const sent = [], held = [];

  const fromClient = new Lines((line) => {
    if (mode === 'stand-in') return standInLine(line);
    sent.push(line);
    const msg = initId === undefined ? parse(line) : null;
    if (msg?.method === 'initialize') initId = msg.id;
  });
  const fromServer = new Lines((line) => {
    const msg = initId !== undefined && line.includes('"id"') ? parse(line) : null;
    if (msg && msg.id === initId && ('result' in msg || 'error' in msg)) answered = true;
  });

  process.stdin.on('data', (chunk) => {
    if (mode !== 'relay') fromClient.push(chunk);
    if (mode !== 'stand-in') child.stdin.write(chunk);
  });
  process.stdin.on('end', () => {
    stopping = true;
    if (mode !== 'stand-in') child.stdin.end();
  });
  child.stdin.on('error', () => {}); // a server that stopped; its exit is handled below
  process.stdout.on('error', () => process.exit(0)); // the client went away

  child.stdout.on('data', (chunk) => {
    if (mode === 'relay') return process.stdout.write(chunk);
    if (mode === 'stand-in') return;
    held.push(chunk);
    fromServer.push(chunk);
    if (!answered) return;
    mode = 'relay';
    process.stdout.write(Buffer.concat(held));
    held.length = sent.length = 0;
  });
  child.stderr.on('data', (chunk) => {
    process.stderr.write(chunk);
    if (mode === 'starting') tail = (tail + chunk).slice(-8000);
  });

  const fallBack = (why) => {
    if (mode !== 'starting') return;
    mode = 'stand-in';
    remove(bundle);
    const out = lastLines(tail);
    standInLine = standIn(name, {
      kind: 'crashed',
      message: `its server stopped before it answered (${why}): ${argv.join(' ')}. ${out ? `Its last output: ${out}` : 'It printed nothing.'}`,
    });
    for (const line of sent.splice(0)) standInLine(line);
  };
  child.on('error', (err) => {
    if (mode === 'starting') return fallBack(err.message);
    console.error(`${s.app}: ${err.message}`);
    process.exit(1);
  });
  child.on('close', (code, signal) => {
    if (mode === 'starting' && !stopping) return fallBack(signal ? `signal ${signal}` : `exit ${code}`);
    if (mode !== 'stand-in') process.stdout.write('', () => process.exit(code ?? (signal ? 1 : 0)));
  });
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(sig, () => {
      stopping = true;
      if (mode === 'stand-in' || child.exitCode !== null || child.signalCode !== null) process.exit(0);
      child.kill(sig);
    });
  }
}

// ---------------------------------------------------------------- commands

function run(name) {
  if (!suite.servers[name]) {
    console.error(`No server '${name}' in suite.json. Servers: ${Object.keys(suite.servers).join(', ')}.`);
    process.exit(2);
  }
  const dir = dirOf(name);
  const problem = problemOf(name, dir);
  if (problem) return serveStandIn(name, problem);
  const warning = versionWarning(name, dir);
  if (warning) console.error(warning);
  const { fill, bundle } = filler(name, dir);
  if (bundle) {
    sweepBundles(name, dir);
    process.on('exit', () => remove(bundle));
  }
  const failed = build(name, dir, fill, bundle);
  if (failed) {
    remove(bundle);
    return serveStandIn(name, failed);
  }
  relay(name, dir, fill, bundle);
}

function status(flags) {
  const building = !flags.includes('--no-build');
  let bad = false;
  for (const [name, s] of Object.entries(suite.servers)) {
    const dir = dirOf(name);
    const version = (existsSync(dir) && versionOf(name, dir)) || '—';
    let problem = problemOf(name, dir), note = '';
    if (!problem && s.build && building) {
      const { fill, bundle } = filler(name, dir);
      sweepBundles(name, dir);
      problem = build(name, dir, fill, bundle, { quiet: true });
      remove(bundle);
    } else if (!problem && s.build) {
      note = 'found, not built (run status without --no-build to build it)';
    }
    const mark = problem ? (problem.kind === 'planned' ? '·' : '✗') : note ? '?' : '✓';
    if (problem && problem.kind !== 'planned') bad = true;
    const notes = [problem?.message, note, problem ? '' : versionWarning(name, dir)].filter(Boolean);
    console.log(`${mark} ${name.padEnd(14)} ${version.padEnd(10)} ${dir}${notes.map((n) => `\n    ${n}`).join('')}`);
  }
  process.exitCode = bad ? 1 : 0;
}

function config() {
  const launcher = fileURLToPath(import.meta.url);
  // The variables the launcher reads: a client started from the desktop has none of the shell's.
  const names = new Set([suite.repos.env, suite.file_roots_env, ...Object.values(suite.servers).map((s) => s.dir_env)]);
  const env = Object.fromEntries([...names].filter((k) => process.env[k]).map((k) => [k, process.env[k]]));
  const servers = Object.fromEntries(ready.map((name) => [name, { command: process.execPath, args: [launcher, name], ...(Object.keys(env).length ? { env } : {}) }]));
  console.log(JSON.stringify({ mcpServers: servers }, null, 2));
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === 'status') status(rest);
else if (cmd === 'config') config();
else if (cmd && !cmd.startsWith('-')) run(cmd);
else {
  console.error('Usage: launch.mjs <server> | status [--no-build] | config');
  process.exit(2);
}
