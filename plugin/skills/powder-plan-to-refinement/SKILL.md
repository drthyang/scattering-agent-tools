---
name: powder-plan-to-refinement
description: Go from a structure and an SNS powder instrument choice to a refinement-ready setup — which NOMAD bank or POWGEN frame resolves the lines that matter, its GSAS-II instrument parameters, and a MATERIA refinement on them. Uses NEXPLAN and MATERIA. Use when someone asks which bank or frame to refine, needs an .instprm for NOMAD or POWGEN, or wants to start a Rietveld fit of SNS data.
---

# From instrument choice to a MATERIA refinement

## Where the files go

MATERIA reads files only inside its data folders. With `SCATTERING_FILE_ROOTS` set, those are the
roots: a relative path is looked up in each root (not in the working directory), and a path outside
them is refused. Without it, the folder is the working directory the servers share (none when that
is `/` or the home folder). NEXPLAN writes a relative `output_path` into its working directory. So
write hand-off files by absolute path inside the first root when roots are set, otherwise inside
the working directory, and give MATERIA the same absolute path. If MATERIA refuses a path, its
error lists its data folders: write the file there, or ask the user to set `SCATTERING_FILE_ROOTS`.

## Steps

1. **Structure** — `nexplan` `load_structure {path}` (the CIF), for planning.
2. **Which bank or frame** — `nexplan` `compare_instruments {sample, structure_id, d_min, resolve_pairs}`
   with the goal (the d range, the line pairs that must be resolved), or
   `instrument_powder_pattern {structure_id, instrument, bank | frame}` on a candidate to see which
   lines it resolves and their FWHM. Name the bank (NOMAD 0–5, as Mantid numbers them) or frame
   (POWGEN centre wavelength) and why.
3. **Instrument parameters** — `nexplan` `instrument_parameters {instrument, bank | frame, output_path: <folder>/<name>.instprm}`,
   with the folder as above. Keep `d_range` and `tof_range_us`: the whole range the bank records.
   For NOMAD the file has no exponential terms; say that MATERIA starts them from its defaults.
4. **Into MATERIA** — `materia` `parse_instrument {path}` (the same .instprm),
   `parse_structure {path}` (the same CIF, also inside a data folder), and
   `parse_powder_data {path, instrument}` for the measured pattern, with `instrument` the
   `parse_instrument` result, so the radiation and the time-of-flight calibration are right. Note the
   pattern's `summary`: `xUnit`, `xMin`, `xMax`.
5. **Fit range** — on the pattern's own axis, in its `xUnit` (time of flight in µs, d in Å, or 2θ in
   degrees). NEXPLAN's `d_range` and `tof_range_us` bound it but are no choice: the bank's data
   already spans them, so a fit restricted to them is the whole pattern. Choose from the data: drop
   the ends where the counts fall to noise or the bank's edge cuts peaks, and keep the d range that
   holds the lines the question needs. On a time-of-flight axis a d limit is at
   TOF = zero + difC·d + difA·d² + difB/d (the `parse_instrument` values).
6. **Refine** — `materia` `build_refinement {structure, pattern, instrument}`, then
   `refine_powder {structure, pattern, parameters, bindings, profile, instrument, fitRange, free}`
   with `fitRange` from step 5, then `assess_refinement {result, parameters, observationCount, residual}`
   and `suggest_next_steps {assessment}`; follow MATERIA's own refinement skill if the project has
   one.

## Checks

- MATERIA's parsed `difC` equals NEXPLAN's for the bank (to 7 significant figures).
- If the user's data came from a different calibration than NEXPLAN's tables, use their own .instprm
  instead and say so.
- Report Rwp and χ² together with what was refined and the fit range; MATERIA's
  `assess_refinement` says when a fit is not converged.

Background: `../../knowledge/scattering/total_scattering_and_pdf.md` (for total-scattering banks).
