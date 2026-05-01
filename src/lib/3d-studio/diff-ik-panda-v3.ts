// Differential inverse kinematics for Studio v3 Panda — port of
// kevinzakka/mjctrl `diffik_nullspace.py` (Apache-2.0).
//
// Algorithm (from the mjctrl reference, verbatim except for input form):
//
//   1. Compute Jacobian J (6×nv) at the EE body via `mj_jac`.
//   2. Primary task — solve  J · dq = twist  with damped least squares:
//        dq_task = Jᵀ · (J·Jᵀ + λI)⁻¹ · twist
//   3. Null-space task — pull the joint configuration toward q0 (a
//      "comfortable" home pose) without affecting EE motion:
//        dq_null = (I − J⁺·J) · diag(Kn) · (q0 − q)
//   4. dq = dq_task + dq_null
//   5. Clamp |dq|.max ≤ MAX_ANGVEL (rad/s) — keeps joint vel bounded near
//      singularities.
//   6. Integrate joint targets:  q_new = q + dq · dt, clamped to joint limits.
//
// Inputs:
//   - twist[6] = [v_world(3); ω_world(3)]   units (m/s, rad/s)
//   - q0[7]   = comfort posture (e.g. PANDA home), null-space biases q→q0
//   - dt      = integration interval (RAF tick), typically 1/60
//
// Output: q_target[7] — write to data.ctrl[0..6].

/* eslint-disable @typescript-eslint/no-explicit-any */

const ARM_DOF = 7;

/** DLS damping (mjctrl default).  Higher = smoother near singularities,
 *  costs precision when far from them. */
export const DLS_DAMPING = 1e-4;

/** Null-space P gains per joint (mjctrl default).  Wrist joints 5/6/7 are
 *  weaker so the elbow does most of the posture-correcting motion. */
export const KN_PER_JOINT = [10, 10, 10, 10, 5, 5, 5] as const;

/** Max joint velocity in rad/s.  mjctrl reference uses 0.785 (real-Franka
 *  safety limit), but in sim we allow ~3.5 rad/s — close to Franka spec
 *  joint vel limits (j1-4: 2.175, j5-7: 2.61) but with headroom for the
 *  user's 300% sensitivity slider. */
export const MAX_ANGVEL = 3.5;

/** Per-joint hard limits from Franka official spec.  Same as the analytical
 *  IK file; duplicated here to keep modules independent. */
export const PANDA_QMIN = [-2.8973, -1.7628, -2.8973, -3.0718, -2.8973, -0.0175, -2.8973];
export const PANDA_QMAX = [ 2.8973,  1.7628,  2.8973, -0.0698,  2.8973,  3.7525,  2.8973];

/** 6×6 symmetric matrix inverse via Cholesky (only used for diff-IK; if
 *  the caller passes a near-singular JJᵀ + λI the damping should already
 *  prevent ill-conditioning). */
function inv6Sym(M: number[]): number[] | null {
  // Cholesky decompose: M = L·Lᵀ.  L is lower triangular row-major.
  const L = new Array<number>(36).fill(0);
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = M[i * 6 + j];
      for (let k = 0; k < j; k++) sum -= L[i * 6 + k] * L[j * 6 + k];
      if (i === j) {
        if (sum <= 0) return null; // not positive-definite
        L[i * 6 + j] = Math.sqrt(sum);
      } else {
        L[i * 6 + j] = sum / L[j * 6 + j];
      }
    }
  }
  // Inverse via forward/backward substitution columnwise: M⁻¹·e_k for each k.
  const Minv = new Array<number>(36).fill(0);
  const y = new Array<number>(6);
  const x = new Array<number>(6);
  for (let k = 0; k < 6; k++) {
    // Solve L·y = e_k  (forward)
    for (let i = 0; i < 6; i++) {
      let s = (i === k) ? 1 : 0;
      for (let j = 0; j < i; j++) s -= L[i * 6 + j] * y[j];
      y[i] = s / L[i * 6 + i];
    }
    // Solve Lᵀ·x = y  (backward)
    for (let i = 5; i >= 0; i--) {
      let s = y[i];
      for (let j = i + 1; j < 6; j++) s -= L[j * 6 + i] * x[j];
      x[i] = s / L[i * 6 + i];
    }
    for (let i = 0; i < 6; i++) Minv[i * 6 + k] = x[i];
  }
  return Minv;
}

export interface DiffIkBuffers {
  jacpBuf: any;     // mujoco.DoubleBuffer(3 * nv) — linear Jacobian
  jacrBuf: any;     // mujoco.DoubleBuffer(3 * nv) — angular Jacobian (world)
}

export function allocateDiffIkBuffers(mujoco: any, nv: number): DiffIkBuffers {
  if (typeof mujoco.DoubleBuffer !== 'function') {
    throw new Error('mujoco.DoubleBuffer missing — IK impossible');
  }
  return {
    jacpBuf: new mujoco.DoubleBuffer(3 * nv),
    jacrBuf: new mujoco.DoubleBuffer(3 * nv),
  };
}

/**
 * One step of differential IK with null-space posture task.
 *
 * @returns The new joint targets (length 7) for `data.ctrl[0..6]`.
 */
export function diffIkStepPandaV3(
  mujoco: any,
  model: any,
  data: any,
  eeBodyIdx: number,
  bufs: DiffIkBuffers,
  twist: readonly number[],   // length 6: [v_world(3), ω_world(3)]
  q0: readonly number[],      // length 7: comfort posture
  dt: number,
): number[] {
  const nv = model.nv;

  // EE world position — Jacobian is evaluated at this point.
  const exW = data.xpos[eeBodyIdx * 3];
  const eyW = data.xpos[eeBodyIdx * 3 + 1];
  const ezW = data.xpos[eeBodyIdx * 3 + 2];

  mujoco.mj_jac(model, data, bufs.jacpBuf, bufs.jacrBuf, [exW, eyW, ezW], eeBodyIdx);
  const jacp: Float64Array = bufs.jacpBuf.GetView();
  const jacr: Float64Array = bufs.jacrBuf.GetView();

  // Build 6×N (N=7) matrix J row-major: J[r·N + c].  jacp/jacr columns are
  // nv-wide; we slice the first ARM_DOF columns (Panda joints 1..7).
  const J = new Array<number>(6 * ARM_DOF);
  for (let c = 0; c < ARM_DOF; c++) {
    J[0 * ARM_DOF + c] = jacp[0 * nv + c];
    J[1 * ARM_DOF + c] = jacp[1 * nv + c];
    J[2 * ARM_DOF + c] = jacp[2 * nv + c];
    J[3 * ARM_DOF + c] = jacr[0 * nv + c];
    J[4 * ARM_DOF + c] = jacr[1 * nv + c];
    J[5 * ARM_DOF + c] = jacr[2 * nv + c];
  }

  // M = J·Jᵀ + λ²I  (6×6 symmetric, positive-definite by construction)
  const lam2 = DLS_DAMPING * DLS_DAMPING;
  const M = new Array<number>(36);
  for (let r = 0; r < 6; r++) {
    for (let s = 0; s < 6; s++) {
      let x = 0;
      for (let c = 0; c < ARM_DOF; c++) x += J[r * ARM_DOF + c] * J[s * ARM_DOF + c];
      M[r * 6 + s] = x + (r === s ? lam2 : 0);
    }
  }
  const Minv = inv6Sym(M);
  if (!Minv) {
    // Should never happen since JJᵀ + λI is PD, but bail safely.
    return q0.slice() as number[];
  }

  // w = Minv · twist
  const w = new Array<number>(6);
  for (let r = 0; r < 6; r++) {
    let x = 0;
    for (let s = 0; s < 6; s++) x += Minv[r * 6 + s] * twist[s];
    w[r] = x;
  }

  // dq_task = Jᵀ · w
  const dq = new Array<number>(ARM_DOF);
  for (let c = 0; c < ARM_DOF; c++) {
    let x = 0;
    for (let r = 0; r < 6; r++) x += J[r * ARM_DOF + c] * w[r];
    dq[c] = x;
  }

  // J⁺ = Jᵀ · (J·Jᵀ + λI)⁻¹  →  for null-space (I − J⁺·J)
  // Compute Jpinv (N×6) = Jᵀ · Minv.  Then nullProj = I − Jpinv · J  (N×N).
  const Jpinv = new Array<number>(ARM_DOF * 6);
  for (let r = 0; r < ARM_DOF; r++) {
    for (let s = 0; s < 6; s++) {
      let x = 0;
      for (let k = 0; k < 6; k++) x += J[k * ARM_DOF + r] * Minv[k * 6 + s];
      Jpinv[r * 6 + s] = x;
    }
  }

  // bias_q = Kn · (q0 - q)
  const biasQ = new Array<number>(ARM_DOF);
  for (let i = 0; i < ARM_DOF; i++) {
    biasQ[i] = KN_PER_JOINT[i] * (q0[i] - data.qpos[i]);
  }
  // dq_null = (I − Jpinv · J) · biasQ
  //         = biasQ − Jpinv · (J · biasQ)
  const Jb = new Array<number>(6).fill(0);
  for (let r = 0; r < 6; r++) {
    let x = 0;
    for (let c = 0; c < ARM_DOF; c++) x += J[r * ARM_DOF + c] * biasQ[c];
    Jb[r] = x;
  }
  for (let i = 0; i < ARM_DOF; i++) {
    let x = biasQ[i];
    for (let s = 0; s < 6; s++) x -= Jpinv[i * 6 + s] * Jb[s];
    dq[i] += x;
  }

  // Clamp |dq|.max ≤ MAX_ANGVEL
  let maxAbs = 0;
  for (let i = 0; i < ARM_DOF; i++) maxAbs = Math.max(maxAbs, Math.abs(dq[i]));
  if (maxAbs > MAX_ANGVEL) {
    const s = MAX_ANGVEL / maxAbs;
    for (let i = 0; i < ARM_DOF; i++) dq[i] *= s;
  }

  // Integrate: q_new = q + dq · dt, clamp to joint limits
  const q = new Array<number>(ARM_DOF);
  for (let i = 0; i < ARM_DOF; i++) {
    const v = data.qpos[i] + dq[i] * dt;
    q[i] = Math.max(PANDA_QMIN[i], Math.min(PANDA_QMAX[i], v));
  }
  return q;
}
