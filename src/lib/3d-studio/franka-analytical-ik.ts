// Analytical inverse kinematics for Franka Emika Panda — TypeScript port of
// He et al. 2021 ("Analytical Inverse Kinematics for Franka Emika Panda — a
// Geometrical Solver for 7-DoF Manipulators with Unconventional Design").
//
// Original C++ source (Apache-2.0):
//   https://github.com/ffall007/franka_analytical_ik/blob/main/franka_ik_He.hpp
//
// This module provides:
//   - pandaFK(q) -> Mat4         : forward kinematics, world → EE
//   - frankaIK_CC(T, q7, qNow)   : case-consistent IK (single solution that
//                                   tracks current pose continuity).  Returns
//                                   null if the target is unreachable / out of
//                                   joint limits.
//   - frankaIK_All(T, q7, qNow)  : all 4 analytical branches (NaN fills for
//                                   branches that hit joint limits).
//   - PANDA_JOINT_LIMITS         : { lower[7], upper[7] } in radians
//   - PANDA_HOME_Q               : canonical "ready" pose
//
// All vectors are plain `number[]`, all matrices are `number[16]` (4×4) or
// `number[9]` (3×3) in **column-major** layout (Eigen / Three.js convention):
//   M[col*N + row]
//
// The rotational redundancy (q7) is the user-facing handle: caller picks q7,
// solver returns q1..q6 such that FK(q) ≈ T_target.
//
// d7e = 0.2104 m bakes together the Franka flange offset (0.107 m) and the
// default Franka Hand TCP (0.1034 m).  If you want the flange itself, use
// d7e = 0.107 — but then the IK returns "flange in world" not "TCP in world".

// ─── Constants (Franka official + He's solver) ────────────────────────────

/** Franka MDH constants from He's hpp (matches Franka FCI docs). */
const D1 = 0.3330;
const D3 = 0.3160;
const D5 = 0.3840;
const D7E = 0.2104; // flange (0.107) + Franka Hand TCP (0.1034)
const A4 = 0.0825;
const A7 = 0.0880;

const LL24 = 0.10666225;        // a4² + d3²
const LL46 = 0.15426225;        // a4² + d5²
const L24 = 0.326591870689;     // sqrt(LL24)
const L46 = 0.392762332715;     // sqrt(LL46)

const THETA_H46 = 1.35916951803;    // atan(d5/a4)
const THETA_342 = 1.31542071191;    // atan(d3/a4)
const THETA_46H = 0.211626808766;   // acot(d5/a4)

/** Joint limits (rad).  Source: franka_ros joint_limits.yaml (canonical). */
export const PANDA_JOINT_LIMITS: { lower: readonly number[]; upper: readonly number[] } = {
  lower: [-2.8973, -1.7628, -2.8973, -3.0718, -2.8973, -0.0175, -2.8973],
  upper: [ 2.8973,  1.7628,  2.8973, -0.0698,  2.8973,  3.7525,  2.8973],
};

/** Canonical "ready" / home pose used in Franka examples. */
export const PANDA_HOME_Q: readonly number[] = [
  0,
  -Math.PI / 4,
  0,
  -3 * Math.PI / 4,
  0,
  Math.PI / 2,
  Math.PI / 4,
];

// ─── Tiny linalg helpers (column-major, no external dep) ──────────────────
//
// Layout reminder:
//   Mat4 = number[16] column-major.  Element (row=r, col=c) at index c*4+r.
//   Mat3 = number[9]  column-major.  Element (row=r, col=c) at index c*3+r.
//   Vec3 = [x, y, z]

type Vec3 = [number, number, number];

function v3sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function v3cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}
function v3dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function v3norm(a: Vec3): number {
  return Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
}
function v3normalize(a: Vec3): Vec3 {
  const n = v3norm(a);
  return [a[0] / n, a[1] / n, a[2] / n];
}
function v3scale(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}

/** Column-major 3×3 from 3 column vectors. */
function mat3FromCols(c0: Vec3, c1: Vec3, c2: Vec3): number[] {
  return [c0[0], c0[1], c0[2], c1[0], c1[1], c1[2], c2[0], c2[1], c2[2]];
}
/** R^T · v  (transpose of 3×3 acting on Vec3). */
function mat3TmulV(R: number[], v: Vec3): Vec3 {
  return [
    R[0] * v[0] + R[1] * v[1] + R[2] * v[2],
    R[3] * v[0] + R[4] * v[1] + R[5] * v[2],
    R[6] * v[0] + R[7] * v[1] + R[8] * v[2],
  ];
}
/** R · v. */
function mat3MulV(R: number[], v: Vec3): Vec3 {
  return [
    R[0] * v[0] + R[3] * v[1] + R[6] * v[2],
    R[1] * v[0] + R[4] * v[1] + R[7] * v[2],
    R[2] * v[0] + R[5] * v[1] + R[8] * v[2],
  ];
}
/** A · B  (3×3, column-major). */
function mat3MulMat3(A: number[], B: number[]): number[] {
  const R = new Array<number>(9);
  for (let c = 0; c < 3; c++) {
    for (let r = 0; r < 3; r++) {
      R[c * 3 + r] =
        A[0 * 3 + r] * B[c * 3 + 0] +
        A[1 * 3 + r] * B[c * 3 + 1] +
        A[2 * 3 + r] * B[c * 3 + 2];
    }
  }
  return R;
}

/** A · B  (4×4, column-major). */
function mat4Mul(A: number[], B: number[]): number[] {
  const R = new Array<number>(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      R[c * 4 + r] =
        A[0 * 4 + r] * B[c * 4 + 0] +
        A[1 * 4 + r] * B[c * 4 + 1] +
        A[2 * 4 + r] * B[c * 4 + 2] +
        A[3 * 4 + r] * B[c * 4 + 3];
    }
  }
  return R;
}

/**
 * Modified-DH transform A = Rot_x(α) · Trans_x(a) · Rot_z(θ) · Trans_z(d).
 * (Franka MDH convention — matches He's per-joint As matrices when used
 *  with the constants below.)
 */
function mdhTransform(a: number, alpha: number, d: number, theta: number): number[] {
  const ca = Math.cos(alpha), sa = Math.sin(alpha);
  const ct = Math.cos(theta), st = Math.sin(theta);
  // Column-major 4×4
  return [
    ct,            ca * st,      sa * st,       0,    // col 0
    -st,           ca * ct,      sa * ct,       0,    // col 1
    0,             -sa,          ca,            0,    // col 2
    a,             -sa * d,      ca * d,        1,    // col 3
  ];
}

// ─── Forward kinematics ────────────────────────────────────────────────────

/**
 * Franka Panda forward kinematics: joint vector q (length 7, radians) →
 * 4×4 homogeneous transform from world frame to EE (Franka Hand TCP) frame.
 *
 * Returns column-major number[16].
 */
export function pandaFK(q: readonly number[]): number[] {
  if (q.length !== 7) throw new Error(`pandaFK: q must have length 7, got ${q.length}`);

  // Franka MDH table (a_{i-1}, α_{i-1}, d_i, θ_i = q_i).
  // Row indices match joint indices 1..7.  Final row is the flange/EE offset.
  //
  // Note on θ_7: He's IK uses x_EE_6 = (cos(q7-π/4), -sin(q7-π/4), 0), meaning
  // frame 6's x-axis aligns with EE x when q7 = π/4 (the "neutral" Franka
  // Hand TCP orientation, jaws-aligned).  Equivalently, the EE/TCP frame is
  // rotated by -π/4 around z relative to a "raw" MDH joint 7 frame.  Bake
  // this into the flange row's θ as -π/4 so q7 = π/4 produces a TCP frame
  // aligned with the world axes the IK expects.
  const dh: Array<[number, number, number, number]> = [
    [0,        0,             D1,    q[0]],
    [0,       -Math.PI / 2,   0,     q[1]],
    [0,        Math.PI / 2,   D3,    q[2]],
    [A4,       Math.PI / 2,   0,     q[3]],
    [-A4,     -Math.PI / 2,   D5,    q[4]],
    [0,        Math.PI / 2,   0,     q[5]],
    [A7,       Math.PI / 2,   0,     q[6]],
    [0,        0,             D7E,   -Math.PI / 4],  // flange + TCP, -45° around z
  ];

  let T = mdhTransform(...dh[0]);
  for (let i = 1; i < dh.length; i++) {
    T = mat4Mul(T, mdhTransform(...dh[i]));
  }
  return T;
}

// ─── Inverse kinematics — case-consistent (single solution) ────────────────

/**
 * Case-consistent analytical IK: given target EE transform (column-major
 * 4×4), redundancy parameter q7, and the current joint configuration
 * `qActual` (used to disambiguate branch), returns q[7] or null if no
 * valid solution within joint limits.
 *
 * This is the recommended call site for an interactive teleop loop where
 * you want pose continuity (no flips between branches frame to frame).
 */
export function frankaIK_CC(
  T: readonly number[],
  q7: number,
  qActual: readonly number[],
): number[] | null {
  if (T.length !== 16) throw new Error('frankaIK_CC: T must be Mat4 (length 16)');
  if (qActual.length !== 7) throw new Error('frankaIK_CC: qActual must have length 7');

  const qMin = PANDA_JOINT_LIMITS.lower;
  const qMax = PANDA_JOINT_LIMITS.upper;

  // q7 range check
  if (q7 <= qMin[6] || q7 >= qMax[6]) return null;

  const q: number[] = new Array<number>(7).fill(0);
  q[6] = q7;

  // ── FK on qActual to determine branch / case for q1, q6 ────────────────
  // Build per-joint frames using He's `As_a` chain (lines 267-298 in hpp).
  // We only need positions of frames 2, 5 (H), 7 and z-axis of frame 7.
  // Reproduce the exact same chain to keep the case classification
  // consistent with He's reference implementation.

  const As: number[][] = []; // As[i] = 4×4 column-major
  // As_a[0]: rot_z(q1), trans_z(d1)
  As.push(buildAs0(qActual[0]));
  // As_a[1]: rot_x(-π/2) · rot_z(q2)
  As.push(buildAs1(qActual[1]));
  // As_a[2]: rot_x(π/2) · rot_z(q3) · trans_z(-d3)
  As.push(buildAs2(qActual[2]));
  // As_a[3]: rot_x(π/2) · rot_z(q4) · trans_x(a4)
  As.push(buildAs3(qActual[3]));
  // As_a[4]: trans_x(-a4)  (constant H frame, no joint)
  As.push(buildAsH());
  // As_a[5]: rot_x(π/2) · rot_z(q5) · trans_z(d5)
  As.push(buildAs4(qActual[4]));
  // As_a[6]: rot_x(-π/2) · rot_z(q6)
  As.push(buildAs5(qActual[5]));

  const Ts: number[][] = [As[0]];
  for (let j = 1; j < 7; j++) Ts.push(mat4Mul(Ts[j - 1], As[j]));

  // p_2 = Ts[1] position, p_H = Ts[4] position, p_6 = Ts[6] position
  // Z_6 = column 2 of rotation part of Ts[6]
  const p2 = mat4Pos(Ts[1]);
  const pH = mat4Pos(Ts[4]);
  const p6 = mat4Pos(Ts[6]);
  const z6 = mat4ColAxis(Ts[6], 2);

  const V62 = v3sub(p2, p6);
  const V6H = v3sub(pH, p6);
  const cross6 = v3cross(V6H, V62);
  const isCase6_0 = v3dot(cross6, z6) <= 0;
  const isCase1_1 = qActual[1] < 0;

  // ── IK proper ──────────────────────────────────────────────────────────
  const RT_EE = [T[0], T[1], T[2], T[4], T[5], T[6], T[8], T[9], T[10]]; // 3×3 col-major
  const z_EE: Vec3 = [T[8], T[9], T[10]];
  const p_EE: Vec3 = [T[12], T[13], T[14]];

  const p_7: Vec3 = v3sub(p_EE, v3scale(z_EE, D7E));

  const x_EE_6: Vec3 = [Math.cos(q7 - Math.PI / 4), -Math.sin(q7 - Math.PI / 4), 0];
  let x_6 = mat3MulV(RT_EE, x_EE_6);
  x_6 = v3normalize(x_6);
  const p_6: Vec3 = v3sub(p_7, v3scale(x_6, A7));

  const p_2: Vec3 = [0, 0, D1];
  const V26 = v3sub(p_6, p_2);
  const LL26 = v3dot(V26, V26);
  const L26 = Math.sqrt(LL26);

  // Triangle inequality
  if (L24 + L46 < L26 || L24 + L26 < L46 || L26 + L46 < L24) return null;

  const theta246 = Math.acos((LL24 + LL46 - LL26) / 2 / L24 / L46);
  q[3] = theta246 + THETA_H46 + THETA_342 - 2 * Math.PI;
  if (q[3] <= qMin[3] || q[3] >= qMax[3]) return null;

  // q6
  const theta462 = Math.acos((LL26 + LL46 - LL24) / 2 / L26 / L46);
  const theta26H = THETA_46H + theta462;
  const D26 = -L26 * Math.cos(theta26H);

  const Z_6 = v3cross(z_EE, x_6);
  const Y_6 = v3cross(Z_6, x_6);
  const Y_6n = v3normalize(Y_6);
  const Z_6n = v3normalize(Z_6);
  const R_6 = mat3FromCols(x_6, Y_6n, Z_6n);

  const negV26: Vec3 = [-V26[0], -V26[1], -V26[2]];
  const V_6_62 = mat3TmulV(R_6, negV26);

  const Phi6 = Math.atan2(V_6_62[1], V_6_62[0]);
  const Theta6 = Math.asin(D26 / Math.sqrt(V_6_62[0] * V_6_62[0] + V_6_62[1] * V_6_62[1]));

  q[5] = isCase6_0 ? (Math.PI - Theta6 - Phi6) : (Theta6 - Phi6);
  if (q[5] <= qMin[5]) q[5] += 2 * Math.PI;
  else if (q[5] >= qMax[5]) q[5] -= 2 * Math.PI;
  if (q[5] <= qMin[5] || q[5] >= qMax[5]) return null;

  // q1, q2
  const thetaP26 = 3 * Math.PI / 2 - theta462 - theta246 - THETA_342;
  const thetaP = Math.PI - thetaP26 - theta26H;
  const LP6 = L26 * Math.sin(thetaP26) / Math.sin(thetaP);

  const z_6_5: Vec3 = [Math.sin(q[5]), Math.cos(q[5]), 0];
  const z_5 = mat3MulV(R_6, z_6_5);
  const V2P: Vec3 = v3sub(v3sub(p_6, v3scale(z_5, LP6)), p_2);
  const L2P = v3norm(V2P);

  if (Math.abs(V2P[2] / L2P) > 0.999) {
    q[0] = qActual[0];
    q[1] = 0;
  } else {
    q[0] = Math.atan2(V2P[1], V2P[0]);
    q[1] = Math.acos(V2P[2] / L2P);
    if (isCase1_1) {
      q[0] += q[0] < 0 ? Math.PI : -Math.PI;
      q[1] = -q[1];
    }
  }
  if (q[0] <= qMin[0] || q[0] >= qMax[0] || q[1] <= qMin[1] || q[1] >= qMax[1]) return null;

  // q3
  const z_3 = v3normalize(V2P);
  const Y_3 = v3cross([-V26[0], -V26[1], -V26[2]], V2P); // -V26 × V2P
  const y_3 = v3normalize(Y_3);
  const x_3 = v3cross(y_3, z_3);

  const c1 = Math.cos(q[0]), s1 = Math.sin(q[0]);
  const R_1 = [c1, s1, 0, -s1, c1, 0, 0, 0, 1]; // col-major
  const c2 = Math.cos(q[1]), s2 = Math.sin(q[1]);
  // R_1_2 row-wise:
  //   c2 -s2  0
  //    0   0  1
  //   -s2 -c2 0
  // Column-major:
  const R_1_2 = [c2, 0, -s2, -s2, 0, -c2, 0, 1, 0];
  const R_2 = mat3MulMat3(R_1, R_1_2);
  const x_2_3 = mat3TmulV(R_2, x_3);
  q[2] = Math.atan2(x_2_3[2], x_2_3[0]);
  if (q[2] <= qMin[2] || q[2] >= qMax[2]) return null;

  // q5
  const VH4 = (() => {
    const a = v3scale(z_3, D3);
    const b = v3scale(x_3, A4);
    const c = v3scale(z_5, D5);
    return [
      p_2[0] + a[0] + b[0] - p_6[0] + c[0],
      p_2[1] + a[1] + b[1] - p_6[1] + c[1],
      p_2[2] + a[2] + b[2] - p_6[2] + c[2],
    ] as Vec3;
  })();
  const c6 = Math.cos(q[5]), s6 = Math.sin(q[5]);
  // R_5_6 row-wise:
  //   c6 -s6  0
  //    0   0 -1
  //   s6  c6  0
  // Column-major:
  const R_5_6 = [c6, 0, s6, -s6, 0, c6, 0, -1, 0];
  // R_5 = R_6 · R_5_6^T
  const R_5_6T = mat3Transpose(R_5_6);
  const R_5 = mat3MulMat3(R_6, R_5_6T);
  const V_5_H4 = mat3TmulV(R_5, VH4);
  q[4] = -Math.atan2(V_5_H4[1], V_5_H4[0]);
  if (q[4] <= qMin[4] || q[4] >= qMax[4]) return null;

  return q;
}

/** Per-joint As helpers (match He's case-consistent FK chain exactly). */
function buildAs0(q1: number): number[] {
  const c = Math.cos(q1), s = Math.sin(q1);
  return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, D1, 1];
}
function buildAs1(q2: number): number[] {
  const c = Math.cos(q2), s = Math.sin(q2);
  // row-wise:  [c -s 0 0; 0 0 1 0; -s -c 0 0; 0 0 0 1]
  return [c, 0, -s, 0, -s, 0, -c, 0, 0, 1, 0, 0, 0, 0, 0, 1];
}
function buildAs2(q3: number): number[] {
  const c = Math.cos(q3), s = Math.sin(q3);
  // row-wise:  [c -s 0 0; 0 0 -1 -d3; s c 0 0; 0 0 0 1]
  return [c, 0, s, 0, -s, 0, c, 0, 0, -1, 0, 0, 0, -D3, 0, 1];
}
function buildAs3(q4: number): number[] {
  const c = Math.cos(q4), s = Math.sin(q4);
  // row-wise:  [c -s 0 a4; 0 0 -1 0; s c 0 0; 0 0 0 1]
  return [c, 0, s, 0, -s, 0, c, 0, 0, -1, 0, 0, A4, 0, 0, 1];
}
function buildAsH(): number[] {
  // row-wise:  [1 0 0 -a4; 0 1 0 0; 0 0 1 0; 0 0 0 1]
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -A4, 0, 0, 1];
}
function buildAs4(q5: number): number[] {
  const c = Math.cos(q5), s = Math.sin(q5);
  // row-wise:  [c -s 0 0; 0 0 1 d5; -s -c 0 0; 0 0 0 1]
  return [c, 0, -s, 0, -s, 0, -c, 0, 0, 1, 0, 0, 0, D5, 0, 1];
}
function buildAs5(q6: number): number[] {
  const c = Math.cos(q6), s = Math.sin(q6);
  // row-wise:  [c -s 0 0; 0 0 -1 0; s c 0 0; 0 0 0 1]
  return [c, 0, s, 0, -s, 0, c, 0, 0, -1, 0, 0, 0, 0, 0, 1];
}

function mat4Pos(M: number[]): Vec3 {
  return [M[12], M[13], M[14]];
}
function mat4ColAxis(M: number[], col: 0 | 1 | 2): Vec3 {
  const o = col * 4;
  return [M[o], M[o + 1], M[o + 2]];
}
function mat3Transpose(M: number[]): number[] {
  return [M[0], M[3], M[6], M[1], M[4], M[7], M[2], M[5], M[8]];
}
