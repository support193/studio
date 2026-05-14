// Mission player — Figma "mission_detail" (4:143646) port.
//
// Layout (inside ChromeShell's <main> which already provides the 52px TopNav
// and 240px Sidebar):
//
//   ┌─ Header (title left / big MM:SS timer right) ──────────────────┐
//   ├─ Body ────────────────────────────────────────────────────────┐│
//   │ Goal+Step (w-420px) │ MuJoCo viewport + GripperCam inset      ││
//   ├─ Control footer (keyboard + camera help) ─────────────────────┤│
//   └────────────────────────────────────────────────────────────────┘

'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  RotateCcw, Trophy, XCircle, Clock, Star, Play, X, Sparkles,
  MousePointer2, MousePointerClick, ZoomIn, ChevronDown, ChevronUp,
} from 'lucide-react';
import { PandaV3Scene } from '@/components/3d-studio/PandaV3Scene';
import GripperCamView from '@/components/missions/GripperCamView';
import { usePandaV3Controls } from '@/hooks/usePandaV3Controls';
import type {
  PandaV3FrameSnapshot,
  PandaV3PhysicsHandle,
} from '@/hooks/useMujocoPhysicsPandaV3';
import { evaluateMission } from '@/lib/missions/evaluator';
import {
  MetricsTracker,
  estimateOptimalPath,
  type EvalMetrics,
  type TrajectoryFrame,
} from '@/lib/missions/metrics';
import type {
  Condition,
  EvalResult,
  GripperState,
  MissionDefinition,
  Quat,
  Vec3,
} from '@/lib/missions/types';

const STABILITY_DWELL_MS = 1000;

const ONBOARDING_KEY = 'zeno-mission-tutorial-seen';

export default function MissionPlayer({
  mission,
  logId,
}: {
  mission: MissionDefinition;
  logId: string | null;
}) {
  const router = useRouter();
  const controls = usePandaV3Controls();
  const frameDataRef = useRef<PandaV3FrameSnapshot | null>(null);
  const physRef = useRef<PandaV3PhysicsHandle | null>(null);
  const onPhysHandle = useCallback((h: PandaV3PhysicsHandle) => {
    physRef.current = h;
  }, []);

  const startMsRef = useRef<number>(Date.now());
  const [started, setStarted] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [elapsedS, setElapsedS] = useState(0);
  const [evalRes, setEvalRes] = useState<EvalResult>({ result: 'running', satisfied: 0, total: mission.successConditions.length });
  const [stabilizing, setStabilizing] = useState(false);
  const [resultDone, setResultDone] = useState<EvalResult | null>(null);
  const [metrics, setMetrics] = useState<EvalMetrics | null>(null);
  const [sensitivity, setSensitivity] = useState(100);
  const [controlsOpen, setControlsOpen] = useState(true);

  const trackerRef = useRef<MetricsTracker>(new MetricsTracker());
  const lastSampleMsRef = useRef<number>(Date.now());
  const firstAllSatMsRef = useRef<number | null>(null);
  const optimalPathMRef = useRef<number>(0);
  const finalisedRef = useRef<boolean>(false);
  // Trajectory frames captured at the 100ms tick — POSTed at finalise so
  // the server can recompute the canonical score (and optionally archive
  // the full trajectory in Supabase Storage for downstream BC training).
  const framesRef = useRef<TrajectoryFrame[]>([]);

  // ids of every object referenced in any success condition — used by the
  // metrics tracker to know which contacts/releases to record.
  const relevantIds = useMemo(() => collectConditionIds(mission.successConditions), [mission]);

  // Onboarding gate: localStorage check.  SSR-safe.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const seen = localStorage.getItem(ONBOARDING_KEY);
    if (seen) {
      setStarted(true);
      startMsRef.current = Date.now();
      lastSampleMsRef.current = Date.now();
    } else {
      setShowOnboarding(true);
    }
  }, []);

  // 100ms tracker update.  Runs only after the timer is live.
  useEffect(() => {
    const id = setInterval(() => {
      if (!started || finalisedRef.current) return;
      const phys = physRef.current;
      if (!phys || !phys.state.loaded) return;
      const handBody = phys.bodiesRef.current.find((b) => b.name === 'hand');
      if (!handBody) return;

      // Lazily capture optimal-path estimate on first valid tick.
      if (optimalPathMRef.current === 0) {
        optimalPathMRef.current = estimateOptimalPath(mission, handBody.position as Vec3);
      }

      const fd = frameDataRef.current;
      const closed = fd ? Math.max(0, Math.min(1, fd.gripper_cmd / 255)) : 0;

      const now = Date.now();
      const dt = (now - lastSampleMsRef.current) / 1000;
      lastSampleMsRef.current = now;
      const handPos = handBody.position as Vec3;
      const handQuat = handBody.quaternion as Quat;
      const objects = phys.objectStatesRef.current;
      trackerRef.current.update(
        handPos,
        closed,
        objects,
        relevantIds,
        /* failActiveNow */ false,
        dt,
      );
      // Record the frame for server-side replay.  Snapshot the object
      // states (the ref array is mutated in place by the physics loop).
      framesRef.current.push({
        t: (now - startMsRef.current) / 1000,
        hand_p: [handPos[0], handPos[1], handPos[2]],
        hand_q: [handQuat[0], handQuat[1], handQuat[2], handQuat[3]],
        grip: closed,
        objs: objects.map((o) => ({
          id: o.id,
          p: [o.pos[0], o.pos[1], o.pos[2]],
          q: [o.quat[0], o.quat[1], o.quat[2], o.quat[3]],
          lv: [o.linVel[0], o.linVel[1], o.linVel[2]],
          av: [o.angVel[0], o.angVel[1], o.angVel[2]],
        })),
      });
    }, 100);
    return () => clearInterval(id);
  }, [started, mission, relevantIds]);

  // 1Hz evaluator + dwell-aware result handling.
  useEffect(() => {
    const id = setInterval(() => {
      if (!started || finalisedRef.current) return;
      const elapsed = (Date.now() - startMsRef.current) / 1000;
      setElapsedS(elapsed);

      const phys = physRef.current;
      if (!phys || !phys.state.loaded) return;

      const fd = frameDataRef.current;
      const closed = fd ? Math.max(0, Math.min(1, fd.gripper_cmd / 255)) : 0;
      const handBody = phys.bodiesRef.current.find((b) => b.name === 'hand');
      const gripper: GripperState = {
        closed,
        pos: handBody ? handBody.position : [0, 0, 0],
      };

      const r = evaluateMission(mission, phys.objectStatesRef.current, gripper, elapsed);
      setEvalRes(r);

      if (r.result === 'success') {
        // Stability dwell: all conditions met, but only count as success
        // once they've held continuously for STABILITY_DWELL_MS.
        if (firstAllSatMsRef.current === null) firstAllSatMsRef.current = Date.now();
        const dwell = Date.now() - firstAllSatMsRef.current;
        if (dwell >= STABILITY_DWELL_MS) {
          setStabilizing(false);
          finaliseRun(r);
        } else {
          setStabilizing(true);
        }
      } else if (r.result === 'failed' || r.result === 'timeout') {
        firstAllSatMsRef.current = null;
        setStabilizing(false);
        finaliseRun(r);
      } else {
        // back to running — reset dwell.
        firstAllSatMsRef.current = null;
        setStabilizing(false);
      }
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mission, started]);

  // Finalise an episode: compute metrics, POST to logger, surface in modal.
  function finaliseRun(r: EvalResult) {
    if (finalisedRef.current) return;
    finalisedRef.current = true;
    setResultDone(r);

    const total = mission.successConditions.length;
    const satisfiedFrac = r.result === 'success'
      ? 1
      : r.result === 'running'
      ? (total === 0 ? 0 : r.satisfied / total)
      : 0;
    const stepsInOrderFrac = mission.steps.length === 0
      ? 1
      : Math.min(1, satisfiedFrac);

    const elapsed = r.result === 'success' ? r.elapsedS : elapsedS;

    const m = trackerRef.current.finalize({
      hardSuccess: r.result === 'success',
      anyFailEverFired: r.result === 'failed',
      satisfiedFrac,
      stepsInOrderFrac,
      elapsedS: elapsed,
      timeLimitS: mission.timeLimitS,
      parTimeS: mission.parTimeS,
      optimalPathM: optimalPathMRef.current,
      timedOut: r.result === 'timeout',
    });
    setMetrics(m);

    if (logId) {
      // Server recomputes the canonical score from the frames we recorded;
      // the locally-computed `m` is just a fast preview shown in the modal
      // until the server response (if any) overrides it.
      fetch(`/api/missions/log/${logId}/finish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          elapsedS: elapsed,
          frames: framesRef.current,
        }),
      })
        .then((res) => res.ok ? res.json() : null)
        .then((j) => {
          if (!j || !j.canonical) return;
          // Patch the modal with the server-derived numbers.
          setMetrics((prev) => prev ? {
            ...prev,
            qualityScore: j.canonical.qualityScore,
            stars: j.canonical.stars,
            sub: j.canonical.sub,
            flags: j.canonical.flags,
          } : prev);
        })
        .catch(() => { /* network error — local preview stays */ });
    }
  }

  const handleReset = useCallback(() => {
    setResultDone(null);
    setMetrics(null);
    setStabilizing(false);
    setElapsedS(0);
    setEvalRes({ result: 'running', satisfied: 0, total: mission.successConditions.length });
    startMsRef.current = Date.now();
    lastSampleMsRef.current = Date.now();
    firstAllSatMsRef.current = null;
    finalisedRef.current = false;
    optimalPathMRef.current = 0;
    framesRef.current = [];
    trackerRef.current.reset();
    controls.resetRef.current = true;
    physRef.current?.resetMissionObjects();
  }, [controls, mission.successConditions.length]);

  function dismissOnboarding() {
    if (typeof window !== 'undefined') {
      localStorage.setItem(ONBOARDING_KEY, '1');
    }
    setShowOnboarding(false);
    setStarted(true);
    startMsRef.current = Date.now();
    lastSampleMsRef.current = Date.now();
    trackerRef.current.reset();
  }

  // Countdown — remaining seconds = timeLimit - elapsed.  Clamps at 0.
  const remainingS = Math.max(0, mission.timeLimitS - elapsedS);
  const remM = String(Math.floor(remainingS / 60)).padStart(2, '0');
  const remSec = String(Math.floor(remainingS % 60)).padStart(2, '0');
  const danger = remainingS <= 30;
  const warning = !danger && remainingS <= 60;

  // Current step tracking (drives the highlight in the Step list).
  const total = mission.successConditions.length;
  const satisfied = evalRes.result === 'running'
    ? evalRes.satisfied
    : (evalRes.result === 'success' ? total : 0);
  const stepsLen = mission.steps.length;
  const currentStepIdx = stepsLen === 0
    ? -1
    : Math.min(stepsLen - 1, Math.floor((satisfied / Math.max(1, total)) * stepsLen));

  const minuteColor = danger
    ? 'text-[#ef4444]'
    : warning
    ? 'text-[#facc15]'
    : remM === '00'
    ? 'text-[#7b7b80]'
    : 'text-[#f8f9fa]';
  const secondColor = danger ? 'text-[#ef4444]' : warning ? 'text-[#facc15]' : 'text-[#f8f9fa]';

  return (
    <div className="flex h-[calc(100vh-52px)] w-full flex-col overflow-hidden bg-[#030303]">
      {/* ─── Header: title + countdown ───────────────────────────────── */}
      <header className="flex shrink-0 items-center justify-between border-b border-[#1a1a1a] px-[24px] py-[16px]">
        <h1 className="font-manrope text-[28px] font-semibold leading-[1.2] text-[#f8f9fa] xl:text-[32px]">
          {mission.title}
        </h1>
        <div className="flex items-center gap-[6px]">
          <TimeColumn value={remM} label="Minutes" valueColor={minuteColor} />
          <TimerColon />
          <TimeColumn value={remSec} label="Seconds" valueColor={secondColor} />
        </div>
      </header>

      {/* ─── Body: left Goal/Step panel + right MuJoCo viewport ───── */}
      <div className="flex min-h-0 flex-1">
        {/* Left: Goal + Step */}
        <aside className="flex w-[420px] shrink-0 flex-col overflow-y-auto border-r border-[#1a1a1a]">
          <SectionHeader>Goal</SectionHeader>
          <div className="px-[20px] py-[20px]">
            <p className="font-manrope text-[18px] leading-[1.4] text-[#f8f9fa] xl:text-[20px]">
              {mission.goal ?? ''}
            </p>
          </div>

          <SectionHeader withTopBorder>Step</SectionHeader>
          <ol className="flex flex-col gap-[8px] px-[20px] py-[20px]">
            {mission.steps.map((step, i) => {
              const done = i < currentStepIdx;
              const current = i === currentStepIdx;
              return (
                <li key={i} className="flex items-start gap-[8px]">
                  <span
                    className={[
                      'mt-[1px] inline-flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-full border font-manrope text-[11px] font-bold leading-[16px]',
                      done
                        ? 'border-[#22c55e]/60 bg-[#22c55e]/20 text-[#22c55e]'
                        : current
                        ? 'border-[#7C5CFC] bg-[#7C5CFC]/25 text-[#f8f9fa]'
                        : 'border-[rgba(248,249,250,0.5)] bg-[rgba(248,249,250,0.1)] text-[#f8f9fa]',
                    ].join(' ')}
                  >
                    {i + 1}
                  </span>
                  <span
                    className={[
                      'flex-1 font-manrope text-[14px] leading-[1.4]',
                      current ? 'text-[#f8f9fa]' : done ? 'text-[#535357]' : 'text-[#929399]',
                    ].join(' ')}
                  >
                    {step}
                  </span>
                </li>
              );
            })}
            {mission.steps.length === 0 && (
              <li className="font-manrope text-[13px] italic text-[#535357]">
                No sub-steps defined for this mission.
              </li>
            )}
          </ol>
        </aside>

        {/* Right: MuJoCo viewport with GripperCam inset overlay */}
        <section className="relative flex-1">
          <PandaV3Scene
            controls={controls}
            frameDataRef={frameDataRef}
            onPhysHandle={onPhysHandle}
            missionObjects={mission.objects}
            missionSuccessConditions={mission.successConditions}
            missionFailConditions={mission.failConditions}
          />

          {/* Gripper cam inset (top-left of viewport) */}
          <div className="absolute left-[16px] top-[16px] z-10 w-[200px] overflow-hidden rounded-[8px] border border-[#1f1f1f] bg-black/40 backdrop-blur">
            <div className="flex items-center justify-between border-b border-[#1f1f1f] px-[10px] py-[4px]">
              <span className="font-manrope text-[10px] font-semibold uppercase tracking-wider text-[#a48dff]">
                Gripper Cam
              </span>
              <span className="font-mono text-[9px] text-[#737780]">POV</span>
            </div>
            <div className="aspect-video bg-black">
              <GripperCamView
                physRef={physRef}
                missionObjects={mission.objects}
                missionSuccessConditions={mission.successConditions}
                missionFailConditions={mission.failConditions}
              />
            </div>
          </div>
        </section>
      </div>

      {/* ─── Footer: Control help (keyboard + camera + speed).
           The 56px header bar is always present; viewport sizing is fixed
           to that closed state.  The expanded content sits on an absolute
           panel that slides up OVER the viewport (no reflow), animated via
           translate-y for a smooth open/close. ─────────────────────────── */}
      <footer className="relative shrink-0 h-[56px]">
        {/* Sliding panel — sits above the always-visible header.  When
            closed, it's translated below itself and clipped by the player
            root's overflow-hidden. */}
        <div
          className={[
            'absolute bottom-[56px] left-0 right-0 z-0 border-t border-[#1a1a1a] bg-[#030303] shadow-[0_-12px_24px_-12px_rgba(0,0,0,0.6)]',
            'transition-transform duration-300 ease-out',
            controlsOpen ? 'translate-y-0' : 'pointer-events-none translate-y-full',
          ].join(' ')}
          aria-hidden={!controlsOpen}
        >
          <div className="flex items-stretch gap-[60px] overflow-x-auto px-[16px] py-[20px]">
          {/* MOVE group */}
          <ControlGroup
            badgeLabel="Move"
            badgeClass="bg-[rgba(54,118,248,0.15)] text-[#3676f8]"
          >
            <WasdDiamond />
            <KeyPair keys={['W', 'S']} caption="Forward / Backward" small />
            <KeyPair keys={['A', 'D']} caption="Left / Right" small />
          </ControlGroup>

          <ControlGroup>
            <KeyGroup>
              <KeyCap label="Q" />
              <KeyCap label="E" />
            </KeyGroup>
            <KeyCaption keys={['Q']} caption="Gripper Up" small />
            <KeyCaption keys={['E']} caption="Gripper Down" small />
          </ControlGroup>

          <ControlGroup>
            <KeyGroup>
              <KeyCap label="Z" />
              <KeyCap label="C" />
            </KeyGroup>
            <KeyCaption keys={['Z']} caption="Gripper Rotate Left" small />
            <KeyCaption keys={['C']} caption="Gripper Rotate Right" small />
          </ControlGroup>

          <ControlGroup>
            <KeyCap label="Space Bar" wide />
            <span className="font-manrope text-[14px] leading-[1.4] text-[#929399]">
              Gripper Grab
            </span>
          </ControlGroup>

          <ControlGroup>
            <KeyCap label="R" />
            <span className="font-manrope text-[14px] leading-[1.4] text-[#929399]">
              Reset
            </span>
          </ControlGroup>

          {/* Camera group */}
          <ControlGroup
            badgeLabel="Camera"
            badgeClass="bg-[rgba(239,75,220,0.15)] text-[#ef4bdc]"
          >
            <div className="flex items-start gap-[16px]">
              <CameraIcon icon={<MousePointer2 size={28} strokeWidth={1.5} />} label="Pan" />
              <CameraIcon icon={<MousePointerClick size={28} strokeWidth={1.5} />} label="Drag" />
              <CameraIcon icon={<ZoomIn size={28} strokeWidth={1.5} />} label="Zoom in / out" />
            </div>
          </ControlGroup>

          {/* Speed slider — tucked at the end (not in Figma but kept for /test parity) */}
          <div className="flex flex-col gap-[16px] self-stretch border-l border-[#1a1a1a] pl-[20px]">
            <span className="font-manrope text-[10px] font-semibold uppercase tracking-wider text-[#737780]">
              Speed {sensitivity}%
            </span>
            <input
              type="range"
              min={10}
              max={300}
              step={10}
              value={sensitivity}
              onChange={(e) => {
                const v = parseInt(e.target.value);
                setSensitivity(v);
                controls.setSensitivity(v);
              }}
              className="w-[140px] accent-[#7C5CFC]"
            />
          </div>
          </div>
        </div>

        {/* Always-visible header bar — "Control" label + toggle pressed
            directly to its right. */}
        <div className="absolute inset-0 z-10 flex items-center gap-[8px] border-t border-[#1a1a1a] bg-[#030303] px-[20px]">
          <span className="font-manrope text-[18px] font-medium leading-[1.4] text-[#f8f9fa]">
            Control
          </span>
          <button
            type="button"
            onClick={() => setControlsOpen((v) => !v)}
            aria-label={controlsOpen ? 'Collapse control panel' : 'Expand control panel'}
            title={controlsOpen ? 'Collapse' : 'Expand'}
            className="flex size-[28px] items-center justify-center rounded-[6px] border border-[#1f1f1f] text-[#a8a8b0] transition-colors hover:border-[#7C5CFC] hover:text-white"
          >
            {controlsOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
        </div>
      </footer>

      {/* ─── Onboarding overlay ────────────────────────────────────────── */}
      {showOnboarding && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/85 backdrop-blur-sm">
          <div className="w-[520px] max-w-[92vw] rounded-[16px] border border-[#1f1f1f] bg-[#0A0A0F] p-7">
            <div className="mb-3 flex items-center gap-2">
              <span className="rounded-full bg-[#7C5CFC]/20 px-2.5 py-1 font-manrope text-[10px] font-semibold uppercase tracking-wider text-[#a48dff]">
                Mission start
              </span>
            </div>
            <h2 className="font-manrope text-[24px] font-semibold leading-tight text-white">
              {mission.title}
            </h2>
            {mission.goal && (
              <p className="mt-2 font-manrope text-[14px] leading-relaxed text-[#a8a8b0]">
                {mission.goal}
              </p>
            )}

            <div className="mt-5 rounded-[10px] border border-[#1f1f1f] bg-[rgba(248,249,250,0.02)] p-4">
              <div className="mb-3 font-manrope text-[10px] font-semibold uppercase tracking-wider text-[#737780]">
                Basic controls
              </div>
              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-[12px]">
                <MiniKeys keys={['W', 'A', 'S', 'D']} /> <MiniAction>Move (forward / left / back / right)</MiniAction>
                <MiniKeys keys={['Q', 'E']} />          <MiniAction>Up / down</MiniAction>
                <MiniKeys keys={['Space']} />           <MiniAction>Grab / release</MiniAction>
                <MiniKeys keys={['R']} />               <MiniAction>Reset</MiniAction>
              </div>
              <div className="mt-2 font-manrope text-[10px] italic text-[#535357]">
                Full key reference is shown in the Control bar at the bottom.
              </div>
            </div>

            <button
              onClick={dismissOnboarding}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-[#7C5CFC] py-3 font-manrope text-[14px] font-semibold text-white hover:bg-[#6B4FE0]"
            >
              <Play size={14} fill="white" /> Start
            </button>
            <button
              onClick={() => router.push('/missions')}
              className="mt-2 flex w-full items-center justify-center gap-1 rounded-full py-2 font-manrope text-[12px] text-[#737780] hover:text-white"
            >
              <X size={12} /> Exit
            </button>
          </div>
        </div>
      )}

      {/* ─── Stabilizing pill (visible during the 1s dwell after all conds hit) ─── */}
      {stabilizing && !resultDone && (
        <div className="absolute left-1/2 top-[120px] z-20 -translate-x-1/2 rounded-full border border-[#7C5CFC] bg-[#7C5CFC]/15 px-4 py-1.5 backdrop-blur">
          <span className="font-manrope text-[12px] font-semibold uppercase tracking-wider text-[#a48dff]">
            Stabilizing… hold still
          </span>
        </div>
      )}

      {/* ─── Result modal ──────────────────────────────────────────────── */}
      {resultDone && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="w-[460px] rounded-[12px] border border-[#1f1f1f] bg-[#0A0A0F] p-6">
            {/* Headline */}
            <div className="text-center">
              {resultDone.result === 'success' ? (
                <>
                  <Trophy className="mx-auto mb-3 text-[#FACC15]" size={48} />
                  <div className="font-manrope text-[24px] font-semibold text-white">Mission complete</div>
                </>
              ) : resultDone.result === 'timeout' ? (
                <>
                  <Clock className="mx-auto mb-3 text-[#737780]" size={48} />
                  <div className="font-manrope text-[24px] font-semibold text-white">Time up</div>
                  <div className="mt-1 font-manrope text-[13px] text-[#a8a8b0]">
                    Could not finish within {formatTime(mission.timeLimitS)}.
                  </div>
                </>
              ) : resultDone.result === 'failed' ? (
                <>
                  <XCircle className="mx-auto mb-3 text-red-400" size={48} />
                  <div className="font-manrope text-[24px] font-semibold text-white">Mission failed</div>
                  <div className="mt-1 font-manrope text-[13px] text-[#a8a8b0]">
                    {resultDone.reason}
                  </div>
                </>
              ) : null}
            </div>

            {/* Quality breakdown */}
            {metrics && (
              <>
                <div className="mt-4 flex items-center justify-center gap-1">
                  {[1, 2, 3].map((i) => (
                    <Star
                      key={i}
                      size={28}
                      className={i <= metrics.stars ? 'text-[#FACC15]' : 'text-[#2a2a35]'}
                      fill={i <= metrics.stars ? '#FACC15' : 'none'}
                    />
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-center gap-6">
                  <div className="text-center">
                    <div className="font-manrope text-[10px] uppercase tracking-wider text-[#737780]">Quality</div>
                    <div className="font-manrope text-[28px] font-semibold text-white">{metrics.qualityScore}</div>
                  </div>
                  <div className="text-center">
                    <div className="font-manrope text-[10px] uppercase tracking-wider text-[#737780]">XP</div>
                    <div className="flex items-center gap-1 font-manrope text-[15px] font-medium text-[#a48dff]">
                      <Sparkles size={14} /> Paid out next week
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex flex-col gap-1.5 rounded-[8px] border border-[#1f1f1f] bg-[rgba(248,249,250,0.02)] p-3">
                  <SubMetricBar label="Task"       value={metrics.sub.task_completion} />
                  <SubMetricBar label="Time"       value={metrics.sub.time_efficiency} />
                  <SubMetricBar label="Path"       value={metrics.sub.path_efficiency} />
                  <SubMetricBar label="Smoothness" value={metrics.sub.smoothness} />
                  <SubMetricBar label="Stability"  value={metrics.sub.stability} />
                  <SubMetricBar label="Economy"    value={metrics.sub.economy} />
                </div>
                <div className="mt-2 font-manrope text-[10px] text-[#535357]">
                  Time {metrics.elapsedS.toFixed(1)}s · Path {metrics.pathLengthM.toFixed(2)}m · Toggles {metrics.raw.gripperToggleCount}
                </div>
              </>
            )}

            <div className="mt-6 flex justify-center gap-3">
              <Link
                href="/missions"
                className="rounded-full border border-[#1f1f1f] px-5 py-2 font-manrope text-[13px] text-[#a8a8b0] hover:bg-[rgba(248,249,250,0.05)]"
              >
                Back
              </Link>
              <button
                onClick={handleReset}
                className="flex items-center gap-1.5 rounded-full bg-[#7C5CFC] px-5 py-2 font-manrope text-[13px] font-medium text-white hover:bg-[#6B4FE0]"
              >
                <RotateCcw size={13} /> Try again
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Header timer pieces ──────────────────────────────────────────────────

function TimeColumn({ value, label, valueColor }: { value: string; label: string; valueColor: string }) {
  return (
    <div className="flex w-[72px] flex-col items-center whitespace-nowrap">
      <p className={`font-manrope text-[40px] font-semibold leading-none xl:text-[48px] ${valueColor}`}>
        {value}
      </p>
      <p className="mt-1 font-manrope text-[12px] uppercase leading-[normal] text-[#494a4d] xl:text-[14px]">
        {label}
      </p>
    </div>
  );
}

function TimerColon() {
  return (
    <div className="flex h-[30px] w-[4px] flex-col justify-between">
      <span className="size-[4px] rounded-full bg-[#7b7b80]" />
      <span className="size-[4px] rounded-full bg-[#7b7b80]" />
    </div>
  );
}

// ─── Body section header (Goal / Step / Control) ─────────────────────────

function SectionHeader({
  children, withTopBorder = false,
}: {
  children: React.ReactNode;
  withTopBorder?: boolean;
}) {
  return (
    <div
      className={[
        'flex h-[56px] shrink-0 items-center border-b border-[#1a1a1a] px-[20px] py-[12px]',
        withTopBorder ? 'border-t' : '',
      ].join(' ')}
    >
      <span className="font-manrope text-[18px] font-medium leading-[1.4] text-[#f8f9fa]">
        {children}
      </span>
    </div>
  );
}

// ─── Control footer pieces ────────────────────────────────────────────────

function ControlGroup({
  badgeLabel, badgeClass, children,
}: {
  badgeLabel?: string;
  badgeClass?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex shrink-0 flex-col items-start gap-[16px]">
      {badgeLabel && badgeClass && (
        <span className={`inline-flex items-center justify-center rounded-[6px] px-[16px] py-[7px] font-manrope text-[14px] font-medium leading-[18px] ${badgeClass}`}>
          {badgeLabel}
        </span>
      )}
      {children}
    </div>
  );
}

function KeyCap({ label, wide = false }: { label: string; wide?: boolean }) {
  return (
    <span
      className={[
        'inline-flex items-center justify-center rounded-[6px] border border-[#525252] bg-black px-[10px] py-[8px] font-manrope text-[14px] font-bold leading-[14px] text-[#f8f9fa]',
        wide ? 'h-[34px] w-[180px]' : 'h-[34px] w-[34px]',
      ].join(' ')}
    >
      {label}
    </span>
  );
}

function KeyGroup({ children }: { children: React.ReactNode }) {
  return <div className="flex gap-[8px]">{children}</div>;
}

function WasdDiamond() {
  // Single W on top, A/S/D on the bottom row (Figma layout).
  return (
    <div className="flex flex-col items-center gap-[8px]">
      <KeyCap label="W" />
      <div className="flex gap-[8px]">
        <KeyCap label="A" />
        <KeyCap label="S" />
        <KeyCap label="D" />
      </div>
    </div>
  );
}

function KeyPair({
  keys, caption, small = false,
}: {
  keys: string[];
  caption: string;
  small?: boolean;
}) {
  return (
    <div className="flex items-center gap-[8px]">
      <span className="flex items-center gap-[2px]">
        {keys.map((k, i) => (
          <span key={k} className="flex items-center gap-[2px]">
            <span
              className={[
                'inline-flex items-center justify-center rounded-[4px] border border-[#525252] bg-black font-manrope font-bold leading-[14px] text-[#f8f9fa]',
                small ? 'h-[20px] w-[20px] text-[9px]' : 'h-[24px] w-[24px] text-[11px]',
              ].join(' ')}
            >
              {k}
            </span>
            {i < keys.length - 1 && (
              <span className="font-manrope text-[14px] text-[#929399]">/</span>
            )}
          </span>
        ))}
      </span>
      <span className="font-manrope text-[14px] leading-[1.4] text-[#929399]">{caption}</span>
    </div>
  );
}

function KeyCaption({
  keys, caption, small = false,
}: {
  keys: string[];
  caption: string;
  small?: boolean;
}) {
  return (
    <div className="flex items-center gap-[8px]">
      <span className="flex items-center gap-[2px]">
        {keys.map((k) => (
          <span
            key={k}
            className={[
              'inline-flex items-center justify-center rounded-[4px] border border-[#525252] bg-black font-manrope font-bold leading-[14px] text-[#f8f9fa]',
              small ? 'h-[20px] w-[20px] text-[9px]' : 'h-[24px] w-[24px] text-[11px]',
            ].join(' ')}
          >
            {k}
          </span>
        ))}
      </span>
      <span className="font-manrope text-[14px] leading-[1.4] text-[#929399]">{caption}</span>
    </div>
  );
}

function CameraIcon({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex w-[64px] flex-col items-center gap-[16px]">
      <span className="text-[#f8f9fa]">{icon}</span>
      <span className="font-manrope text-[14px] leading-[1.4] text-[#929399]">{label}</span>
    </div>
  );
}

// ─── Misc ──────────────────────────────────────────────────────────────────

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function MetricCell({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="flex items-center gap-1 text-[#737780]">
        {icon}
        <span className="font-manrope text-[9px] uppercase tracking-wider">{label}</span>
      </div>
      <span className="font-mono text-[14px] font-semibold text-white">{value}</span>
    </div>
  );
}

function MiniKeys({ keys }: { keys: string[] }) {
  return (
    <div className="flex items-center gap-0.5">
      {keys.map((k) => (
        <kbd
          key={k}
          className="inline-flex min-w-[22px] items-center justify-center rounded border border-[rgba(248,249,250,0.15)] bg-[rgba(248,249,250,0.06)] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#e8e8ee]"
        >
          {k}
        </kbd>
      ))}
    </div>
  );
}

function MiniAction({ children }: { children: React.ReactNode }) {
  return (
    <span className="self-center font-manrope text-[11px] text-[#a8a8b0]">{children}</span>
  );
}

function collectConditionIds(conds: Condition[]): Set<string> {
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

function SubMetricBar({ label, value }: { label: string; value: number }) {
  const pct = Math.max(0, Math.min(1, value));
  const color = pct >= 0.8 ? '#22c55e' : pct >= 0.55 ? '#facc15' : '#7C5CFC';
  return (
    <div className="flex items-center gap-[8px]">
      <span className="w-[78px] shrink-0 font-manrope text-[10px] uppercase tracking-wider text-[#737780]">
        {label}
      </span>
      <div className="relative h-[6px] flex-1 overflow-hidden rounded-full bg-[rgba(248,249,250,0.06)]">
        <div className="absolute inset-y-0 left-0 transition-all" style={{ width: `${pct * 100}%`, backgroundColor: color }} />
      </div>
      <span className="w-[34px] shrink-0 text-right font-mono text-[10px] text-[#a8a8b0]">
        {Math.round(pct * 100)}
      </span>
    </div>
  );
}
