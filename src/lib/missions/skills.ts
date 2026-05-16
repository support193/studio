// Derive human-readable "atomic skills" from a mission's success conditions.
// Pure — no DB / runtime deps.  Used by the Explore catalog.

import type { Condition } from './types';

const SKILL_BY_TYPE: Record<Condition['type'], string> = {
  position:    'Place',
  orientation: 'Rotate',
  atRest:      'Settle',
  held:        'Grasp',
  stackedOn:   'Stack',
  distance:    'Move',
};

/** Deduped, insertion-ordered skill labels for the given success conditions. */
export function deriveSkills(conditions: Condition[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of conditions) {
    const label = SKILL_BY_TYPE[c.type];
    if (label && !seen.has(label)) { seen.add(label); out.push(label); }
  }
  return out;
}
