---
name: bragg-node-audit
description: Check a reduced single-crystal volume against a structure — is there intensity at forbidden Bragg nodes, satellites, or unexplained peaks? Uses the NeXus Viewer (volume) and NEXPLAN (structure, Laue group, nodes). Use when someone asks whether a volume shows superlattice peaks, a lower symmetry, λ/2 or multiple scattering, or wants Bragg positions marked on their data.
---

# Bragg-node audit of a 3-D volume

Combines `nexus-viewer` (the data) and `nexplan` (what the structure allows). Ids do not cross
servers: the volume's grid goes to NEXPLAN as JSON, the node list comes back as a file.

## Steps

1. **Open the volume** — `nexus-viewer` `open_volume {path}`. Keep `volume_id`, `cell`, and
   `nexplan_grid`. If `nexplan_grid.unavailable`, stop: the axes are not along hkl, or the bins are
   not uniform.
2. **The grid for NEXPLAN** — `grid` is `{axes, binning, q_convention}`: `axes` and `binning` from
   `nexplan_grid`, and only those (NEXPLAN refuses unknown keys). `q_convention` is `inelastic` for
   SNS MDNorm data reduced with Mantid's default, `crystallography` for X-ray reductions or when the
   user says so. If unsure, ask; a wrong choice mirrors h → −h, which matters for
   non-centrosymmetric questions only, but say which you used.
3. **Load the structure** — `nexplan` `load_structure {path}` (a CIF). If it answers `needs_choice`,
   call again with the `block` or `setting` it lists. Check its cell against the volume's `cell`
   (within about 1 %); if they differ by a supercell or another setting, say so before going on.
4. **Laue group** — `nexplan` `laue_symmetry {structure_id, grid}`. If `grid.compatible` is false,
   report its `problems` and continue without symmetry. Otherwise `nexus-viewer`
   `set_symmetry {volume_id, laue_class: nexus_viewer_preset}`, or
   `set_symmetry {volume_id, operations: symmetry_ops}` when there is no preset. If it returns a
   `warning` about the cell metric, the operations do not fit this volume's setting: turn averaging
   off with `set_symmetry {volume_id, operations: "none"}`, say so, and continue unsymmetrized.
5. **Optional mask** — `build_mask {volume_id, edge_radius: 1}` removes the bright coverage-edge
   rims; add `outlier_k: 5` only when a symmetry group is set (it compares symmetry equivalents). To
   show what the mask takes out, `slice_volume {volume_id, removed_only: true}`.
6. **Nodes** — `nexplan` `bragg_positions {structure_id, grid, limit: 10, output_path: <volume stem>_nodes.json}`.
   The file holds every node; the reply lists only the first `limit` (the default, 200, is about
   26,000 characters). Add `propagation_vectors` for satellites, and a smaller `d_min` if it reports
   nodes beyond it.
7. **Values at the nodes** — `nexus-viewer` `read_points {volume_id, points_path, box: 1, limit: 10}`.
   Its `summary` covers every node, by class; read that, not the rows (add `output_path` for all of
   them as CSV). Compare `median_value` at `systematic absence` against `present`, and against
   `median_box_median` (the local background). A `warning` means nodes lie on bin edges (a grid
   with edges at integers): there each value is the mean of the voxels that meet at the node (the
   point's `note` says so), which flattens a sharp peak. Say so; a grid with bin centres on the
   nodes (edges moved by half a bin) reads them directly.
8. **Look** — `slice_volume {volume_id, fixed_axis: "L", center: 1}` (h k 1, say) through a plane
   holding the suspicious nodes. Inspect the image before concluding.

## Reading the result

- Forbidden nodes at background (value ≈ box median): the space group's absences hold.
- Forbidden nodes clearly above background: the candidates are
  - **λ/2 contamination**, for monochromatic data only (X-ray, or a reactor's monochromated
    beam): check whether 2h 2k 2l is strong (behind a Si(111) monochromator the harmonic is λ/3,
    so 3h 3k 3l). Time-of-flight data (SNS) sorts wavelengths by arrival time and has none.
  - **multiple scattering**: sharp, often only in some members of an orbit; compare with symmetry
    off.
  - a **lower true symmetry**, or a **superlattice**.

  Say which evidence points where; do not pick one without it.
- Strong intensity away from every node: diffuse scattering or another phase; offer a line cut
  through it, `line_cut {volume_id, start, end}`. Its ends move to voxel centres (`snapped` says
  where to); a `warning` about an even-bin `step` gives the odd steps to use instead.
- Report numbers with what produced them: the symmetry and mask in effect (every result states
  them), the Q convention, d_min.

Background: `../../knowledge/scattering/symmetry_and_phase_transitions.md`,
`../../knowledge/scattering/contaminant_signals.md`.
