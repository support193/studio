// Franka Panda v3 physics hook.
//
// Phase 1: load Menagerie panda.xml + scene.xml, run mj_forward at home.
// Phase 2: keyboard → analytical IK → qpos (kinematic teleport).
// Phase 3: keyboard → analytical IK → ctrl[] + mj_step (PD actuators).
// Phase 3.1 (current): replace analytical IK with **diff-IK + null-space**
//   (mjctrl/diffik_nullspace.py port).  Removes "awkward joint angle" +
//   "dead key on IK fail" symptoms:
//     - Damped least-squares pseudo-inverse → smooth near singularities,
//       never returns NaN.
//     - Null-space task biases joint configuration toward q0 (home pose)
//       so the elbow always sits in a "comfortable" place even when the
//       analytical 4-branch IK would have picked an awkward configuration.
//     - Velocity command from keyboard becomes the spatial twist directly,
//       no target-pose accumulator → no unreachable-target lockout.
//
// Distinct from v1 (useMujocoPhysicsPanda) which uses mocap+weld.

'use client';

import { useEffect, useRef, useState } from 'react';
import { loadMujocoWASM } from '@/lib/3d-studio/mujoco-loader';
import {
  PANDA_V3_BASE_URL,
  PANDA_V3_MESH_FILES,
  PANDA_V3_TRACKED_BODIES,
  PANDA_V3_HOME_QPOS,
} from '@/lib/3d-studio/franka-panda-v3';
import {
  diffIkStepPandaV3,
  allocateDiffIkBuffers,
  type DiffIkBuffers,
} from '@/lib/3d-studio/diff-ik-panda-v3';
import type { PandaV3Controls } from './usePandaV3Controls';

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface PandaV3BodyPose {
  name: string;
  position: [number, number, number];
  quaternion: [number, number, number, number];
}

export interface PandaV3PhysicsState {
  loaded: boolean;
  error: string | null;
}

export interface PandaV3PhysicsHandle {
  /** Current state — only updated when `loaded` / `error` changes (rare). */
  state: PandaV3PhysicsState;
  /** Live body poses — updated every RAF tick.  Read via ref to avoid
   *  React re-render storm.  Pass to <PandaMeshes bodiesRef={...} /> and
   *  consume with useFrame. */
  bodiesRef: React.MutableRefObject<PandaV3BodyPose[]>;
  /** Live IK ok flag — read via ref for HUD polling at lower freq. */
  ikOkRef: React.MutableRefObject<boolean>;
}

/** Snapshot of robot state for trajectory recording.  Lives in a ref so the
 *  physics loop can write without re-rendering. */
export interface PandaV3FrameSnapshot {
  joint_positions: number[];   // length 7 — q1..q7 from data.qpos
  gripper_pos: number;          // finger gap in meters (data.qpos[7])
  joint_targets: number[];      // length 7 — last IK solution written to ctrl
  gripper_cmd: number;          // 0..255 — actuator 8 ctrl
}

const ROBOT_VFS_DIR = '/models/franka_panda_v3';
const ASSETS_VFS_DIR = `${ROBOT_VFS_DIR}/assets`;

/** Number of mj_step calls per requestAnimationFrame tick.  Match v2 pattern. */
const SUBSTEPS = 4;

/** Frame interval for diff-IK integration (assume 60 fps RAF). */
const DT = 1 / 60;

async function fetchAsArrayBuffer(url: string): Promise<ArrayBuffer> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fetch ${url}: ${r.status}`);
  return r.arrayBuffer();
}
async function fetchAsText(url: string): Promise<string> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fetch ${url}: ${r.status}`);
  return r.text();
}

async function stageAssets(mujoco: any): Promise<string> {
  for (const dir of ['/models', ROBOT_VFS_DIR, ASSETS_VFS_DIR]) {
    try { mujoco.FS.mkdir(dir); } catch { /* exists */ }
  }
  const [panda, scene] = await Promise.all([
    fetchAsText(`${PANDA_V3_BASE_URL}/panda.xml`),
    fetchAsText(`${PANDA_V3_BASE_URL}/scene.xml`),
  ]);
  mujoco.FS.writeFile(`${ROBOT_VFS_DIR}/panda.xml`, panda);
  mujoco.FS.writeFile(`${ROBOT_VFS_DIR}/scene.xml`, scene);
  await Promise.all(PANDA_V3_MESH_FILES.map(async (filename) => {
    const buf = await fetchAsArrayBuffer(`${PANDA_V3_BASE_URL}/assets/${filename}`);
    mujoco.FS.writeFile(`${ASSETS_VFS_DIR}/${filename}`, new Uint8Array(buf));
  }));
  return `${ROBOT_VFS_DIR}/scene.xml`;
}

function readBodies(mujoco: any, model: any, data: any): PandaV3BodyPose[] {
  const out: PandaV3BodyPose[] = [];
  for (const name of PANDA_V3_TRACKED_BODIES) {
    const idx = mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_BODY.value, name);
    if (idx < 0) continue;
    out.push({
      name,
      position: [data.xpos[idx * 3], data.xpos[idx * 3 + 1], data.xpos[idx * 3 + 2]],
      quaternion: [
        data.xquat[idx * 4],
        data.xquat[idx * 4 + 1],
        data.xquat[idx * 4 + 2],
        data.xquat[idx * 4 + 3],
      ],
    });
  }
  return out;
}

// ─── Math helpers for orientation ──────────────────────────────────────────

/** A · B  (3×3 col-major). */
function mat3Mul(A: number[], B: number[]): number[] {
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

/** Rodrigues exponential map: small angular velocity vector (rad)
 *  → 3×3 rotation matrix col-major.  Used to integrate angular velocity
 *  into the target rotation: R_new = R_old · Exp(ω·dt). */
function expSO3(omega: [number, number, number]): number[] {
  const wx = omega[0], wy = omega[1], wz = omega[2];
  const theta = Math.sqrt(wx * wx + wy * wy + wz * wz);
  if (theta < 1e-10) {
    // Identity + skew(omega) — first-order approx for tiny rotations
    return [
      1,    wz,  -wy,
      -wz,  1,    wx,
      wy,  -wx,   1,
    ];
  }
  const s = Math.sin(theta) / theta;
  const c = (1 - Math.cos(theta)) / (theta * theta);
  // K = skew(omega), R = I + s·K + c·K²
  const xx = wx * wx, yy = wy * wy, zz = wz * wz;
  const xy = wx * wy, xz = wx * wz, yz = wy * wz;
  // Col-major
  return [
    1 - c * (yy + zz),       s * wz + c * xy,        -s * wy + c * xz,    // col 0
    -s * wz + c * xy,        1 - c * (xx + zz),       s * wx + c * yz,    // col 1
    s * wy + c * xz,         -s * wx + c * yz,        1 - c * (xx + yy),  // col 2
  ];
}

/** Re-orthonormalize a 3×3 rotation (Gram–Schmidt) — call occasionally to
 *  prevent drift after many SO(3) integrations. */
function reorthMat3(R: number[]): number[] {
  // col 0 → normalize
  let cx = R[0], cy = R[1], cz = R[2];
  let n = Math.sqrt(cx * cx + cy * cy + cz * cz);
  cx /= n; cy /= n; cz /= n;
  // col 1 → subtract projection onto col 0, normalize
  let a = R[3], b = R[4], c = R[5];
  const dot = a * cx + b * cy + c * cz;
  a -= dot * cx; b -= dot * cy; c -= dot * cz;
  n = Math.sqrt(a * a + b * b + c * c);
  a /= n; b /= n; c /= n;
  // col 2 = col 0 × col 1
  const dx = cy * c - cz * b;
  const dy = cz * a - cx * c;
  const dz = cx * b - cy * a;
  return [cx, cy, cz, a, b, c, dx, dy, dz];
}

/** Compose Mat4 from 3×3 rotation (col-major number[9]) and Vec3 position. */
function makeMat4(R: number[], pos: [number, number, number]): number[] {
  return [
    R[0], R[1], R[2], 0,
    R[3], R[4], R[5], 0,
    R[6], R[7], R[8], 0,
    pos[0], pos[1], pos[2], 1,
  ];
}

/** Extract 3×3 rotation from Mat4 col-major. */
function rotFromMat4(T: readonly number[]): number[] {
  return [T[0], T[1], T[2], T[4], T[5], T[6], T[8], T[9], T[10]];
}

// ─── Hook ─────────────────────────────────────────────────────────────────

export function useMujocoPhysicsPandaV3(
  active: boolean,
  controls: PandaV3Controls,
  frameDataRef?: React.MutableRefObject<PandaV3FrameSnapshot | null>,
): PandaV3PhysicsHandle {
  const [state, setState] = useState<PandaV3PhysicsState>({
    loaded: false,
    error: null,
  });

  const mujocoRef = useRef<any>(null);
  const modelRef = useRef<any>(null);
  const dataRef = useRef<any>(null);
  const rafRef = useRef<number>(0);

  /** Live body poses — written every RAF tick, read by Three.js useFrame.
   *  Bypasses React state entirely → no per-frame re-render. */
  const bodiesRef = useRef<PandaV3BodyPose[]>([]);
  /** Live IK ok flag — same pattern. */
  const ikOkRef = useRef<boolean>(false);

  /** Comfort posture for null-space — first 7 joints of the home keyframe.
   *  Z/C keyboard input drifts q0[6] so the user can spin the wrist
   *  without fighting the null-space pull. */
  const q0Ref = useRef<number[]>([...PANDA_V3_HOME_QPOS.slice(0, 7)]);

  /** Diff-IK heap buffers — allocated once after model load. */
  const ikBufsRef = useRef<DiffIkBuffers | null>(null);
  const handBodyIdxRef = useRef<number>(-1);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    (async () => {
      try {
        const mujoco = await loadMujocoWASM();
        if (cancelled) return;
        mujocoRef.current = mujoco;

        const sceneVfsPath = await stageAssets(mujoco);
        if (cancelled) return;

        const model = mujoco.MjModel.loadFromXML(sceneVfsPath);
        modelRef.current = model;
        const data = new mujoco.MjData(model);
        dataRef.current = data;

        // **Gravity** — disable globally for now.  Position-PD actuators
        // alone don't compensate the panda's own weight (long lever arms
        // at shoulder/elbow), so without compensation the arm sags from
        // gravity ("축 쳐지는" symptom).
        //
        // mjctrl reference enables per-body gravcomp via
        // `model.body_gravcomp[:] = 1.0`, but zalo's WASM binding may not
        // expose that as a writable typed array.  Setting opt.gravity = 0
        // is binding-agnostic and works.  Future TODO: switch to
        // body_gravcomp when adding free objects to the scene (so cubes
        // still fall while the arm is held up).
        try {
          if (model.opt && model.opt.gravity) {
            model.opt.gravity[0] = 0;
            model.opt.gravity[1] = 0;
            model.opt.gravity[2] = 0;
          }
          // Belt-and-suspenders: also try body_gravcomp in case it works.
          const grav = model.body_gravcomp;
          if (grav && typeof grav.length === 'number') {
            for (let i = 0; i < grav.length; i++) grav[i] = 1.0;
          }
        } catch (e) {
          console.warn('[panda-v3] gravity disable failed:', e);
        }

        const homeKeyId = mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_KEY.value, 'home');
        if (homeKeyId >= 0) mujoco.mj_resetDataKeyframe(model, data, homeKeyId);
        mujoco.mj_forward(model, data);

        // Allocate diff-IK heap buffers (once per model load).
        ikBufsRef.current = allocateDiffIkBuffers(mujoco, model.nv);
        handBodyIdxRef.current = mujoco.mj_name2id(
          model, mujoco.mjtObj.mjOBJ_BODY.value, 'hand',
        );
        if (handBodyIdxRef.current < 0) {
          throw new Error('hand body not found in panda model');
        }

        // Seed comfort posture (q0) from current qpos — null-space biases
        // the joint config toward this configuration each tick.
        for (let i = 0; i < 7; i++) q0Ref.current[i] = data.qpos[i];

        // The diff-IK path doesn't use targetRef.{pos, rotMat, q7}; it
        // consumes velRef + gripper directly.  Seed gripper open.
        controls.seedHome([0, 0, 0], [1, 0, 0, 0, 1, 0, 0, 0, 1], q0Ref.current[6]);

        if (cancelled) return;
        bodiesRef.current = readBodies(mujoco, model, data);
        ikOkRef.current = true;
        setState({ loaded: true, error: null });

        // ── RAF loop: keys → twist → diff-IK → ctrl → mj_step ───────────
        const tick = () => {
          if (cancelled) return;
          if (!modelRef.current || !dataRef.current || !mujocoRef.current) return;
          if (!ikBufsRef.current) return;
          const mj = mujocoRef.current;
          const m = modelRef.current;
          const d = dataRef.current;
          const eeIdx = handBodyIdxRef.current;

          // Reset request — restore home keyframe + reset comfort posture.
          if (controls.resetRef.current) {
            const homeId = mj.mj_name2id(m, mj.mjtObj.mjOBJ_KEY.value, 'home');
            if (homeId >= 0) mj.mj_resetDataKeyframe(m, d, homeId);
            mj.mj_forward(m, d);
            for (let i = 0; i < 7; i++) q0Ref.current[i] = d.qpos[i];
            controls.resetRef.current = false;
          }

          // 1) Read held-key velocity command.
          controls.applyKeysToVelocity();
          const v = controls.velRef.current;

          // 2) Build spatial twist directly — both linear and angular are
          //    already in world frame (REP-103) per the controls hook.
          //    No EE→world rotation needed.
          const twist = [v.lin[0], v.lin[1], v.lin[2], v.ang[0], v.ang[1], v.ang[2]];

          // 3) Diff-IK + null-space → joint targets.  (Z/C now rides on
          //    twist's ω_z directly — no separate q0 drift needed.)
          const qTarget = diffIkStepPandaV3(mj, m, d, eeIdx, ikBufsRef.current, twist, q0Ref.current, DT);
          for (let i = 0; i < 7; i++) d.ctrl[i] = qTarget[i];
          ikOkRef.current = true; // diff-IK never "fails" — DLS always returns

          // Gripper actuator (index 7) — Menagerie panda.xml ctrlrange 0..255.
          d.ctrl[7] = controls.targetRef.current.gripper;

          // Substep physics integration (~4ms × 4 = ~16ms ≈ one RAF frame).
          for (let i = 0; i < SUBSTEPS; i++) {
            mj.mj_step(m, d);
          }

          // Snapshot for trajectory recorder (ref write — no re-render).
          if (frameDataRef) {
            frameDataRef.current = {
              joint_positions: [d.qpos[0], d.qpos[1], d.qpos[2], d.qpos[3], d.qpos[4], d.qpos[5], d.qpos[6]],
              gripper_pos: d.qpos[7],
              joint_targets: [d.ctrl[0], d.ctrl[1], d.ctrl[2], d.ctrl[3], d.ctrl[4], d.ctrl[5], d.ctrl[6]],
              gripper_cmd: controls.targetRef.current.gripper,
            };
          }

          // Body poses → ref (no React render).  Three.js useFrame
          // consumer reads bodiesRef directly.  ikOkRef is set true once
          // up in the diff-IK call (DLS never fails).
          bodiesRef.current = readBodies(mj, m, d);

          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        console.error('[panda-v3] init failed:', err);
        setState({ loaded: false, error: message });
      }
    })();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [active, controls]);

  return { state, bodiesRef, ikOkRef };
}
