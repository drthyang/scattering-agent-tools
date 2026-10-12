---
name: volume-to-delta-pdf
description: Prepare a reduced 3-D single-crystal volume for a 3D-ΔPDF in NEBULA3D — choose and check the symmetry, mask detector-edge artifacts, inspect slices, and export the file NEBULA3D reads. Uses the NeXus Viewer and NEXPLAN. Use when someone wants a ΔPDF from MDNorm or X-ray volume data, or asks how to clean a volume before NEBULA3D.
---

# From a reduced volume to a NEBULA3D input

## Steps

1. **Open** — `nexus-viewer` `open_volume {path}`. Check: hkl axes (`space` is reciprocal), a `cell`
   (from the UB), uniform bins, a bin centred at 0 on each axis (not a bin edge at 0), and whether
   each axis range is near-symmetric about 0 (NEBULA3D puts Q = 0 at the centre of a bin; the export
   pads, but padding beyond 3× fails).
2. **Symmetry** — with a CIF: `nexplan` `load_structure {path}`, then
   `laue_symmetry {structure_id, grid}` with `grid` = `{axes, binning, q_convention}`: `axes` and
   `binning` from `open_volume`'s `nexplan_grid`, and only those (NEXPLAN refuses unknown keys), and
   `q_convention` as in the bragg-node-audit skill. Then `nexus-viewer`
   `set_symmetry {volume_id, laue_class: nexus_viewer_preset}`. Without a CIF, ask for the Laue
   class, or propose one from the cell and confirm. A `warning` about the metric means the setting
   is wrong: turn averaging off (`set_symmetry {volume_id, operations: "none"}`) and resolve the
   setting before exporting.
3. **Look before masking** — `slice_volume {volume_id, fixed_axis: "L"}` (the slab at 0), and the
   same with K and H. Look for bright rims at the coverage edges, powder rings (aluminium, copper,
   steel), and streaks.
4. **Mask** — `build_mask {volume_id, edge_radius: 1}`; if rims remain, `edge_radius: 2`. With
   symmetry set, `outlier_k: 5` removes isolated spikes; lower k removes more and starts eating real
   peaks. Check with `slice_volume {volume_id, removed_only: true}` that the removed voxels are
   artifacts, and report `removed_fraction` (above ~15 % deserves a sentence) and, with an outlier
   cut, `outlier_sigma` (the σ it used: from the file's uncertainties, or counting statistics).
5. **Check the averaged data** — slices again, and `powder_average {volume_id}` for rings (a sharp
   line at a contaminant's |Q| that survives masking is a ring; NEBULA3D's ring stage removes it).
6. **Export** — `export_nebula3d {volume_id, output_path: <stem>_sym<group>.nxs}`, with the group
   written without `/` (`_sym6mmm` for 6/mmm, `_sym4mmm` for 4/mmm): a `/` would put the file in a
   subfolder. A grid with a bin edge at 0 is refused, and the error gives the binning with the
   edges moved by half a bin: reduce the data again with that binning (Mantid MDNorm) and start
   over. Never resample or interpolate the volume to move it; that smooths the data. Report
   `shape_hkl`, `padded`, `valid_fraction`, and the attributes written (symmetry, mask,
   `uncertainties`). With `sigma: true` the file carries `/entry/sigma`, the σ of each voxel's
   symmetry-averaged value from the volume's own uncertainties; a volume without them gets none,
   and the `uncertainties` attribute says NEBULA3D takes √|data|.
7. **NEBULA3D** — until its MCP server exists: tell the user to put the file in NEBULA3D's data
   folder and open it in its web console, or run the pipeline in batch
   (`DATA_FILE=<file> python examples/run_pipeline.py` in the nebula3d checkout). The symmetry
   operations travel in `/entry@symmetry_ops`.

## Pitfalls

- Averaging with the wrong group invents symmetry the crystal does not have; the metric check
  catches a wrong setting, not a wrong (lower) true symmetry. If the question is about symmetry
  breaking, export once with and once without averaging.
- Masks act before averaging; the export fills masked voxels from their equivalents, and leaves
  voxels with none as 0 with mask 0 for NEBULA3D's backfill.
- Compare temperatures only with the same symmetry and mask set on each volume.

Background: `../../knowledge/scattering/diffuse_scattering_and_deltapdf.md`.
