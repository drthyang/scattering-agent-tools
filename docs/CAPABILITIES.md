# Capabilities: who owns what

Each capability has one owner, the app whose tool the skills call. The other apps may hold code for
it (for their own pages), but do not expose a competing tool; where two tools look alike, their
descriptions say which question each answers. Update this table when an app adds a tool that
touches another's row.

## Apps

| Server | App | Repository | Runtime | Agent tools |
| --- | --- | --- | --- | --- |
| `nexplan` | NEXPLAN, experiment planning at the SNS | drthyang/nexplan | TypeScript, Node | 26, MCP on stdio (`src/agent`, `src/mcp`) |
| `materia` | MATERIA, structure refinement | drthyang/web-refinement | TypeScript, Node | 41 and `read_ref`, MCP on stdio (`src/mcp`) |
| `nexus-viewer` | NeXus Viewer, reduced 3-D volumes | drthyang/neutron-nexus-viewer | JavaScript, Node | 10, MCP on stdio (`agent/`) |
| `nebula3d` | NEBULA3D, 3D-ΔPDF | drthyang/nebula3d | Python | no MCP server yet (planned); NEBULA Pilot in the browser has 22 tools and `read_skill` |
| `rmc-workbench` | RMCProfile Workbench | drthyang/rmc-toolkits | Python + React | no MCP server yet (planned); the Copilot in the browser has 14 tools (10 analyses, 3 view tools, `ask_user`) |

The in-browser assistants (MATERIA's chat, NEBULA Pilot, the Workbench copilot) stay in their apps:
they act on what the page has open. The MCP servers are the headless side that any agent can use.

## Tools by app

Counted on each app's `main`. `npm run test:docs` checks that every tool a ready server lists is
named here; the in-browser lists are kept by hand from the files named.

**NEXPLAN** (`nexplan`, 26): `load_structure`, `describe_structure`, `list_reflections`,
`reflection_info`, `powder_pattern`, `list_instruments`, `configure_instrument`,
`instrument_limits`, `compare_instruments`, `reciprocal_coverage`, `instrument_powder_pattern`,
`instrument_parameters`, `analyze_ub`, `mount_crystal`, `transform_ub`, `simulate_setting`,
`find_setting`, `simulate_plan`, `suggest_settings`, `suggest_binning`, `laue_symmetry`,
`bragg_positions`, `coverage_map`, `chopper_resolution`, `scattering_power`, `convert_units`.
Details: NEXPLAN's `docs/MCP.md`.

**MATERIA** (`materia`, 41 and `read_ref`): `parse_structure`, `parse_powder_data`,
`parse_instrument`, `build_refinement`, `check_fit_range`, `check_cell_symmetry`, `refine_powder`,
`assess_refinement`, `suggest_next_steps`, `interpret_structure`, `evaluate_pattern`,
`simulate_pattern`, `reflection_list`, `bond_geometry`, `analyze_site_symmetry`,
`find_unexplained_peaks`, `review_symmetry`, `search_propagation_vector`, `list_magnetic_subgroups`,
`allowed_moments`, `build_magnetic_model`, `rank_next_parameters`, `refine_magnetic_powder`,
`parse_single_crystal_data`, `write_single_crystal_data`, `expand_structure_supercell`,
`build_modulated_moment_model`, `merge_magnetic_supercell`, `parse_pdf_data`, `build_pdf_model`,
`refine_pdf`, `refine_pdf_boxcar`, `build_mpdf_model`, `refine_mpdf`, `compute_mpdf_components`,
`sample_posterior`, `compute_partial_pdf`, `calibrate_qdamp`, `build_distortion_modes`,
`build_symmetry_modes`, `export_bundle`; `read_ref` reads parts of earlier results. Details:
MATERIA's `docs/AGENT_TOOLS.md`.

**NeXus Viewer** (`nexus-viewer`, 10): `open_volume`, `describe_volume`, `set_symmetry`,
`build_mask`, `slice_volume`, `line_cut`, `powder_average`, `read_points`, `export_nebula3d`,
`close_volume`. Details: the viewer's `docs/AGENT.md`.

**NEBULA Pilot** (in NEBULA3D's web console, no MCP server; `web/src/llm/tools/`, 22 and
`read_skill`): `describe_dataset`, `current_view`, `measure_reciprocal_cut`, `measure_dpdf_cut`,
`assess_stage`, `texture_check`, `qmax_coverage`, `symmetry_check`, `dpdf_contrast`, `grain_check`,
`ub_check`, `radial_profile`, `line_profile`, `bragg_peaks`, `consistency_details`, `run_log`,
`compare_datasets`, `configure_settings`, `update_settings`, `run_pipeline`, `tune_pipeline`,
`show_in_viewer`.

**RMCProfile Workbench Copilot** (in the Workbench page, no MCP server; 14): analyses `read_run_data`,
`assess_convergence`, `find_gr_peaks`, `compare_fit` (`web_app/frontend/src/llm/copilot/runTools.js`), `list_sites`,
`analyze_displacement_directions`, `compute_bond_angles`, `analyze_clusters`, `analyze_modulations`,
`detect_symmetry` (`web_app/frontend/src/copilotTools.js`); view tools `highlight_cards`, `orient_3d_view`,
`current_view`; and `ask_user`.

## Ownership

| Capability | Owner | Tools | Others that hold code for it |
| --- | --- | --- | --- |
| Read a CIF / mCIF for refinement | materia | `parse_structure` | nexplan reads CIFs for planning (`load_structure`): use it for planning questions only |
| Reflection lists, structure factors | materia for refinement; nexplan for planning on an instrument | `reflection_list`; `list_reflections`, `reflection_info` | nexplan vendors part of MATERIA's core (`materia-sync`: math, cells, symmetry, profiles) but computes its own structure factors, so details can differ; quote MATERIA's for refinement |
| Powder pattern of a model | materia | `simulate_pattern`, `evaluate_pattern` | nexplan's `powder_pattern`, `instrument_powder_pattern` answer "what will this instrument record" |
| Refinement (Rietveld, PDF, mPDF, magnetic, modes) | materia | `check_fit_range`, `build_*`, `refine_*`, `assess_refinement`, `review_symmetry`, … | — |
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
| RMCProfile run analysis (convergence, fit comparison, partial g(r), bond angles, displacements, clusters, modulations) | rmc-workbench | planned (in the page's Copilot today) | — |

## Not carried over

The Python prototype that used to live here had its own volume loading, line
cuts, 3D-ΔPDF, CIF and symmetry tools. They duplicated the owners above and are gone. Three of its
capabilities have no owner yet; add them to an app (or a small server here) only when a skill needs
them: temperature-series peak tracking and transition detection, OPTIMADE structure search, and
pseudosymmetry scans.
