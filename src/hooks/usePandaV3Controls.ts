// Keyboard controls for Studio v3 Panda — VELOCITY-COMMAND model.
//
// Pattern (DROID/mink-inspired):
//   Held keys → desired velocity (linear m/s + angular rad/s + q7 rate).
//   The physics hook reads velRef each frame, multiplies by dt, and only
//   commits to targetRef WHEN IK SUCCEEDS.  On sustained IK failure
//   (N consecutive frames) the physics hook snaps target ← FK(current_q).
//
// Why velocity, not "target = old_target + Δ":  if we accumulate target
// unconditionally, holding a key when IK is unsolvable drives target
// further into the unreachable set.  Future key presses can't bring it
// back.  Velocity model + IK-gated integration → "dead key" symptom
// disappears.
//
// Layout (all in WORLD = robot base frame, REP-103: +X forward, +Y left, +Z up):
//   W / S : ±X (forward / back)
//   A / D : ±Y (left / right)              ← REP-103: +Y is robot's LEFT
//   Q / E : ±Z (up / down)
//   ↑ / ↓ : pitch around world Y (forward / back tilt)
//   ← / → : roll around world X (left / right tilt)
//   Z / C : yaw around world Z (wrist spin)
//   Space : gripper toggle (open / closed)
//   R     : reset to home pose
//
// Numerical envelope: defaults are at "300% feels fast" point so the
// sensitivity slider can dial down for precision.
//   max linear  = 0.6 m/s  (300% slider → 1.8 m/s — fast pickup motion)
//   max angular = 1.5 rad/s (300% → 4.5 rad/s — quick wrist tilt)
// diff-IK's MAX_ANGVEL = 3.5 rad/s is set to match — see diff-ik-panda-v3.ts.

'use client';

import { useEffect, useRef, useCallback, useMemo } from 'react';

const MAX_LIN_VEL = 0.6;    // m/s
const MAX_ROT_VEL = 1.5;    // rad/s
const MAX_Q7_VEL  = 2.0;    // rad/s — q7 spin can be a bit faster (no IK feedback)

export interface PandaV3Target {
  pos: [number, number, number];
  /** Current target EE rotation, 3×3 col-major.  Physics hook mutates. */
  rotMat: number[];
  /** Joint 7 redundancy (rad). */
  q7: number;
  /** Gripper actuator ctrl 0..255. */
  gripper: number;
}

/** Per-frame velocity command from held keys. */
export interface PandaV3Velocity {
  /** World-frame linear velocity (m/s). */
  lin: [number, number, number];
  /** Angular velocity in current EE frame (rad/s) — applied as
   *  R_target_new = R_target_old · Exp([wx, wy, wz] · dt). */
  ang: [number, number, number];
  /** q7 rate (rad/s). */
  q7Rate: number;
}

export interface PandaV3Controls {
  /** Live target — physics hook is the only writer.  Read-only for keyboard. */
  targetRef: React.MutableRefObject<PandaV3Target>;
  /** Live velocity command — keyboard hook writes, physics hook reads. */
  velRef: React.MutableRefObject<PandaV3Velocity>;
  /** When true, physics loop should snap target to home and clear flag. */
  resetRef: React.MutableRefObject<boolean>;
  /** Sensitivity (50%–200%) — multiplies velocity caps. */
  setSensitivity: (pct: number) => void;
  /** Per-frame: integrate held keys into velRef.  Mutates gripper directly
   *  on Space (toggle, no velocity). */
  applyKeysToVelocity: () => void;
  /** Initial home target — caller seeds after FK runs once. */
  seedHome: (pos: [number, number, number], rotMat: number[], q7Home: number) => void;
}

export function usePandaV3Controls(): PandaV3Controls {
  const targetRef = useRef<PandaV3Target>({
    pos: [0.3, 0, 0.5],
    rotMat: [1, 0, 0, 0, 1, 0, 0, 0, 1], // identity, replaced by seedHome
    q7: Math.PI / 4,
    gripper: 255,
  });
  const velRef = useRef<PandaV3Velocity>({
    lin: [0, 0, 0],
    ang: [0, 0, 0],
    q7Rate: 0,
  });
  const resetRef = useRef<boolean>(false);
  const sensitivityRef = useRef<number>(100);
  const pressed = useRef<Set<string>>(new Set());

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        e.preventDefault();
        if (!e.repeat) {
          targetRef.current.gripper = targetRef.current.gripper === 255 ? 0 : 255;
        }
        return;
      }
      if (
        e.key === 'ArrowUp' || e.key === 'ArrowDown' ||
        e.key === 'ArrowLeft' || e.key === 'ArrowRight'
      ) {
        e.preventDefault();
      }
      if (e.key.toLowerCase() === 'r' && !e.repeat) {
        resetRef.current = true;
        return;
      }
      pressed.current.add(e.key.toLowerCase());
    };
    const onUp = (e: KeyboardEvent) => {
      pressed.current.delete(e.key.toLowerCase());
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, []);

  const applyKeysToVelocity = useCallback(() => {
    const keys = pressed.current;
    const v = velRef.current;
    const s = sensitivityRef.current / 100;

    // Linear (world frame, REP-103).  +Y is robot's LEFT, so:
    //   A → +Y (left),  D → -Y (right).
    v.lin[0] = ((keys.has('w') ? 1 : 0) - (keys.has('s') ? 1 : 0)) * MAX_LIN_VEL * s;
    v.lin[1] = ((keys.has('a') ? 1 : 0) - (keys.has('d') ? 1 : 0)) * MAX_LIN_VEL * s;
    v.lin[2] = ((keys.has('q') ? 1 : 0) - (keys.has('e') ? 1 : 0)) * MAX_LIN_VEL * s;

    // Angular (WORLD frame).  Mapping derived from "gripper points down at
    // home" intuition:
    //   ↑ = forward tilt  (gripper nose moves toward +X) ← needs −ω_y_world
    //   ↓ = backward tilt                                ← +ω_y_world
    //   ← = left tilt     (gripper nose moves toward +Y) ← +ω_x_world
    //   → = right tilt                                   ← −ω_x_world
    //   Z / C = yaw       (wrist spin around vertical)   ← ±ω_z_world
    v.ang[0] = ((keys.has('arrowleft') ? 1 : 0) - (keys.has('arrowright') ? 1 : 0)) * MAX_ROT_VEL * s; // roll (world X)
    v.ang[1] = ((keys.has('arrowdown') ? 1 : 0) - (keys.has('arrowup')    ? 1 : 0)) * MAX_ROT_VEL * s; // pitch (world Y)
    v.ang[2] = ((keys.has('z')         ? 1 : 0) - (keys.has('c')          ? 1 : 0)) * MAX_Q7_VEL  * s; // yaw (world Z)

    v.q7Rate = 0; // deprecated — Z/C now in v.ang[2]
  }, []);

  const seedHome = useCallback((
    pos: [number, number, number],
    rotMat: number[],
    q7Home: number,
  ) => {
    targetRef.current.pos = [pos[0], pos[1], pos[2]];
    targetRef.current.rotMat = [...rotMat];
    targetRef.current.q7 = q7Home;
    targetRef.current.gripper = 255;
  }, []);

  const setSensitivity = useCallback((pct: number) => {
    sensitivityRef.current = Math.max(10, Math.min(300, pct));
  }, []);

  return useMemo(
    () => ({ targetRef, velRef, resetRef, setSensitivity, applyKeysToVelocity, seedHome }),
    [setSensitivity, applyKeysToVelocity, seedHome],
  );
}
