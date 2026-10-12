// The apps suite.json describes, where their checkouts are, and why one cannot start. Shared by the
// launcher and the tests, so both find the same folders and judge them the same way.
//
// No dependencies: the plugin is copied without node_modules.

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const suite = JSON.parse(readFileSync(fileURLToPath(new URL('../suite.json', import.meta.url)), 'utf8'));

/** The servers that have an MCP server (`"status": "ready"`). */
export const ready = Object.entries(suite.servers).filter(([, s]) => s.status === 'ready').map(([name]) => name);

/** An environment variable, with '' read as unset. */
const env = (k) => process.env[k] || undefined;

/** `~`, `~/…` and, on Windows, `~\…` start at the home directory. */
export function expandHome(p, platform = process.platform) {
  if (p === '~') return homedir();
  if (p.startsWith('~/') || (platform === 'win32' && p.startsWith('~\\'))) return join(homedir(), p.slice(2));
  return p;
}

/** The checkout of a server's app: its own *_DIR, else its folder in SCATTERING_REPOS (default ~/GitHub). */
export function dirOf(name) {
  const s = suite.servers[name];
  const own = env(s.dir_env);
  if (own) return resolve(expandHome(own));
  return resolve(expandHome(env(suite.repos.env) ?? suite.repos.default), s.dir);
}

/** SCATTERING_FILE_ROOTS as a list: split on the platform's path separator (`:`, or `;` on Windows), `~` expanded. */
export function fileRoots() {
  const v = env(suite.file_roots_env);
  return v ? v.split(delimiter).filter(Boolean).map((r) => resolve(expandHome(r))) : [];
}

/** The version a checkout declares (package.json or pyproject.toml), or null. */
export function versionOf(name, dir = dirOf(name)) {
  const s = suite.servers[name];
  try {
    if (s.runtime === 'node') return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version ?? null;
    return readFileSync(join(dir, 'pyproject.toml'), 'utf8').match(/^version\s*=\s*"([^"]+)"/m)?.[1] ?? null;
  } catch {
    return null;
  }
}

export const older = (a, b) => {
  const pa = a.split(/[.-]/).map(Number), pb = b.split(/[.-]/).map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) < (pb[i] || 0);
  return false;
};

/**
 * Why a server cannot start, before any build: { kind, message } (the message says what to fix), or null.
 * Kinds: planned, missing (not cloned), not-installed (no node_modules), missing-file (a file the server
 * needs, so the checkout predates it), too-old (below min_version). The launcher adds build-failed and
 * crashed. Only missing and not-installed mean "this app is not set up here"; the others are faults.
 */
export function problemOf(name, dir = dirOf(name)) {
  const s = suite.servers[name];
  if (s.status !== 'ready') return { kind: 'planned', message: `${s.app} has no MCP server yet (planned: ${s.plan})` };
  if (!existsSync(dir)) {
    return {
      kind: 'missing',
      message: `${s.app} is not at ${dir}. Clone it there (git clone https://github.com/${s.github}.git "${dir}"), or set ${suite.repos.env} to the folder holding your repositories, or ${s.dir_env} to this one.`,
    };
  }
  for (const r of s.requires ?? []) {
    if (existsSync(join(dir, r))) continue;
    if (r === 'node_modules') return { kind: 'not-installed', message: `${s.app}'s dependencies are not installed: run npm install in ${dir}.` };
    return { kind: 'missing-file', message: `${dir} has no ${r}: this checkout predates ${s.app}'s MCP server. Pull the latest version (git -C "${dir}" pull).` };
  }
  const v = versionOf(name, dir);
  if (s.min_version && v && older(v, s.min_version)) {
    return { kind: 'too-old', message: `${s.app} ${v} is older than ${s.min_version}, the version these skills expect. Update it (git -C "${dir}" pull, then npm install).` };
  }
  return null;
}

/** Stand-in kinds a test may skip: the app is not set up on this machine. Every other kind is a fault. */
export const NOT_SET_UP = new Set(['missing', 'not-installed']);

/** A warning when min_version cannot gate a checkout (it declares no version), or ''. */
export function versionWarning(name, dir = dirOf(name)) {
  const s = suite.servers[name];
  if (!s.min_version || !existsSync(dir) || versionOf(name, dir)) return '';
  return `${s.app} declares no version, so min_version ${s.min_version} cannot be checked; gate it with a file in "requires" instead.`;
}

