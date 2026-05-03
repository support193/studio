// Mission evaluator — pure function.  Called every frame (or every N) from
// the runtime physics loop.
//
// All math is plain TypeScript (no THREE / MuJoCo dependencies) so this
// module is testable in node and reusable wherever ObjectState is produced.

import type {
  Condition,
  EvalResult,
  GripperState,
  MissionDefinition,
  ObjectState,
  Region,
  Vec3,
} from './types';

/**
 * One step of mission evaluation.
 *
 * @returns
 *   - `running` while neither success nor fail condition trips
 *   - `success` once *all* successConditions hold simultaneously
 *   - `failed`  if *any* failCondition trips
 *   - `timeout` once elapsed > timeLimit
 */
export function evaluateMission(
  mission: MissionDefinition,
  objects: ObjectState[],
  gripper: GripperState,
  elapsedS: number,
): EvalResult {
  if (elapsedS > mission.timeLimitS) {
    return { result: 'timeout' };
  }

  const objMap = new Map(objects.map((o) => [o.id, o]));

  // Fail conditions: OR — any one trips the run.
  for (const c of mission.failConditions) {
    if (checkCondition(c, objMap, gripper)) {
      return { result: 'failed', reason: describeCondition(c) };
    }
  }

  // Success conditions: AND — all must hold.
  let satisfied = 0;
  for (const c of mission.successConditions) {
    if (checkCondition(c, objMap, gripper)) satisfied++;
  }

  const total = mission.successConditions.length;
  if (total > 0 && satisfied === total) {
    return { result: 'success', elapsedS };
  }
  return { result: 'running', satisfied, total };
}

// ─── Condition checks ─────────────────────────────────────────────────────

function checkCondition(c: Condition, objs: Map<string, ObjectState>, gripper: GripperState): boolean {
  switch (c.type) {
    case 'position': {
      const o = objs.get(c.target);
      if (!o) return false;
      return inRegion(o.pos, c.region);
    }
    case 'orientation': {
      const o = objs.get(c.target);
      if (!o) return false;
      const cur = quatToEuler(o.quat);
      const tol = (c.toleranceDeg * Math.PI) / 180;
      return (
        angleDiff(cur[0], c.eulerTarget[0]) < tol &&
        angleDiff(cur[1], c.eulerTarget[1]) < tol &&
        angleDiff(cur[2], c.eulerTarget[2]) < tol
      );
    }
    case 'atRest': {
      const o = objs.get(c.target);
      if (!o) return false;
      return v3Norm(o.linVel) < c.velThreshold && v3Norm(o.angVel) < c.velThreshold;
    }
    case 'held': {
      const o = objs.get(c.target);
      if (!o) return false;
      // gripper.closed is 0..1 — require >0.5 closed AND object near hand.
      return gripper.closed > 0.5 && v3Distance(o.pos, gripper.pos) < c.nearDist;
    }
    case 'stackedOn': {
      const upper = objs.get(c.upper);
      const lower = objs.get(c.lower);
      if (!upper || !lower) return false;
      const dxy = Math.hypot(upper.pos[0] - lower.pos[0], upper.pos[1] - lower.pos[1]);
      const dz = upper.pos[2] - lower.pos[2];
      return dxy < c.xyTolerance && dz > 0;
    }
    case 'distance': {
      const a = objs.get(c.a);
      const b = objs.get(c.b);
      if (!a || !b) return false;
      const d = v3Distance(a.pos, b.pos);
      return c.op === '<' ? d < c.dist : d > c.dist;
    }
  }
}

function describeCondition(c: Condition): string {
  switch (c.type) {
    case 'position':    return `${c.target} entered region`;
    case 'orientation': return `${c.target} matched orientation`;
    case 'atRest':      return `${c.target} came to rest`;
    case 'held':        return `${c.target} held by gripper`;
    case 'stackedOn':   return `${c.upper} stacked on ${c.lower}`;
    case 'distance':    return `${c.a} ${c.op} ${c.dist}m from ${c.b}`;
  }
}

// ─── Geometry helpers ─────────────────────────────────────────────────────

function inRegion(p: Vec3, r: Region): boolean {
  if (r.kind === 'sphere') {
    return v3Distance(p, r.center) <= r.radius;
  }
  return (
    p[0] >= r.min[0] && p[0] <= r.max[0] &&
    p[1] >= r.min[1] && p[1] <= r.max[1] &&
    p[2] >= r.min[2] && p[2] <= r.max[2]
  );
}

function v3Norm(v: Vec3): number {
  return Math.hypot(v[0], v[1], v[2]);
}

function v3Distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** Smallest signed angle between two angles (radians). */
function angleDiff(a: number, b: number): number {
  let d = ((a - b + Math.PI) % (2 * Math.PI)) - Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return Math.abs(d);
}

/**
 * MuJoCo quaternion (w, x, y, z) → Euler XYZ (roll, pitch, yaw) in radians.
 * Standard ZYX intrinsic = XYZ extrinsic — matches MuJoCo's convention.
 */
function quatToEuler(q: [number, number, number, number]): Vec3 {
  const [w, x, y, z] = q;
  // Roll (x-axis rotation)
  const sinr_cosp = 2 * (w * x + y * z);
  const cosr_cosp = 1 - 2 * (x * x + y * y);
  const roll = Math.atan2(sinr_cosp, cosr_cosp);
  // Pitch (y-axis rotation)
  const sinp = 2 * (w * y - z * x);
  const pitch = Math.abs(sinp) >= 1 ? Math.sign(sinp) * (Math.PI / 2) : Math.asin(sinp);
  // Yaw (z-axis rotation)
  const siny_cosp = 2 * (w * z + x * y);
  const cosy_cosp = 1 - 2 * (y * y + z * z);
  const yaw = Math.atan2(siny_cosp, cosy_cosp);
  return [roll, pitch, yaw];
}
