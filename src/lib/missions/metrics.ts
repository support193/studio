// Mission scoring — v2.
//
// Per-tick (100ms) update() is fed with the gripper position, gripper-open
// state (0..1), the mission objects' live states, and a flag indicating
// whether any fail condition is currently firing.  At finalize() we return:
//
//   1. The six sub-metrics (each 0..1):
//        task_completion / time_efficiency / path_efficiency /
//        smoothness     / stability        / economy
//   2. A weighted quality score 0..100.
//   3. Star tier 0..3.
//   4. Eight episode-filter flags ("is this usable as training data?").
//   5. Raw signals kept around for later weight-tuning from real plays.
//
// References:
//   - RoboEval (arXiv 2507.00435): stage-wise success / time / path / jerk.
//   - OSATS (surgical-robotics): task time + master motion distance.
//   - SPARC (Balasubramanian 2012) — not implemented yet; we use jerk-RMS
//     as a fallback (TODO: swap in SPARC when we have FFT budget).
//   - MimicGen (CoRL 2023): stability dwell + "successful replays only".

import type {
  Condition,
  Difficulty,
  GripperState,
  MissionDefinition,
  ObjectState,
  Quat,
  Vec3,
} from './types';
import { XP_BASE } from './types';
import { evaluateMission, checkCondition } from './evaluator';

// ─── Trajectory recording format (v1) ────────────────────────────────────
//
// One frame per ~100ms.  Stored as compressed JSON in Supabase Storage when
// the server-derived quality_score is at or above xp_settings.trajectory_min_score.
//
// Why this shape: every input the metrics tracker + evaluator needs to
// recompute on the server, plus enough state for a future replay viewer or
// behavior-cloning consumer.

export interface TrajectoryFrame {
  /** seconds since episode start */
  t: number;
  /** end-effector world position (panda "hand" body) */
  hand_p: Vec3;
  /** end-effector world orientation, MuJoCo (w, x, y, z) */
  hand_q: Quat;
  /** gripper closed command, 0..1 */
  grip: number;
  /** live state of every mission object */
  objs: Array<{
    id: string;
    p: Vec3;
    q: Quat;
    lv: Vec3;
    av: Vec3;
  }>;
}

export interface TrajectoryEnvelope {
  version: 1;
  mission_id: string;
  user_id: string;
  recorded_at: string;       // ISO timestamp
  time_limit_s: number;
  par_time_s: number;
  frames: TrajectoryFrame[];
}

// ─── Public outputs ──────────────────────────────────────────────────────

export interface SubMetrics {
  task_completion: number;
  time_efficiency: number;
  path_efficiency: number;
  smoothness:      number;
  stability:       number;
  economy:         number;
}

export interface EpisodeFlags {
  flag_timed_out:            boolean;
  flag_never_touched_object: boolean;
  flag_excessive_regrasps:   boolean;
  flag_idle_dominant:        boolean;
  flag_path_explosion:       boolean;
  flag_failure_recovered:    boolean;
  flag_clipped_geometry:     boolean;
  flag_low_smoothness:       boolean;
}

export interface EvalMetrics {
  elapsedS: number;
  pathLengthM: number;
  meanSpeedMps: number;
  smoothnessScore: number;     // alias of sub.smoothness, kept for old callers
  stars: 0 | 1 | 2 | 3;
  qualityScore: number;        // 0..100, 0 if hard-success-gate failed
  sub: SubMetrics;
  flags: EpisodeFlags;
  raw: {
    jerkRMS: number;
    gripperToggleCount: number;
    velocityReversalCount: number;
    idleFrameRatio: number;
    optimalPathM: number;
  };
}

export interface FinalizeInput {
  /** Final evaluator state at the moment of success (or null if failed/timeout). */
  hardSuccess: boolean;
  /** Did any fail condition fire at any point during the run? */
  anyFailEverFired: boolean;
  /** Final fraction of success conditions satisfied (0..1). */
  satisfiedFrac: number;
  /** Fraction of steps satisfied in declared order (0..1).  Fed by player. */
  stepsInOrderFrac: number;
  /** Total elapsed seconds. */
  elapsedS: number;
  /** Mission timeLimit (s). */
  timeLimitS: number;
  /** Designer-set par time. */
  parTimeS: number;
  /** Estimate of the shortest reasonable path the gripper could have travelled. */
  optimalPathM: number;
  /** Did the run hit timeLimit?  Player passes this in (it has the result type). */
  timedOut: boolean;
  /**
   * Placement stability 0..1, computed by the server replay over the settle
   * window.  Undefined for the client preview and for missions with no
   * object-referencing success conditions — when undefined, stability is
   * excluded from the quality score and the remaining weights renormalise.
   */
  stability?: number;
}

// ─── Tracker ─────────────────────────────────────────────────────────────

interface FailureRecoveryState {
  wasEverActive: boolean;
  isCurrentlyActive: boolean;
  recovered: boolean;
}

const TOUCH_RADIUS_M = 0.06;       // gripper-to-object distance considered "contact"
const STAB_MOVE_THRESHOLD_M = 0.01; // released object moving < 1cm/frame = stable
const IDLE_SPEED_M_PER_S = 0.01;
const GRIPPER_CLOSED_THRESHOLD = 0.5;
const GRIPPER_OPEN_THRESHOLD = 0.3;
const PATH_MIN_INCREMENT_M = 0.001;  // ignore < 1 mm jitter

export class MetricsTracker {
  private lastPos: Vec3 | null = null;
  private lastVel: Vec3 | null = null;
  private pathLength = 0;
  private accelSumSq = 0;
  private accelSamples = 0;

  private totalFrames = 0;
  private idleFrames = 0;

  // Gripper state machine: counts open→close transitions only.
  private gripperWasClosed = false;
  private gripperToggleCount = 0;

  // Velocity reversal: sign flips on the dominant XY axis (whichever has the
  // larger speed on each tick) — proxy for "wobbling back and forth".
  private lastSignDominantAxis = 0;
  private velocityReversalCount = 0;

  // Did the gripper ever come within TOUCH_RADIUS of any mission-relevant
  // object?  Filters do-nothing runs.
  private touchedAnyObject = false;

  // Track which fail-conditions have recovered from a fired state.
  private failureRecovery: FailureRecoveryState = {
    wasEverActive: false,
    isCurrentlyActive: false,
    recovered: false,
  };

  // Stability dwell after release: when gripper transitions closed→open
  // while near a mission object, mark that object's release timestamp; we
  // then watch how long it stays put before the run ends.
  private lastReleasedObjectId: string | null = null;
  private lastReleasedAtMs: number | null = null;
  private lastReleasedPos: Vec3 | null = null;
  private stabilityDwellMs = 0;

  reset() {
    this.lastPos = null;
    this.lastVel = null;
    this.pathLength = 0;
    this.accelSumSq = 0;
    this.accelSamples = 0;
    this.totalFrames = 0;
    this.idleFrames = 0;
    this.gripperWasClosed = false;
    this.gripperToggleCount = 0;
    this.lastSignDominantAxis = 0;
    this.velocityReversalCount = 0;
    this.touchedAnyObject = false;
    this.failureRecovery = { wasEverActive: false, isCurrentlyActive: false, recovered: false };
    this.lastReleasedObjectId = null;
    this.lastReleasedAtMs = null;
    this.lastReleasedPos = null;
    this.stabilityDwellMs = 0;
  }

  /**
   * Per-tick update.
   *
   * @param gripperPos      world-frame hand position
   * @param gripperClosed   0..1 (1 = fully closed)
   * @param objects         live mission object states
   * @param relevantIds     ids of objects mentioned in success conditions
   * @param failActiveNow   any fail condition currently firing
   * @param dt              seconds since last tick
   */
  update(
    gripperPos: Vec3,
    gripperClosed: number,
    objects: ObjectState[],
    relevantIds: Set<string>,
    failActiveNow: boolean,
    dt: number,
  ) {
    this.totalFrames++;
    if (dt <= 0) return;

    // ── motion / smoothness ──────────────────────────────────────────────
    if (this.lastPos) {
      const d = v3Dist(this.lastPos, gripperPos);
      if (d > PATH_MIN_INCREMENT_M) this.pathLength += d;

      const vel: Vec3 = [
        (gripperPos[0] - this.lastPos[0]) / dt,
        (gripperPos[1] - this.lastPos[1]) / dt,
        (gripperPos[2] - this.lastPos[2]) / dt,
      ];
      const speed = v3Norm(vel);
      if (speed < IDLE_SPEED_M_PER_S) this.idleFrames++;

      if (this.lastVel) {
        const ax = (vel[0] - this.lastVel[0]) / dt;
        const ay = (vel[1] - this.lastVel[1]) / dt;
        const az = (vel[2] - this.lastVel[2]) / dt;
        this.accelSumSq += ax * ax + ay * ay + az * az;
        this.accelSamples++;
      }

      // Dominant-axis sign flip detector on XY plane.
      const dominant = Math.abs(vel[0]) > Math.abs(vel[1]) ? vel[0] : vel[1];
      const sign = dominant > 0.02 ? 1 : dominant < -0.02 ? -1 : 0;
      if (sign !== 0 && this.lastSignDominantAxis !== 0 && sign !== this.lastSignDominantAxis) {
        this.velocityReversalCount++;
      }
      if (sign !== 0) this.lastSignDominantAxis = sign;

      this.lastVel = vel;
    }
    this.lastPos = gripperPos;

    // ── gripper toggle counter (open → closed transition) ───────────────
    const closedNow = gripperClosed > GRIPPER_CLOSED_THRESHOLD;
    const openNow = gripperClosed < GRIPPER_OPEN_THRESHOLD;
    if (closedNow && !this.gripperWasClosed) {
      this.gripperToggleCount++;
      this.gripperWasClosed = true;
    } else if (openNow && this.gripperWasClosed) {
      this.gripperWasClosed = false;
      // On release, remember which mission-relevant object was nearest;
      // we'll measure how long it stays at that spot until episode end.
      let nearest: ObjectState | null = null;
      let nearestD = Infinity;
      for (const o of objects) {
        if (!relevantIds.has(o.id)) continue;
        const d = v3Dist(o.pos, gripperPos);
        if (d < nearestD) { nearestD = d; nearest = o; }
      }
      if (nearest && nearestD < TOUCH_RADIUS_M * 3) {
        this.lastReleasedObjectId = nearest.id;
        this.lastReleasedAtMs = Date.now();
        this.lastReleasedPos = [...nearest.pos] as Vec3;
        this.stabilityDwellMs = 0;
      }
    }

    // ── object contact (proxy: any relevant object within touch radius) ─
    if (!this.touchedAnyObject) {
      for (const o of objects) {
        if (!relevantIds.has(o.id)) continue;
        if (v3Dist(o.pos, gripperPos) < TOUCH_RADIUS_M) {
          this.touchedAnyObject = true;
          break;
        }
      }
    }

    // ── stability of the most recently released object ─────────────────
    if (this.lastReleasedObjectId && this.lastReleasedPos) {
      const obj = objects.find((o) => o.id === this.lastReleasedObjectId);
      if (obj) {
        const drift = v3Dist(obj.pos, this.lastReleasedPos);
        if (drift < STAB_MOVE_THRESHOLD_M) {
          this.stabilityDwellMs += dt * 1000;
        } else {
          // Object moved — reset dwell, anchor at new position.
          this.stabilityDwellMs = 0;
          this.lastReleasedPos = [...obj.pos] as Vec3;
        }
      }
    }

    // ── fail-condition recovery tracking ────────────────────────────────
    if (failActiveNow) {
      this.failureRecovery.wasEverActive = true;
      this.failureRecovery.isCurrentlyActive = true;
    } else if (this.failureRecovery.isCurrentlyActive) {
      this.failureRecovery.isCurrentlyActive = false;
      this.failureRecovery.recovered = true;
    }
  }

  /** Finalise with the player-supplied summary state. */
  finalize(input: FinalizeInput): EvalMetrics {
    const { elapsedS, timeLimitS, optimalPathM, hardSuccess, anyFailEverFired,
            satisfiedFrac, stepsInOrderFrac, timedOut } = input;

    const meanSpeed = this.pathLength / Math.max(0.01, elapsedS);

    // jerk-RMS ≈ sqrt(mean(|a|²)) — accel-RMS used as proxy for jerk
    // because we sample at 10 Hz and finite-diff'ing twice would amplify noise.
    const accelRMS = this.accelSamples > 0 ? Math.sqrt(this.accelSumSq / this.accelSamples) : 0;
    // Normalise: a calm, expert run sits around 3 m/s²; an erratic run > 25.
    const smoothness = clamp01(1 - (accelRMS - 3) / 22);

    // ── 6 sub-metrics ──────────────────────────────────────────────────
    const task_completion = clamp01(0.7 * satisfiedFrac + 0.3 * stepsInOrderFrac);

    // time_efficiency: floor 0.5, plus up to 0.5 scaled by the fraction of
    // the time budget left.  Finish instantly → ~1.0; use the whole limit →
    // 0.5 (the floor).  parTimeS is intentionally no longer used.
    const time_efficiency = clamp01(
      Math.max(0.5, 0.5 + 0.5 * (timeLimitS - elapsedS) / Math.max(1, timeLimitS)),
    );

    // path_efficiency: optimal/actual, capped 1.  If we never got an
    // optimal estimate (e.g. no position conds) we default to 0.5 which
    // contributes neutrally.
    const path_efficiency = this.pathLength <= 0
      ? 0
      : clamp01(optimalPathM > 0 ? optimalPathM / this.pathLength : 0.5);

    // stability: server replay computes placement steadiness from the
    // recorded trajectory (object stayed in its target, at rest, after it
    // first arrived).  Undefined → not measurable here (client preview, or
    // no object-referencing success conditions) → excluded from the score.
    // typeof is inlined (not via the alias) so TS narrows away `undefined`.
    const stability = typeof input.stability === 'number' ? clamp01(input.stability) : 0;
    const stabilityApplicable = typeof input.stability === 'number';

    // economy: penalise toggles + reversals.  ~30 combined events = 0.
    const economyScore = (this.gripperToggleCount + 0.5 * this.velocityReversalCount) / 30;
    const economy = clamp01(1 - economyScore);

    const sub: SubMetrics = {
      task_completion,
      time_efficiency,
      path_efficiency,
      smoothness:    clamp01(smoothness),
      stability,
      economy,
    };

    // ── quality score 0..100 ───────────────────────────────────────────
    // task_completion + smoothness are still computed & stored (DB / raw)
    // but excluded from the score: task is ~always 1 on a completed run, and
    // smoothness is not measurable under keyboard control.
    const gatePass = hardSuccess && !anyFailEverFired && this.touchedAnyObject;
    const qualityRaw = stabilityApplicable
      ? 100 * (
          0.40 * sub.time_efficiency +
          0.30 * sub.path_efficiency +
          0.20 * sub.stability +
          0.10 * sub.economy
        )
      // stability excluded → renormalise over the remaining three.
      : 100 * (
          0.500 * sub.time_efficiency +
          0.375 * sub.path_efficiency +
          0.125 * sub.economy
        );
    const qualityScore = gatePass ? Math.round(qualityRaw) : 0;

    // ── star tiers ─────────────────────────────────────────────────────
    let stars: 0 | 1 | 2 | 3 = 0;
    if (gatePass) {
      if (qualityScore >= 80) stars = 3;
      else if (qualityScore >= 55) stars = 2;
      else stars = 1;
    }

    // ── 8 episode flags ────────────────────────────────────────────────
    const idleFrameRatio = this.totalFrames > 0 ? this.idleFrames / this.totalFrames : 0;
    const flags: EpisodeFlags = {
      flag_timed_out:            timedOut,
      flag_never_touched_object: !this.touchedAnyObject,
      flag_excessive_regrasps:   this.gripperToggleCount > 6,
      flag_idle_dominant:        idleFrameRatio > 0.40,
      flag_path_explosion:       optimalPathM > 0 && this.pathLength > 4 * optimalPathM,
      flag_failure_recovered:    this.failureRecovery.recovered,
      flag_clipped_geometry:     false,  // MuJoCo contact penetration not surfaced yet
      flag_low_smoothness:       sub.smoothness < 0.2,
    };

    return {
      elapsedS,
      pathLengthM: this.pathLength,
      meanSpeedMps: meanSpeed,
      smoothnessScore: sub.smoothness,
      stars,
      qualityScore,
      sub,
      flags,
      raw: {
        jerkRMS: accelRMS,
        gripperToggleCount: this.gripperToggleCount,
        velocityReversalCount: this.velocityReversalCount,
        idleFrameRatio,
        optimalPathM,
      },
    };
  }
}

// ─── Server-side replay (recompute score from trajectory frames) ────────
//
// The browser computes a quality score in real time, but it's not the
// canonical one — that's derived here on the server from the recorded
// trajectory frames.  Two consumers:
//
//   1. /api/missions/log/[id]/finish — the immediate hand-off after a play.
//   2. Future: BC pipeline / admin replay viewer.
//
// Pure TS; safe to import from either Node API routes or the browser.

const STABILITY_DWELL_MS_REPLAY = 1000;

// "At rest" thresholds for the placed object during the settle window.
// Tunable — calibrated from a quiet placement vs. a rolling/teetering one.
const STAB_LIN_VEL_THRESH = 0.05;   // m/s
const STAB_ANG_VEL_THRESH = 0.5;    // rad/s

/**
 * Placement stability over the settle window: from the first frame of the
 * satisfied stretch that led to completion (`winStartIdx`) through the end,
 * the fraction of frames each success condition stayed satisfied AND its
 * object(s) were at rest.  `held` / `atRest` only require the predicate to
 * stay true (object didn't leave the gripper / kept still).  Averaged across
 * all success conditions.  Undefined if there are no success conditions.
 */
function computeReplayStability(
  mission: MissionDefinition,
  frames: TrajectoryFrame[],
  winStartIdx: number,
  winEndIdx: number,
): number | undefined {
  const conds = mission.successConditions;
  if (conds.length === 0) return undefined;
  const win = frames.slice(winStartIdx, winEndIdx + 1);
  if (win.length === 0) return undefined;

  const perCond = conds.map((c) => {
    let stable = 0;
    for (const f of win) {
      const objs: ObjectState[] = f.objs.map((o) => ({
        id: o.id, pos: o.p, quat: o.q, linVel: o.lv, angVel: o.av,
      }));
      const objMap = new Map(objs.map((o) => [o.id, o]));
      const gripper: GripperState = { closed: f.grip, pos: f.hand_p };
      if (!checkCondition(c, objMap, gripper)) continue;
      // held / atRest predicates already imply "steady"; others additionally
      // require the referenced object(s) to be at rest.
      if (c.type === 'held' || c.type === 'atRest' || condObjectsAtRest(c, objMap)) {
        stable++;
      }
    }
    return stable / win.length;
  });

  return perCond.reduce((a, b) => a + b, 0) / perCond.length;
}

function condObjectsAtRest(c: Condition, objs: Map<string, ObjectState>): boolean {
  const ids: string[] =
    c.type === 'position' || c.type === 'orientation' ? [c.target]
    // a stack is only "settled" if the base is also at rest (matches the
    // distance / collectRelevantIds treatment of stackedOn).
    : c.type === 'stackedOn' ? [c.upper, c.lower]
    : c.type === 'distance' ? [c.a, c.b]
    : [];
  for (const id of ids) {
    const o = objs.get(id);
    if (!o) return false;
    if (v3Norm(o.linVel) >= STAB_LIN_VEL_THRESH) return false;
    if (v3Norm(o.angVel) >= STAB_ANG_VEL_THRESH) return false;
  }
  return true;
}

export interface ReplayResult {
  status: 'success' | 'failed' | 'timeout' | 'abandoned';
  resultReason: string | null;
  elapsedS: number;
  anyFailEverFired: boolean;
  metrics: EvalMetrics;
}

export function replayEpisode(
  mission: MissionDefinition,
  frames: TrajectoryFrame[],
): ReplayResult {
  const tracker = new MetricsTracker();
  const relevantIds = collectRelevantIds(mission.successConditions);

  if (frames.length === 0) {
    return {
      status: 'abandoned',
      resultReason: 'no_frames',
      elapsedS: 0,
      anyFailEverFired: false,
      metrics: tracker.finalize({
        hardSuccess: false,
        anyFailEverFired: false,
        satisfiedFrac: 0,
        stepsInOrderFrac: 0,
        elapsedS: 0,
        timeLimitS: mission.timeLimitS,
        parTimeS: mission.parTimeS,
        optimalPathM: 0.4,
        timedOut: false,
      }),
    };
  }

  const optimalPathM = estimateOptimalPath(mission, frames[0].hand_p);

  let prevT = frames[0].t;
  let firstAllSatMs: number | null = null;
  // Frame index range of the satisfied stretch that led to completion —
  // the stability "settle window" [winStartIdx, winEndIdx].
  let winStartIdx = -1;
  let winEndIdx = -1;
  let anyFailEverFired = false;
  let satisfiedFinal = 0;
  let totalConds = mission.successConditions.length;

  let endStatus: 'success' | 'failed' | 'timeout' | 'abandoned' = 'abandoned';
  let endReason: string | null = null;
  let endElapsedS = frames[frames.length - 1].t;

  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    const dt = i === 0 ? 0.1 : Math.max(0.001, f.t - prevT);
    prevT = f.t;

    const objs: ObjectState[] = f.objs.map((o) => ({
      id: o.id,
      pos: o.p,
      quat: o.q,
      linVel: o.lv,
      angVel: o.av,
    }));

    // Evaluator pass — determines per-frame condition state.
    const gripperState = { closed: f.grip, pos: f.hand_p };
    const r = evaluateMission(mission, objs, gripperState, f.t);

    // Did any fail condition fire at THIS instant?  evaluateMission short-
    // circuits on failure, so result==='failed' means yes.
    const failActiveNow = r.result === 'failed';
    if (failActiveNow) anyFailEverFired = true;

    tracker.update(f.hand_p, f.grip, objs, relevantIds, failActiveNow, dt);

    if (r.result === 'failed') {
      endStatus = 'failed';
      endReason = r.reason;
      endElapsedS = f.t;
      break;
    }
    if (r.result === 'timeout') {
      endStatus = 'timeout';
      endElapsedS = f.t;
      break;
    }
    if (r.result === 'success') {
      satisfiedFinal = totalConds;
      // 1s stability dwell — all conditions held continuously.
      if (firstAllSatMs === null) { firstAllSatMs = f.t * 1000; winStartIdx = i; }
      const dwell = f.t * 1000 - firstAllSatMs;
      if (dwell >= STABILITY_DWELL_MS_REPLAY) {
        endStatus = 'success';
        endElapsedS = f.t;
        winEndIdx = i;
        break;
      }
    } else {
      // running — reset dwell, capture progress for fall-through finalize.
      firstAllSatMs = null;
      winStartIdx = -1;
      satisfiedFinal = r.satisfied;
    }
  }

  // Hard-success gate + final metrics.
  const satisfiedFrac = totalConds === 0 ? 0 : satisfiedFinal / totalConds;
  const stepsInOrderFrac = mission.steps.length === 0
    ? 1
    : Math.min(1, satisfiedFrac);

  // Stability only matters on a successful run (others are gate-zeroed).
  const stability = endStatus === 'success' && winStartIdx >= 0 && winEndIdx >= winStartIdx
    ? computeReplayStability(mission, frames, winStartIdx, winEndIdx)
    : undefined;

  const m = tracker.finalize({
    hardSuccess: endStatus === 'success',
    anyFailEverFired,
    satisfiedFrac,
    stepsInOrderFrac,
    elapsedS: endElapsedS,
    timeLimitS: mission.timeLimitS,
    parTimeS: mission.parTimeS,
    optimalPathM,
    timedOut: endStatus === 'timeout',
    stability,
  });

  return {
    status: endStatus,
    resultReason: endReason,
    elapsedS: endElapsedS,
    anyFailEverFired,
    metrics: m,
  };
}

function collectRelevantIds(conds: Condition[]): Set<string> {
  const ids = new Set<string>();
  for (const c of conds) {
    switch (c.type) {
      case 'position':
      case 'orientation':
      case 'atRest':
      case 'held':
        ids.add(c.target); break;
      case 'stackedOn':
        ids.add(c.upper); ids.add(c.lower); break;
      case 'distance':
        ids.add(c.a); ids.add(c.b); break;
    }
  }
  return ids;
}

// ─── XP formula ──────────────────────────────────────────────────────────

const STAR_MULT: Record<0|1|2|3, number> = { 0: 0, 1: 1.0, 2: 1.25, 3: 1.6 };

/**
 * Compute XP awarded for this attempt.  `firstClearStars` is the player's
 * best previous star tier on this mission BEFORE this attempt (0 if none):
 * a higher tier achieved for the first time grants a one-shot bonus.
 */
export function computeXp(
  mission: { difficulty: Difficulty },
  metrics: EvalMetrics,
  previousBestStars: 0 | 1 | 2 | 3,
): number {
  const base = XP_BASE[mission.difficulty];
  if (metrics.stars === 0) {
    // Consolation if at least the player tried meaningfully.
    return metrics.flags.flag_never_touched_object ? 0 : Math.round(base * 0.05);
  }
  const firstBonus = metrics.stars > previousBestStars
    ? (metrics.stars === 3 ? 2.0 : metrics.stars === 2 ? 1.5 : 1.2)
    : 1.0;
  return Math.round(base * (metrics.qualityScore / 100) * firstBonus * STAR_MULT[metrics.stars]);
}

// ─── Optimal-path estimate (player calls this once at start) ────────────

/**
 * Rough lower-bound estimate of the shortest reasonable trajectory:
 * gripper-start → each task object → that object's intended target.
 * Used by path_efficiency.  Falls back to 0.4m if no position-style conds.
 */
export function estimateOptimalPath(
  mission: MissionDefinition,
  gripperStart: Vec3,
): number {
  let total = 0;
  let prev = gripperStart;
  for (const cond of mission.successConditions) {
    const target = conditionTarget(cond, mission);
    if (!target) continue;
    const objStart = objectStart(cond, mission);
    if (objStart) {
      total += v3Dist(prev, objStart);
      total += v3Dist(objStart, target);
      prev = target;
    } else {
      total += v3Dist(prev, target);
      prev = target;
    }
  }
  return total > 0 ? total : 0.4;
}

function conditionTarget(c: Condition, mission: MissionDefinition): Vec3 | null {
  switch (c.type) {
    case 'position':  return c.region.kind === 'sphere'
      ? c.region.center
      : [
          (c.region.min[0] + c.region.max[0]) / 2,
          (c.region.min[1] + c.region.max[1]) / 2,
          (c.region.min[2] + c.region.max[2]) / 2,
        ];
    case 'stackedOn': {
      const lower = mission.objects.find((o) => o.id === c.lower);
      return lower ? lower.initialPos : null;
    }
    default:          return null;
  }
}

function objectStart(c: Condition, mission: MissionDefinition): Vec3 | null {
  const id = c.type === 'position' || c.type === 'orientation' || c.type === 'atRest' || c.type === 'held'
    ? c.target
    : c.type === 'stackedOn'
    ? c.upper
    : null;
  if (!id) return null;
  const obj = mission.objects.find((o) => o.id === id);
  return obj ? obj.initialPos : null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function v3Dist(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
function v3Norm(v: Vec3): number {
  return Math.hypot(v[0], v[1], v[2]);
}
function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
