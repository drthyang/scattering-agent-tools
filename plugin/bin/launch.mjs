#!/usr/bin/env node
// Starts one app's MCP server from its own checkout, as suite.json describes it:
//
//   node launch.mjs <server>     run the server on stdio (what .mcp.json calls)
//   node launch.mjs status       which apps are found, their versions, and what is missing
//   node launch.mjs config       an "mcpServers" block for clients without the plugin (Claude Desktop, others)
//
// The tools stay in each app's repository, next to the code they call; this script only finds the
// checkout (SCATTERING_REPOS, default ~/GitHub, or a per-app *_DIR), builds it when the app needs a
// build, and hands stdio to the app's server. When an app cannot start (not cloned, dependencies not
// installed, too old), a stand-in server answers instead, with one tool that says what to fix, so the
// agent can tell the user rather than the server silently failing.
//
// No dependencies: the plugin is copied without node_modules.

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const suite = JSON.parse(readFileSync(join(here, '..', 'suite.json'), 'utf8'));
const home = (p) => (p === '~' || p.startsWith('~/') ? homedir() + p.slice(1) : p);

/** The checkout of a server's app. */
function dirOf(s) {
  if (process.env[s.dir_env]) return resolve(home(process.env[s.dir_env]));
  return resolve(home(process.env[suite.repos.env] || suite.repos.default), s.dir);
}

function versionOf(s, dir) {
  try {
    if (s.runtime === 'node') return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version ?? null;
    const py = readFileSync(join(dir, 'pyproject.toml'), 'utf8').match(/^version\s*=\s*"([^"]+)"/m);
    return py?.[1] ?? null;
  } catch {
    return null;
  }
}

const older = (a, b) => {
  const pa = a.split(/[.-]/).map(Number), pb = b.split(/[.-]/).map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) < (pb[i] || 0);
  return false;
};

/** Why a server cannot start (a sentence with the fix), or '' when it can. */
function problemOf(name, s, dir) {
  if (s.status !== 'ready') return `${s.app} has no MCP server yet (planned: ${s.plan})`;
  if (!existsSync(dir)) {
    return `${s.app} is not at ${dir}. Clone it there (git clone git@github.com:${s.github}.git), or set ${suite.repos.env} to the folder holding your repositories, or ${s.dir_env} to this one.`;
  }
  for (const r of s.requires ?? []) {
    if (existsSync(join(dir, r))) continue;
    if (r === 'node_modules') return `${s.app}'s dependencies are not installed: run npm install in ${dir}.`;
    return `${dir} has no ${r}: this checkout predates ${s.app}'s MCP server. Pull the latest version (git -C ${dir} pull).`;
  }
  const v = versionOf(s, dir);
  if (s.min_version && v && older(v, s.min_version)) return `${s.app} ${v} is older than ${s.min_version}, the version these skills expect. Update it (git -C ${dir} pull, then npm install).`;
  return '';
}

/** A minimal MCP server (newline-delimited JSON-RPC on stdio) with one tool that reports `problem`. */
function serveStandIn(name, s, problem) {
  const send = (msg) => process.stdout.write(`${JSON.stringify(msg)}\n`);
  const text = `The ${s.app} tools are not available: ${problem}`;
  createInterface({ input: process.stdin }).on('line', (line) => {
    let msg;
    try { msg = JSON.parse(line); } catch { return; }
    if (msg.id === undefined) return; // a notification
    const reply = (result) => send({ jsonrpc: '2.0', id: msg.id, result });
    if (msg.method === 'initialize') {
      reply({ protocolVersion: msg.params?.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name, version: '0.0.0' }, instructions: text });
    } else if (msg.method === 'ping') {
      reply({});
    } else if (msg.method === 'tools/list') {
      reply({ tools: [{ name: 'setup_status', title: `${s.app} setup`, description: `Says why the ${s.app} tools (${s.role}) are not available here, and how to fix it.`, inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true } }] });
    } else if (msg.method === 'tools/call') {
      reply({ content: [{ type: 'text', text }], isError: true });
    } else {
      send({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: `Method not found: ${msg.method}` } });
    }
  });
  console.error(text);
}

function run(name) {
  const s = suite.servers[name];
  if (!s) {
    console.error(`No server '${name}' in suite.json. Servers: ${Object.keys(suite.servers).join(', ')}.`);
    process.exit(2);
  }
  const dir = dirOf(s);
  const problem = problemOf(name, s, dir);
  if (problem) return serveStandIn(name, s, problem);
  const fill = (x) => x.replaceAll('{dir}', dir);
  if (s.build) {
    // The build's output goes to stderr: stdout is the protocol channel.
    const b = spawnSync(s.build[0], s.build.slice(1), { cwd: dir, stdio: ['ignore', 2, 2] });
    if (b.status !== 0) return serveStandIn(name, s, `building it failed (${s.build.join(' ')} in ${dir}, exit ${b.status ?? b.error?.message}). Run that command to see why.`);
  }
  const env = { ...process.env };
  const roots = process.env[suite.file_roots_env];
  for (const [k, v] of Object.entries(s.env ?? {})) {
    if (v.includes('{file_roots}') && !roots) continue; // keep the app's own default
    if (process.env[k] === undefined) env[k] = fill(v).replaceAll('{file_roots}', roots ?? '');
  }
  // The server runs in the client's working directory, so relative paths in tool calls mean what the user expects.
  const child = spawn(fill(s.run[0]), s.run.slice(1).map(fill), { stdio: 'inherit', env });
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => child.kill(sig));
  child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
  child.on('error', (err) => {
    console.error(`${s.app}: ${err.message}`);
    process.exit(1);
  });
}

function status() {
  const rows = Object.entries(suite.servers).map(([name, s]) => {
    const dir = dirOf(s), problem = problemOf(name, s, dir);
    return { server: name, app: s.app, dir, version: existsSync(dir) ? versionOf(s, dir) ?? '—' : '—', state: problem ? (s.status === 'ready' ? 'not ready' : s.status) : 'ok', note: problem };
  });
  for (const r of rows) console.log(`${r.state === 'ok' ? '✓' : r.state === 'planned' ? '·' : '✗'} ${r.server.padEnd(14)} ${String(r.version).padEnd(10)} ${r.dir}${r.note ? `\n    ${r.note}` : ''}`);
  process.exitCode = rows.some((r) => r.state === 'not ready') ? 1 : 0;
}

function config() {
  const launcher = fileURLToPath(import.meta.url);
  const servers = Object.fromEntries(Object.entries(suite.servers).filter(([, s]) => s.status === 'ready')
    .map(([name]) => [name, { command: 'node', args: [launcher, name] }]));
  console.log(JSON.stringify({ mcpServers: servers }, null, 2));
}

const [cmd] = process.argv.slice(2);
if (cmd === 'status') status();
else if (cmd === 'config') config();
else if (cmd && !cmd.startsWith('-')) run(cmd);
else {
  console.error('Usage: launch.mjs <server> | status | config');
  process.exit(2);
}
