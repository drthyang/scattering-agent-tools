# Tool conventions

The rules every app's MCP server follows, so an agent can move between them without relearning
each one. `tests/conformance.test.mjs` checks the ones marked **(checked)** against every server the
launcher can start: MUST rules fail the test, SHOULD rules are reported per server.

## Where tools live

- **A tool lives in the app whose code it calls**, in the same repository, and changes in the same
  commit as that code. The app's own tests cover it. This repository holds no tool implementations.
- **A tool calls the app's code, never a copy of it**, so the agent's numbers are the app's numbers.
- **One owner per capability.** When two apps can compute the same thing, [CAPABILITIES.md](CAPABILITIES.md)
  names the one whose tool the skills use; the other app keeps its code but does not expose a second
  tool for it, or scopes its tool so the descriptions say when to use which.
- **Tools are single capabilities; sequences are skills.** A tool does one thing and returns; the
  order of calls across tools and apps lives in `plugin/skills/`.

## Names and descriptions

- A ready server lists at least one tool. **(checked, MUST)**
- Tool names are `snake_case`, at most 64 characters, verb first (`open_volume`, `refine_powder`). **(checked, MUST)**
- Server names are the app's short name in kebab case (`nexplan`, `materia`, `nexus-viewer`,
  `nebula3d`, `rmc-workbench`); clients prefix tools with them, so tool names need not repeat the app.
- A description says what the tool does, what it returns, and what it does not do, for a model that
  has not seen the app (at least 40 characters). **(checked, MUST)** A title for the UI. **(checked, SHOULD)**
- The server's `instructions` say how its tools fit together and its conventions. **(checked, SHOULD)**

## Arguments

- An object schema. **(checked, MUST)** Unknown arguments are refused, so a misspelt field is an
  error rather than silently ignored (`z.strictObject`, `additionalProperties: false`). **(checked, SHOULD)**
- Units are in the field name or its description (`ei_mev`, `d_min` in Å); angles in degrees.
- Heavy objects stay in the server and are named by an id the caller chooses or receives
  (`structure_id`, `volume_id`); within one server a tool may also accept a reference to an earlier
  result (MATERIA's `{"ref": "#3/structure"}`). **Ids and refs never cross servers.**
- Files are given as paths: `~` is the home directory. A relative path starts from the server's
  working directory, which the launcher keeps as the client's, except in a server that confines
  reads to roots: MATERIA, with roots set, resolves relative paths against its roots. A path handed
  from one server to another is best absolute.

## Results

- JSON text content (and `structuredContent` where the SDK makes it easy). Numbers to 6–7 significant
  figures, units stated, non-finite values as `null`. Images (a slice to look at) as MCP image content
  next to the JSON.
- Long lists are cut to a `limit` with a note saying how many more there are; the full list goes to
  a file. Keep a result under about 8,000 characters.
- Every result that depends on session state says which state it used (the structure, instrument
  settings, symmetry, mask).
- A failure is an MCP tool result with `isError: true` whose first line says what to change, then
  the details (candidates, ids open) as JSON. Never a protocol error for bad input, never a silent
  default. **(checked, MUST)**
- Annotations: `readOnlyHint` (true only when the tool changes no files and no session state:
  opening, closing or re-averaging a volume is not read-only), `destructiveHint`,
  `openWorldHint: false` for local computation. **(checked, SHOULD)**

## Files

- **Hand-offs between apps go through files**, in the receiving app's own format: `.instprm` for
  MATERIA, NeXus/HDF5 for the NeXus Viewer and NEBULA3D, `.npy` for masks, CSV or JSON for lists.
- A file written for another app is complete without the session that wrote it: provenance (app,
  version, tool, inputs, date) in its header or attributes, and a schema tag with a version for JSON
  (`"schema": "nexplan-bragg-nodes/1"`). Changing a schema means a new version number, and the
  reading app accepts the old one or says why not.
- JSON results are rounded; **files keep full precision**. Compare a hand-off file with what the
  reader parses, not with the rounded JSON.
- A tool that writes takes `output_path` (one file) or `out_dir` (several), and **does not replace an
  existing file unless `overwrite: true`**. **(checked, SHOULD)**
- Reading: a server may confine reads to roots. `SCATTERING_FILE_ROOTS` (paths separated by `:`,
  `;` on Windows; `~` expanded in each) sets them for every server that confines reads, which today
  is MATERIA only: the launcher passes it on as `MATERIA_ROOTS`. With roots, MATERIA resolves a
  relative path against them and refuses a path outside them; without, it reads inside its working
  directory (not when that is `/` or the home folder).

## Physics conventions at the boundaries

State these in every result and file where they matter; the hand-off tests check the ones in use.

| Quantity | Convention | Watch for |
| --- | --- | --- |
| UB | Mantid and ISAW files: q = UB·h **without** 2π. NEBULA3D in memory and in `ub_matrix`: **with** 2π. | Results give both or name which (`ub`, `ub_times_2pi`). |
| Q | \|Q\| = 2π/d in Å⁻¹ everywhere. | NEXPLAN's q in UB·h is without 2π. |
| Q convention of a volume | Mantid's default `inelastic` labels the crystallographic h as −h; X-ray reductions use `crystallography`. | Grids passed to NEXPLAN carry `q_convention`. |
| Array order of a volume | Mantid MDHisto storage `(n2, n1, n0)`, axis 0 fastest (NeXus Viewer, Mantid). NEBULA3D `HKLVolume`: `(nH, nK, nL)`. | `.npy` writers name the order (`array_order`). |
| Symmetry operations | Triplets on hkl, `"h+k,-h,l; -k,-h,-l"`; x,y,z triplets are converted with R = Wᵀ. | NEBULA3D's `/entry@symmetry_ops`, the NeXus Viewer's field and NEXPLAN's `laue_symmetry` all use them. |
| Pair distribution functions | G(r) = 4πρ₀r[g(r)−1] (PDFfit), Keen's G_K(r) and D(r) in the RMCProfile Workbench, F(Q) = Q[S(Q)−1]. | Name the function in field names and file headers; convert only with the Workbench's transforms. |
| Instrument profiles | GSAS-II `.instprm` as the exchange format; MATERIA's `InstrumentParameters` JSON for its tools. | NOMAD banks carry no exponential terms (NEXPLAN says so). |

## Status

What the conformance test reports against each app's `main`:

| Server | Tools | Open SHOULD items |
| --- | --- | --- |
| nexplan | 26 | 9 tools write files without `overwrite` (they replace files today) |
| materia | 41 and `read_ref` | no `readOnlyHint` annotations; schemas accept unknown arguments (raw zod shapes, not strict objects) |
| nexus-viewer | 10 | none |
| nebula3d | — | no MCP server yet ([CAPABILITIES.md](CAPABILITIES.md)) |
| rmc-workbench | — | no MCP server yet |
