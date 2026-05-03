// Mission schema — shared by admin (authoring) + runtime player (evaluator).
//
// Coordinate frame: MuJoCo Z-up (REP-103).  +X forward, +Y left, +Z up.
// Quaternions: (w, x, y, z) — MuJoCo convention.

export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number]; // (w, x, y, z)

export type ObjectType = 'box' | 'sphere' | 'cylinder';

/**
 * A spawnable object placed in the scene at the start of a mission.
 *
 * Size semantics by type (matches MuJoCo geom):
 *   box:      [hx, hy, hz]   half-extents along each axis
 *   sphere:   [r,  0,  0]    radius (only size[0] used)
 *   cylinder: [r,  h,  0]    radius + half-height
 */
export interface MissionObject {
  /** Unique within the mission.  Used to reference in conditions. */
  id: string;
  type: ObjectType;
  size: Vec3;
  mass: number;
  /** Hex `#RRGGBB`. */
  color: string;
  /** World-frame initial position. */
  initialPos: Vec3;
  /** World-frame initial orientation (wxyz). */
  initialQuat: Quat;
}

/** A 3D region used by position-based conditions. */
export type Region =
  | { kind: 'sphere'; center: Vec3; radius: number }
  | { kind: 'aabb';   min: Vec3; max: Vec3 };

/** Per-frame check.  Order corresponds to UI grouping. */
export type Condition =
  /** Object center must be inside `region`. */
  | { type: 'position';    target: string; region: Region }
  /** Object orientation matches target Euler (radians) within tolerance. */
  | { type: 'orientation'; target: string; eulerTarget: Vec3; toleranceDeg: number }
  /** Object linear+angular velocity below threshold (m/s, rad/s). */
  | { type: 'atRest';      target: string; velThreshold: number }
  /** Gripper closed AND object near gripper position. */
  | { type: 'held';        target: string; nearDist: number }
  /** `upper` is on top of `lower`: upper.z > lower.z+lower.h/2 within xy tolerance. */
  | { type: 'stackedOn';   upper: string; lower: string; xyTolerance: number }
  /** Distance between two objects' centers `op` than `dist`. */
  | { type: 'distance';    a: string; b: string; op: '<' | '>'; dist: number };

/** Full mission as stored in DB / consumed at runtime. */
export interface MissionDefinition {
  id: string;
  title: string;
  goal: string | null;
  steps: string[];
  timeLimitS: number;
  objects: MissionObject[];
  successConditions: Condition[];   // AND — all must hold
  failConditions: Condition[];      // OR — any one fails the run
}

// ─── Runtime state (player → evaluator) ───────────────────────────────────

/** Live state of a mission object — read each frame from MuJoCo data. */
export interface ObjectState {
  id: string;
  pos: Vec3;
  quat: Quat;     // wxyz
  linVel: Vec3;
  angVel: Vec3;
}

export interface GripperState {
  /** 0..1 — 1 = fully closed (gripper actuator at min). */
  closed: number;
  /** Hand body world-frame position. */
  pos: Vec3;
}

export type EvalResult =
  | { result: 'running'; satisfied: number; total: number }
  | { result: 'success'; elapsedS: number }
  | { result: 'failed';  reason: string }
  | { result: 'timeout' };

// ─── Defaults / factories ─────────────────────────────────────────────────

export function defaultObject(id: string): MissionObject {
  return {
    id,
    type: 'box',
    size: [0.025, 0.025, 0.025],
    mass: 0.1,
    color: '#7C5CFC',
    initialPos: [0.4, 0, 0.025],
    initialQuat: [1, 0, 0, 0],
  };
}

export function defaultCondition(type: Condition['type']): Condition {
  switch (type) {
    case 'position':    return { type, target: '', region: { kind: 'sphere', center: [0.4, 0, 0.05], radius: 0.05 } };
    case 'orientation': return { type, target: '', eulerTarget: [0, 0, 0], toleranceDeg: 15 };
    case 'atRest':      return { type, target: '', velThreshold: 0.02 };
    case 'held':        return { type, target: '', nearDist: 0.05 };
    case 'stackedOn':   return { type, upper: '', lower: '', xyTolerance: 0.02 };
    case 'distance':    return { type, a: '', b: '', op: '<', dist: 0.05 };
  }
}

export const CONDITION_TYPES: Array<Condition['type']> = [
  'position', 'orientation', 'atRest', 'held', 'stackedOn', 'distance',
];

export const CONDITION_LABELS: Record<Condition['type'], string> = {
  position:    'Position in region',
  orientation: 'Orientation match',
  atRest:      'At rest',
  held:        'Held by gripper',
  stackedOn:   'Stacked on',
  distance:    'Distance to object',
};
