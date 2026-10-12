# Symmetry and structural phase transitions

## Space group, Wyckoff sites, point group

The **space group** is the full set of symmetry operations of a crystal
(rotations, screw axes, glides, translations) — 230 types in 3D. Detected from a
structure (atoms + cell) at a chosen position **tolerance**: too tight and noise
lowers the apparent symmetry, too loose and a real distortion is averaged away.

Each atom sits on a **Wyckoff position** with a **site symmetry** (the point
group that leaves it fixed). Atoms on special positions (high site symmetry)
have their coordinates fixed by symmetry; general positions are free.

## Group-subgroup relations and transitions

A structural phase transition that lowers symmetry takes the crystal from a
high-symmetry **parent** space group G to a **subgroup** H ⊂ G. In Landau
theory a continuous (second-order) transition has an order parameter that
transforms as a **single irreducible representation** (irrep) of G, and H is
an **isotropy subgroup** of that irrep: the subgroup that leaves the order
parameter's direction invariant. H need not be a maximal subgroup of G: the
perovskite tilt a⁰b⁻b⁻ (irrep R4+) takes Pm-3m straight to Imma, which lies
below I4/mcm (a⁰a⁰c⁻, another direction of the same irrep). A subgroup that
is the isotropy subgroup of no single irrep needs two primary order
parameters: such a transition is generically first order, or passes through
an intermediate phase. Whether a single-irrep transition can in fact be
continuous is a further test (the Landau and Lifshitz conditions: no cubic
invariant, no Lifshitz invariant); otherwise it is first order.

Every subgroup is reached by a chain of maximal subgroups, of two kinds:

- **translationengleiche (t):** same lattice (translations), fewer point-group
  operations — a **ferroic** distortion (ferroelastic/ferroelectric,
  octahedral tilt). Index = order ratio (2, 3, 4, ...).
- **klassengleiche (k):** same point group, a larger cell — an **ordering** or
  superstructure transition (cell doubling, cation ordering). These need a
  supercell and are not enumerated from a single cell.

When a t-subgroup has several symmetry-equivalent orientations in the parent
(e.g. the three tetragonal axes of a cubic parent), each becomes a **domain
variant** on cooling. The number of variants equals the index for that step.

**Reading a subgroup list:** the maximal subgroups are the one-step
candidates; the isotropy subgroups of the parent's irreps (ISOTROPY, the
Bilbao server) are the candidates for a continuous transition, maximal or not.
The transition that actually occurs is the one whose distortion the data
support — a matching cell metric, split or newly-forbidden reflections, and a
plausible order parameter. The lists narrow the candidates; they do not choose
among them.

## Pseudosymmetry (finding the parent)

A distorted structure often retains **pseudosymmetry**: at a looser tolerance it
snaps to a higher-symmetry space group. That higher group is a candidate
**parent phase**, and the tight (real) structure is one of its distorted
subgroups. Pseudosymmetry is how you find the parent when you only have the
low-symmetry phase.

## Magnetic (Shubnikov) space groups

Adding time reversal (moment flip) to the 230 space groups gives the 1651
**magnetic space groups**. Types: I (no time reversal), II (grey / paramagnetic,
time reversal alone is a symmetry), III and IV (black-white, time reversal
coupled to a rotation or a translation). The magnetic space group of an ordered
structure is fixed by the moment arrangement. Enumerating the *maximal* magnetic
groups allowed by a propagation vector **k** is representation analysis (a
separate step) and is not the same as reading off the group of a given ordering.
