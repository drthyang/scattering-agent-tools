# Capabilities: who owns what

Each capability has one owner, the app whose tool the skills call. The other apps may hold code for
it (for their own pages), but do not expose a competing tool; where two tools look alike, their
descriptions say which question each answers. Update this table when an app adds a tool that
touches another's row.

## Apps

| Server | App | Repository | Runtime | Agent tools |
| --- | --- | --- | --- | --- |
| `nexplan` | NEXPLAN, experiment planning at the SNS | drthyang/nexplan | TypeScript, Node | 26, MCP on stdio (`src/agent`, `src/mcp`) |
| `materia` | MATERIA, structure refinement | drthyang/web-refinement | TypeScript, Node | 40, MCP on stdio (`src/mcp`); `materia-live` drives the open page |
| `nexus-viewer` | NeXus Viewer, reduced 3-D volumes | drthyang/neutron-nexus-viewer | JavaScript, Node | 10, MCP on stdio (`agent/`) |
| `nebula3d` | NEBULA3D, 3D-ΔPDF | drthyang/nebula3d | Python | planned; today an in-browser assistant (NEBULA Pilot) |
| `rmc-workbench` | RMCProfile Workbench | drthyang/rmc-toolkits | Python + React | planned; today an in-browser copilot |

The in-browser assistants (MATERIA's chat, NEBULA Pilot, the Workbench copilot) stay in their apps:
they act on what the page has open. The MCP servers are the headless side that any agent can use.

## Ownership

| Capability | Owner | Tools | Others that hold code for it |
| --- | --- | --- | --- |
| Read a CIF / mCIF for refinement | materia | `parse_structure` | nexplan reads CIFs for planning (`load_structure`): use it for planning questions only |
| Reflection lists, structure factors | materia for refinement; nexplan for planning on an instrument | `reflection_list`; `list_reflections`, `reflection_info` | nexplan vendors part of MATERIA's core (`materia-sync`: math, cells, symmetry, profiles) but computes its own structure factors, so details can differ; quote MATERIA's for refinement |
| Powder pattern of a model | materia | `simulate_pattern`, `evaluate_pattern` | nexplan's `powder_pattern`, `instrument_powder_pattern` answer "what will this instrument record" |
| Refinement (Rietveld, PDF, mPDF, magnetic, modes) | materia | `refine_*`, `build_*`, `assess_refinement`, … | — |
| Space groups, subgroups, magnetic groups | materia | `analyze_site_symmetry`, `list_magnetic_subgroups`, `build_symmetry_modes` | the Workbench finds space groups of RMC boxes (`detect_symmetry`, in the page) |
| Laue group as hkl operations, for averaging a volume | nexplan | `laue_symmetry` | — |
| Instruments, coverage, resolution, planning | nexplan | `instrument_limits`, `compare_instruments`, `simulate_plan`, `suggest_settings`, `chopper_resolution`, … | — |
| GSAS-II instrument parameters from an SNS bank | nexplan | `instrument_parameters` | MATERIA parses them (`parse_instrument`) |
| Bragg nodes on a volume's grid (allowed, forbidden, satellites) | nexplan | `bragg_positions` | NEBULA3D fits Bragg peaks in data (its pipeline) |
| Predicted coverage of a measurement on a grid | nexplan | `coverage_map` | NEBULA3D checks the coverage it was given (`qmax_coverage`, in the page) |
| Open a reduced 3-D volume; slices, line cuts, I(Q), values at points | nexus-viewer | `open_volume`, `slice_volume`, `line_cut`, `powder_average`, `read_points` | NEBULA3D has slices, line and radial profiles of its own stages; they stay stage diagnostics |
| Symmetry averaging and artifact masks on a volume | nexus-viewer | `set_symmetry`, `build_mask` | NEBULA3D applies `symmetry_ops` and trims coverage edges inside its pipeline |
| Volume → NEBULA3D input | nexus-viewer | `export_nebula3d` | — |
| 3D-ΔPDF pipeline and its stage diagnostics | nebula3d | planned | — |
| S(Q) / F(Q) / G(r) conversions and scaling (Keen's conventions) | rmc-workbench | planned (`rmc-autoscale` and `transforms.py` today) | MATERIA transforms S(Q) for its PDF fits |
| RMCProfile run analysis (convergence, partial g(r), bond angles, displacement PCA) | rmc-workbench | planned (in the page's copilot today) | — |

## Not carried over

The Python prototype that used to live here (tag `prototype-final`) had its own volume loading, line
cuts, 3D-ΔPDF, CIF and symmetry tools. They duplicated the owners above and are gone. Three of its
capabilities have no owner yet; add them to an app (or a small server here) only when a skill needs
them: temperature-series peak tracking and transition detection, OPTIMADE structure search, and
pseudosymmetry scans.
