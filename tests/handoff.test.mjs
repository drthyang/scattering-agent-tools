// The files and values the apps hand each other, across their real servers: what the skills rely on.
// Each test needs the apps it names checked out (and installed); otherwise it is skipped with the reason.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { dirOf, json, serverTest, Skip } from './suite.js';

/** A folder for one test's files, removed when the test ends. */
function scratch(t) {
  const dir = mkdtempSync(join(tmpdir(), 'scattering-handoff-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// A hexagonal structure on the NeXus Viewer's demo cell (a = 4.2, c = 6.8 Å). P6₃/mmc forbids hhl with odd l.
const CIF = `data_demo
_cell_length_a 4.2
_cell_length_b 4.2
_cell_length_c 6.8
_cell_angle_alpha 90
_cell_angle_beta 90
_cell_angle_gamma 120
_symmetry_space_group_name_H-M 'P 63/m m c'
loop_
_atom_site_label
_atom_site_type_symbol
_atom_site_fract_x
_atom_site_fract_y
_atom_site_fract_z
Ni1 Ni 0 0 0
As1 As 0.333333 0.666667 0.25
`;

serverTest('NEXPLAN → NeXus Viewer: Laue class and Bragg nodes on a volume\'s grid', async (t, start) => {
  const tmp = scratch(t);
  const { client: plan } = await start('nexplan');
  const { client: viewer } = await start('nexus-viewer');
  const demo = join(dirOf('nexus-viewer'), 'examples', 'demo_10K.nxs');
  const vol = json(await viewer.callTool({ name: 'open_volume', arguments: { path: demo, id: 'cold' } }));
  // The grid as open_volume returns it, with the Q convention added: NEXPLAN's schema is strict, so any other
  // key in nexplan_grid would be refused.
  const grid = { ...vol.nexplan_grid, q_convention: 'crystallography' };
  writeFileSync(join(tmp, 'demo.cif'), CIF);
  json(await plan.callTool({ name: 'load_structure', arguments: { path: join(tmp, 'demo.cif'), name: 'demo' } }));

  const laue = json(await plan.callTool({ name: 'laue_symmetry', arguments: { structure_id: 'demo', grid } }));
  assert.equal(laue.nexus_viewer_preset, '6/mmm');
  assert.equal(laue.grid.compatible, true);
  const set = json(await viewer.callTool({ name: 'set_symmetry', arguments: { volume_id: 'cold', laue_class: laue.nexus_viewer_preset } }));
  assert.equal(set.order, laue.order);
  // The operation list works as well as the preset name.
  const ops = json(await viewer.callTool({ name: 'set_symmetry', arguments: { volume_id: 'cold', operations: laue.symmetry_ops } }));
  assert.equal(ops.group, '6/mmm');

  const nodes = join(tmp, 'nodes.json');
  json(await plan.callTool({ name: 'bragg_positions', arguments: { structure_id: 'demo', grid, d_min: 0.5, limit: 1, output_path: nodes } }));
  const read = json(await viewer.callTool({ name: 'read_points', arguments: { volume_id: 'cold', points_path: nodes, limit: 1 } }));
  const { present, 'systematic absence': absent } = read.summary;
  assert.ok(present.with_data > 100 && absent.with_data > 10);
  assert.ok(present.median_value > 100 * absent.median_value, 'allowed nodes are strong, forbidden ones at background');
});

serverTest('NEXPLAN → MATERIA: GSAS-II instrument parameters', async (t, start) => {
  const tmp = scratch(t);
  const { client: plan } = await start('nexplan');
  const { client: materia } = await start('materia', { SCATTERING_FILE_ROOTS: tmp });
  const file = join(tmp, 'pg15.instprm');
  const made = json(await plan.callTool({ name: 'instrument_parameters', arguments: { instrument: 'powgen', frame: 1.5, output_path: file } }));
  // With roots set, MATERIA reads a relative path from the first root (not its working directory).
  const parsed = json(await materia.callTool({ name: 'parse_instrument', arguments: { path: 'pg15.instprm' } }));
  // The .instprm MATERIA parses gives the InstrumentParameters NEXPLAN says it wrote. Results are rounded
  // to 7 significant figures and files keep full precision, so they agree to 1e-6.
  const expected = made.materia_instrument;
  assert.equal(parsed.kind, 'tof');
  assert.equal(expected.kind, 'tof');
  const keys = ['difC', 'difA', 'difB', 'zero', 'alpha', 'beta0', 'beta1', 'sig0', 'sig1', 'sig2'];
  for (const key of keys) {
    assert.equal(typeof expected[key], 'number', `NEXPLAN's materia_instrument has no ${key}`);
    assert.ok(Math.abs(parsed[key] - expected[key]) <= 1e-6 * Math.max(1, Math.abs(expected[key])), `${key}: MATERIA read ${parsed[key]}, NEXPLAN wrote ${expected[key]}`);
  }
});

serverTest('NeXus Viewer → NEBULA3D: the export loads in NEBULA3D\'s own reader', async (t, start) => {
  const python = process.env.NEBULA3D_PYTHON || join(dirOf('nebula3d'), '.venv', process.platform === 'win32' ? 'Scripts' : 'bin', process.platform === 'win32' ? 'python.exe' : 'python');
  if (!existsSync(python)) throw new Skip(`no Python with nebula3d at ${python} (set NEBULA3D_PYTHON)`);
  const tmp = scratch(t);
  const { client: viewer } = await start('nexus-viewer');
  const demo = join(dirOf('nexus-viewer'), 'examples', 'demo_10K.nxs');
  json(await viewer.callTool({ name: 'open_volume', arguments: { path: demo, id: 'cold' } }));
  json(await viewer.callTool({ name: 'set_symmetry', arguments: { volume_id: 'cold', laue_class: '6/mmm' } }));
  const out = join(tmp, 'cold_sym6mmm.nxs');
  const e = json(await viewer.callTool({ name: 'export_nebula3d', arguments: { volume_id: 'cold', output_path: out } }));
  const check = spawnSync(python, ['-c', `
import json, sys
from nebula3d.io.hkl_reader import load
from nebula3d.symmetry import read_symmetry_ops
v = load(sys.argv[1])
ops = read_symmetry_ops(sys.argv[1])
print(json.dumps({"shape": list(v.data.shape), "valid": int(v.mask.sum()), "ops": len(ops or [])}))
`, out], { encoding: 'utf8' });
  assert.equal(check.status, 0, check.stderr);
  const got = JSON.parse(check.stdout.trim().split('\n').pop());
  assert.deepEqual(got.shape, e.shape_hkl);
  assert.equal(got.valid, e.valid_voxels);
  assert.equal(got.ops, 24);
  assert.ok(readFileSync(out).length > 0);
});
