# scattering-agent-tools

A Claude Code plugin that gives an AI agent the tools of the scattering apps, NEXPLAN, MATERIA and
the NeXus Viewer, and the skills that combine them.

## What it does

- **One install for every app's tools.** The `scattering-suite` plugin starts each app's MCP server
  from the app's own checkout, so the tools stay in their apps and give the apps' numbers.
- **Cross-app skills:** a Bragg-node audit of a volume, a volume prepared for a 3D-ΔPDF, and a powder
  instrument choice taken to a refinement.
- **One set of rules** for every server ([conventions](docs/CONVENTIONS.md)), and one owner for each
  feature the apps share ([capabilities](docs/CAPABILITIES.md)).
- **Tests across the real servers:** conformance to the rules, the tools the skills call, and the
  files the apps hand each other.
- **Failures that say what to fix:** when an app is missing, too old, fails to build or crashes at
  startup, the agent gets a tool that says what to fix.

## Quick start

With the apps cloned side by side in `~/GitHub` (or `SCATTERING_REPOS`) and `npm install` run in each:

```text
/plugin marketplace add drthyang/scattering-agent-tools
/plugin install scattering-suite@scattering-agent-tools
```

`node plugin/bin/launch.mjs status` shows which apps it finds and whether they build. Other MCP
clients, environment variables and tests: [Development](docs/DEVELOPMENT.md).

## The agent and tools

The plugin registers three MCP servers: NEXPLAN (26 tools), MATERIA (41 tools and `read_ref`) and the
NeXus Viewer (10 tools). Every tool by app, and which app owns what, is in
[CAPABILITIES.md](docs/CAPABILITIES.md); the skills are in [`plugin/skills/`](plugin/skills/).

## Status

Three servers are ready. NEBULA3D and the RMCProfile Workbench have in-browser assistants but no MCP
server yet; both are planned. Open conformance items per server are listed in
[CONVENTIONS.md](docs/CONVENTIONS.md#status).

## Documentation

- [Capabilities](docs/CAPABILITIES.md): the apps, every tool, and one owner for each capability
- [Conventions](docs/CONVENTIONS.md): the rules every server follows, and where each one stands
- [Development](docs/DEVELOPMENT.md): why the repository is split this way, the layout, installing,
  tests, adding a tool, server or skill, and the history

## License

MIT. The apps the plugin starts are separate programs under their own licenses (AGPL-3.0): they
run as their own processes and this repository contains none of their code.

*This project is personal work, developed and maintained in my personal capacity.*
