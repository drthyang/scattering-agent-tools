---
name: volume-to-delta-pdf
description: Prepare a reduced 3-D single-crystal volume for a 3D-ΔPDF in NEBULA3D — choose and check the symmetry, mask detector-edge artifacts, inspect slices, and export the file NEBULA3D reads. Uses the NeXus Viewer and NEXPLAN. Use when someone wants a ΔPDF from MDNorm or X-ray volume data, or asks how to clean a volume before NEBULA3D.
---

# From a reduced volume to a NEBULA3D input

## Steps

1. **Open** — `nexus-viewer` `open_volume {path}`. Check: hkl axes (`space` is reciprocal), a `cell`
   (from the UB), uniform bins, and whether each axis range is near-symmetric about 0 (NEBULA3D puts
   Q = 0 at the centre; the export pads, but padding beyond 3× fails).
2. **Symmetry** — with a CIF: `nexplan` `load_structure`, then `laue_symmetry {structure_id, grid}`
   with `open_volume`'s `nexplan_grid` (+ `q_convention`), then `nexus-viewer` `set_symmetry`. Without
   a CIF, ask for the Laue class, or propose one from the cell and confirm. A `warning` about the
   metric means the setting is wrong: stop and resolve it.
3. **Look before masking** — `slice_volume` on the three planes through 0 (`fixed_axis` L, K, H).
   Look for bright rims at the coverage edges, powder rings (aluminium, copper), and streaks.
4. **Mask** — `build_mask {edge_radius: 1}`; if rims remain, `edge_radius: 2`. With symmetry set,
   `outlier_k: 5` removes isolated spikes; lower k removes more and starts eating real peaks. Check
   with `slice_volume {removed_only: true}` that the removed voxels are artifacts, and report
   `removed_fraction` (above ~15 % deserves a sentence).
5. **Check the averaged data** — slices again, and `powder_average` for rings (a sharp line at a
   contaminant's |Q| that survives masking is a ring; NEBULA3D's ring stage removes it).
6. **Export** — `export_nebula3d {volume_id, output_path: <stem>_sym<group>.nxs}`. Report
   `shape_hkl`, `padded`, `valid_fraction`, and the attributes written (symmetry, mask).
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
