# Development

[← README](../README.md) · [Capabilities](CAPABILITIES.md) · [Conventions](CONVENTIONS.md)

How this repository is organised, how to install and test it in detail, and how to extend it.

## Why it is split this way

- **Tools stay in their apps.** A tool is a thin layer over the app's code, so it lives next to that
  code, changes in the same commit, and is tested by the app's own tests. The numbers an agent gets
  are the numbers the app shows, and the in-app assistants (MATERIA's chat, NEBULA Pilot, the
  Workbench copilot) reuse the same code.
- **Everything between the apps lives here:**
  - the **plugin**: one install registers every app's MCP server.
  - the **launcher**: finds each checkout, builds it if needed, and explains what to fix when it
    can't start.
  - the **skills**: the cross-app workflows.
  - the **[conventions](CONVENTIONS.md)**: the rules every server follows.
  - the **[capability map](CAPABILITIES.md)**: one owner for each overlapping feature.
  - the **tests**: conformance and hand-off checks across the real servers.

Day to day, agent work happens here. An app changes only when one of its tools does.

## Layout

| Path | What it is |
| --- | --- |
| `plugin/` | The Claude Code plugin `scattering-suite` |
| `plugin/suite.json` | The apps: where their checkouts are, how to build and run each server, which version these skills expect, which are planned ([fields](#suitejson)) |
| `plugin/bin/launch.mjs` | Starts one server from its app's checkout (no dependencies); `status` and `config` subcommands |
| `plugin/bin/apps.mjs` | Finds the checkouts and says why one cannot start; shared by the launcher and the tests |
| `plugin/.mcp.json` | The servers the plugin registers, all through the launcher |
| `plugin/skills/` | Cross-app workflows: `bragg-node-audit`, `volume-to-delta-pdf`, `powder-plan-to-refinement` |
| `plugin/knowledge/` | Domain notes the skills cite (diffuse scattering, PDF conventions, RMC failure modes, …) |
| `docs/CONVENTIONS.md` | The tool contract: names, arguments, results, errors, files, physics conventions at the boundaries |
| `docs/CAPABILITIES.md` | Who owns which capability, and how overlaps are resolved |
| `tests/` | `launcher.test.mjs` (the launcher, on a fake checkout), `conformance.test.mjs` (every server against the conventions), `contract.test.mjs` (`.mcp.json`, and the tools the skills name), `handoff.test.mjs` (files and values passed between apps) and `docs.test.mjs` (the tool lists in CAPABILITIES.md) |
| `.claude-plugin/marketplace.json` | Makes this repository a plugin marketplace |

## Install in detail

The apps are expected side by side in one folder (default `~/GitHub`; set `SCATTERING_REPOS`
otherwise, or `NEXPLAN_DIR`, `MATERIA_DIR`, `NEXUS_VIEWER_DIR` per app), each with `npm install`
done once. `~` is expanded in these; an empty variable counts as unset.

```bash
node plugin/bin/launch.mjs status     # each app: found, version, builds, or what to fix
node plugin/bin/launch.mjs status --no-build   # quicker: "found, not built" for apps with a build
```

In Claude Code:

```text
/plugin marketplace add drthyang/scattering-agent-tools     (or the local checkout's path)
/plugin install scattering-suite@scattering-agent-tools
```

For Claude Desktop or any other MCP client, `node plugin/bin/launch.mjs config` prints an
`mcpServers` block to paste into its configuration: the full path of the node that ran it (an app
started from the desktop may not find `node`, e.g. under nvm) and of the launcher, and an `env`
block with the variables above and `SCATTERING_FILE_ROOTS`, as set in the shell that ran it.

`SCATTERING_FILE_ROOTS` confines the files the servers may read: paths separated by `:` (`;` on
Windows), `~` expanded in each. Only MATERIA confines reads today; the launcher passes the list on
as `MATERIA_ROOTS` (unless that is set). With roots, MATERIA resolves a relative path against them,
not its working directory, and refuses a path outside them.

NEBULA3D's checks use its own Python (`<nebula3d>/.venv/bin/python`, or `NEBULA3D_PYTHON`).

When an app cannot start, its server is a stand-in whose one tool, `setup_status`, says what to fix
and which kind of problem it is (`structuredContent.kind`): `missing` (not cloned), `not-installed`
(no `node_modules`), `missing-file` (the checkout predates the server), `too-old` (below
`min_version`), `build-failed`, or `crashed` (the server stopped before it answered).

## suite.json

Per server: `app`, `role`, `github`, `dir` (its folder in `SCATTERING_REPOS`) and `dir_env`;
`status` (`ready` or `planned`); `runtime`; `requires` (paths the checkout must have);
`min_version`; `build` and `run` (argv; `node` and `npm` run on the launcher's own node);
`bundle`, a build output per launcher; `env`, variables for the server (the user's own win).
Placeholders: `{dir}` the checkout, `{pid}` the launcher's process id, `{bundle}` the bundle path,
`{file_roots}` the expanded `SCATTERING_FILE_ROOTS`. The launcher deletes its bundle when the
server exits, and those of launchers that are gone when it starts: MATERIA's evaluator workers
re-execute their bundle, so a later launch must never replace it.

## Tests

```bash
npm install
npm test                    # all of them, against the checkouts the launcher finds
npm run test:launcher       # the launcher alone; needs no app
npm run test:conformance    # MUST rules fail; SHOULD rules are listed per server
npm run test:contract       # .mcp.json, and every tool and argument the skills name
npm run test:docs           # every live tool is listed in CAPABILITIES.md
```

A test whose app is not cloned or not installed is skipped, with the launcher's explanation as the
reason. Any other problem fails it: a failed build, a version below `min_version`, a missing file,
a server that crashes. `SCATTERING_TEST_STRICT=1` fails skips too (for a machine that should have
every app). A failing test prints its servers' stderr. Node 22 or later.

## Working on it

- **A new tool in an app**: write it in the app (its `docs` say how), then run `npm test` here. If
  it overlaps another app's capability, update [CAPABILITIES.md](CAPABILITIES.md) first.
- **A new server** (NEBULA3D, the Workbench): follow [CONVENTIONS.md](CONVENTIONS.md), add its
  entry to `plugin/suite.json` with `"status": "ready"`, add it to `plugin/.mcp.json`, and add a
  hand-off test for each file it exchanges.
- **A new workflow**: a skill in `plugin/skills/<name>/SKILL.md` that names the tools by server, the
  checks between steps, and how to read the result. Write calls as `` `server` `tool {arg, arg: value}` ``
  (the server can be left out once the skill has named it): `npm run test:contract` checks every
  such tool and argument against the live servers. Add a hand-off test for any file it passes.
- **A breaking change in an app's tools**: raise `min_version` in `suite.json` so the launcher tells
  users with an older checkout to update. It gates only apps that declare a version (`package.json`
  or `pyproject.toml`); the NeXus Viewer declares none, so gate it with a file the needed change
  added, in `requires` (the launcher warns when `min_version` cannot be checked).

## History

This repository was first scattering-ai-sdk, a Python prototype of an AI reasoning layer for scattering
data (domain routing, diagnostics, reports). It is kept at the tag `prototype-final`. Its domain
notes live on in `plugin/knowledge/`. Its analysis code duplicated what the apps now own, so it was
removed ([CAPABILITIES.md](CAPABILITIES.md#not-carried-over)).
