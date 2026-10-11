---
name: bragg-node-audit
description: Check a reduced single-crystal volume against a structure — is there intensity at forbidden Bragg nodes, satellites, or unexplained peaks? Uses the NeXus Viewer (volume) and NEXPLAN (structure, Laue group, nodes). Use when someone asks whether a volume shows superlattice peaks, a lower symmetry, λ/2 or multiple scattering, or wants Bragg positions marked on their data.
---

# Bragg-node audit of a 3-D volume

Combines `nexus-viewer` (the data) and `nexplan` (what the structure allows). Ids do not cross
servers: the volume's grid goes to NEXPLAN as JSON, the node list comes back as a file.

## Steps

1. **Open the volume** — `nexus-viewer` `open_volume {path}`. Keep `volume_id`, `cell`, and
   `nexplan_grid` (its `axes` and `binning`). If `nexplan_grid.unavailable`, stop: the axes are not
   along hkl, or the bins are not uniform.
2. **Settle the Q convention** — add `q_convention` to the grid: `inelastic` for SNS MDNorm data
   reduced with Mantid's default, `crystallography` for X-ray reductions or when the user says so.
   If unsure, ask; a wrong choice mirrors h → −h, which matters for non-centrosymmetric questions
   only, but say which you used.
3. **Load the structure** — `nexplan` `load_structure {path}` (a CIF). If it answers `needs_choice`,
   call again with the block or setting it lists. Check its cell against the volume's `cell`
   (within about 1 %); if they differ by a supercell or another setting, say so before going on.
4. **Laue group** — `nexplan` `laue_symmetry {structure_id, grid}`. If `grid.compatible` is false,
   report its `problems` and continue without symmetry. Otherwise `nexus-viewer` `set_symmetry` with
   `laue_class: nexus_viewer_preset`, or `operations: symmetry_ops` when there is no preset. Note any
   `warning` about the metric.
5. **Optional mask** — `build_mask {edge_radius: 1}` removes the bright coverage-edge rims; add
   `outlier_k: 5` only after symmetry is set. Look at a slice with `removed_only: true` if the user
   wants to see what it takes out.
6. **Nodes** — `nexplan` `bragg_positions {structure_id, grid, output_path: <volume stem>_nodes.json}`;
   add `propagation_vectors` for satellites, and a smaller `d_min` if it reports nodes beyond it.
7. **Values at the nodes** — `nexus-viewer` `read_points {volume_id, points_path, box: 1}`. Compare
   the per-class `summary`: `median_value` at `systematic absence` against `present`, and against
   `median_box_median` (the local background).
8. **Look** — `slice_volume` through a plane holding the suspicious nodes (e.g. `fixed_axis: "L"`,
   `center: 1` for h k 1). Inspect the image before concluding.

## Reading the result

- Forbidden nodes at background (value ≈ box median): the space group's absences hold.
- Forbidden nodes clearly above background: candidates are λ/2 contamination (check whether 2h 2k 2l
  is strong), multiple scattering (sharp, often only some members of an orbit — compare with
  symmetry off), a lower true symmetry, or a superlattice. Say which evidence points where; do not
  pick one without it.
- Strong intensity away from every node: diffuse scattering or another phase; offer a line cut
  through it (`line_cut`).
- Report numbers with what produced them: the symmetry and mask in effect (every result states
  them), the Q convention, d_min.

Background: `../../knowledge/scattering/symmetry_and_phase_transitions.md`,
`../../knowledge/scattering/contaminant_signals.md`.
