# scattering-agent-tools

**The agent layer of the scattering apps.** One Claude Code plugin gives an agent the tools of every
app, NEXPLAN (experiment planning), MATERIA (refinement) and the NeXus Viewer (3-D volumes), with
NEBULA3D (3D-ΔPDF) and the RMCProfile Workbench to come, plus the skills that combine them, the
rules they all follow, and tests that hold them to those rules.

```text
Each app owns its science and its tools.  This repository owns how they fit together.
```

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
  - the **[conventions](docs/CONVENTIONS.md)**: the rules every server follows.
  - the **[capability map](docs/CAPABILITIES.md)**: one owner for each overlapping feature.
  - the **tests**: conformance and hand-off checks across the real servers.

Day to day, agent work happens here. An app changes only when one of its tools does.

## Layout

| Path | What it is |
| --- | --- |
| `plugin/` | The Claude Code plugin `scattering-suite` |
| `plugin/suite.json` | The apps: where their checkouts are, how to build and run each server, which version these skills expect, which are planned |
| `plugin/bin/launch.mjs` | Starts one server from its app's checkout (no dependencies); `status` and `config` subcommands |
| `plugin/.mcp.json` | The servers the plugin registers, all through the launcher |
| `plugin/skills/` | Cross-app workflows: `bragg-node-audit`, `volume-to-delta-pdf`, `powder-plan-to-refinement` |
| `plugin/knowledge/` | Domain notes the skills cite (diffuse scattering, PDF conventions, RMC failure modes, …) |
| `docs/CONVENTIONS.md` | The tool contract: names, arguments, results, errors, files, physics conventions at the boundaries |
| `docs/CAPABILITIES.md` | Who owns which capability, and how overlaps are resolved |
| `tests/` | `conformance.test.mjs` (every server against the conventions) and `handoff.test.mjs` (files and values passed between apps) |
| `.claude-plugin/marketplace.json` | Makes this repository a plugin marketplace |

## Install

The apps are expected side by side in one folder (default `~/GitHub`; set `SCATTERING_REPOS`
otherwise, or `NEXPLAN_DIR`, `MATERIA_DIR`, `NEXUS_VIEWER_DIR` per app), each with `npm install`
done once.

```bash
node plugin/bin/launch.mjs status     # which apps are found, their versions, what is missing
```

In Claude Code:

```text
/plugin marketplace add drthyang/scattering-agent-tools     (or the local checkout's path)
/plugin install scattering-suite@scattering-agent-tools
```

For Claude Desktop or any other MCP client, `node plugin/bin/launch.mjs config` prints an
`mcpServers` block with absolute paths to paste into its configuration.

Files the servers may read can be confined with `SCATTERING_FILE_ROOTS` (paths separated by `:`).
NEBULA3D's checks use its own Python (`<nebula3d>/.venv/bin/python`, or `NEBULA3D_PYTHON`).

## Tests

```bash
npm install
npm test                    # conformance + hand-offs, against the checkouts the launcher finds
npm run test:conformance    # MUST rules fail; SHOULD rules are listed per server
```

A test whose apps are not checked out is skipped, with the launcher's explanation as the reason.

## Working on it

- **A new tool in an app**: write it in the app (its `docs` say how), then run `npm test` here. If
  it overlaps another app's capability, update [CAPABILITIES.md](docs/CAPABILITIES.md) first.
- **A new server** (NEBULA3D, the Workbench): follow [CONVENTIONS.md](docs/CONVENTIONS.md), add its
  entry to `plugin/suite.json` with `"status": "ready"`, add it to `plugin/.mcp.json`, and add a
  hand-off test for each file it exchanges.
- **A new workflow**: a skill in `plugin/skills/<name>/SKILL.md` that names the tools by server, the
  checks between steps, and how to read the result. Add a hand-off test for any file it passes.
- **A breaking change in an app's tools**: raise `min_version` in `suite.json` so the launcher tells
  users with an older checkout to update.

## History

Until October 2026 this repository was scattering-ai-sdk, a Python prototype of an AI reasoning layer for scattering
data (domain routing, diagnostics, reports). It is kept at the tag `prototype-final`. Its domain
notes live on in `plugin/knowledge/`. Its analysis code duplicated what the apps now own, so it was
removed ([CAPABILITIES.md](docs/CAPABILITIES.md#not-carried-over)).

## License

MIT. The apps the plugin starts are separate programs under their own licenses (AGPL-3.0): they
run as their own processes and this repository contains none of their code.
