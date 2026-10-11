---
name: powder-plan-to-refinement
description: Go from a structure and an SNS powder instrument choice to a refinement-ready setup — which NOMAD bank or POWGEN frame resolves the lines that matter, its GSAS-II instrument parameters, and a MATERIA refinement on them. Uses NEXPLAN and MATERIA. Use when someone asks which bank or frame to refine, needs an .instprm for NOMAD or POWGEN, or wants to start a Rietveld fit of SNS data.
---

# From instrument choice to a MATERIA refinement

## Steps

1. **Structure** — `nexplan` `load_structure {path}` (the CIF), for planning.
2. **Which bank or frame** — `nexplan` `compare_instruments` with the goal (d range, the line pairs
   that must be resolved), or `instrument_powder_pattern` on a candidate bank or frame to see which
   lines it resolves and their FWHM. Name the bank (NOMAD 0–5, as Mantid numbers them) or frame
   (POWGEN centre wavelength) and why.
3. **Instrument parameters** — `nexplan` `instrument_parameters {instrument, bank | frame,
   output_path: <name>.instprm}`. Keep `d_range` and `tof_range_us` for the fit range. For NOMAD the
   file has no exponential terms; say that MATERIA starts them from its defaults.
4. **Into MATERIA** — `materia` `parse_instrument {path}` (the .instprm; it must lie under
   `SCATTERING_FILE_ROOTS` or MATERIA's working directory), `parse_structure {path}` (the same CIF),
   and `parse_powder_data {path}` for the measured pattern.
5. **Refine** — `materia` `build_refinement` with the three, then `refine_powder`, `assess_refinement`
   and `suggest_next_steps`; follow MATERIA's own refinement skill if the project has one. Restrict
   the fit to the bank's `tof_range_us`.

## Checks

- MATERIA's parsed `difC` equals NEXPLAN's for the bank (to 7 significant figures).
- If the user's data came from a different calibration than NEXPLAN's tables, use their own .instprm
  instead and say so.
- Report Rwp and χ² together with what was refined; MATERIA's `assess_refinement` says when a fit is
  not converged.

Background: `../../knowledge/scattering/total_scattering_and_pdf.md` (for total-scattering banks).
