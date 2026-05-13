// Mission player — 키보드 조작 + 매 프레임 evaluator 호출 + HUD + 결과 모달.
//
// Phase 15 UI:
//  - Steps 체크리스트 (좌측) — mission.steps 를 순서대로, 현재 단계 강조
//  - Progress bar (상단) — 조건 게이지 + 시간 게이지
//  - Controls 패널 (우하단 접기 가능) — 키보드 키 그래픽
//  - Reset 버튼 (상단 우측) — R 키 대안
//  - Onboarding overlay (첫 진입 시) — 목표 + 조작법, localStorage 1회

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, RotateCcw, Trophy, XCircle, Clock, Star, Route, Activity,
  Check, ChevronDown, ChevronUp, Keyboard, Play, X,
} from 'lucide-react';
import { PandaV3Scene } from '@/components/3d-studio/PandaV3Scene';
import { usePandaV3Controls } from '@/hooks/usePandaV3Controls';
import type {
  PandaV3FrameSnapshot,
  PandaV3PhysicsHandle,
} from '@/hooks/useMujocoPhysicsPandaV3';
import { evaluateMission } from '@/lib/missions/evaluator';
import { describeCondition, shortLabel } from '@/lib/missions/describe';
import { MetricsTracker, type EvalMetrics } from '@/lib/missions/metrics';
import type {
  EvalResult,
  GripperState,
  MissionDefinition,
} from '@/lib/missions/types';

const ONBOARDING_KEY = 'zeno-mission-tutorial-seen';

export default function MissionPlayer({ mission }: { mission: MissionDefinition }) {
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
  const [resultDone, setResultDone] = useState<EvalResult | null>(null);
  const [metrics, setMetrics] = useState<EvalMetrics | null>(null);
  const [controlsOpen, setControlsOpen] = useState(true);
  const [sensitivity, setSensitivity] = useState(100);

  const trackerRef = useRef<MetricsTracker>(new MetricsTracker());
  const lastSampleMsRef = useRef<number>(Date.now());

  // Onboarding gate: localStorage 확인.  ssr-safe.
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

  // 100ms gripper sampling (started 이후만 누적).
  useEffect(() => {
    const id = setInterval(() => {
      if (!started) return;
      const phys = physRef.current;
      if (!phys || !phys.state.loaded) return;
      const handBody = phys.bodiesRef.current.find((b) => b.name === 'hand');
      if (!handBody) return;
      const now = Date.now();
      const dt = (now - lastSampleMsRef.current) / 1000;
      lastSampleMsRef.current = now;
      trackerRef.current.update(handBody.position, dt);
    }, 100);
    return () => clearInterval(id);
  }, [started]);

  // 1초마다 timer + evaluator (started 이후만).
  useEffect(() => {
    const id = setInterval(() => {
      if (!started) return;
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
      if (r.result !== 'running') {
        setResultDone(r);
        if (r.result === 'success') {
          setMetrics(trackerRef.current.finalize(r.elapsedS, mission.timeLimitS));
        }
      }
    }, 1000);
    return () => clearInterval(id);
  }, [mission, started]);

  const handleReset = useCallback(() => {
    setResultDone(null);
    setMetrics(null);
    setElapsedS(0);
    setEvalRes({ result: 'running', satisfied: 0, total: mission.successConditions.length });
    startMsRef.current = Date.now();
    lastSampleMsRef.current = Date.now();
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

  const total = mission.successConditions.length;
  const satisfied = evalRes.result === 'running' ? evalRes.satisfied : (evalRes.result === 'success' ? total : 0);
  const timeRatio = Math.min(1, elapsedS / mission.timeLimitS);
  // 현재 단계: satisfied 비율을 steps 개수에 매핑.  마지막 단계까지 도달하면 stay.
  const stepsLen = mission.steps.length;
  const currentStepIdx = stepsLen === 0
    ? -1
    : Math.min(stepsLen - 1, Math.floor((satisfied / Math.max(1, total)) * stepsLen));

  return (
    // 루트는 layout 의 main (pt-52, pl-240 md+) 내부에 맞게 fit.  w-screen / h-screen
    // 쓰면 sidebar 240px 만큼 우측으로 overflow → 우측 absolute (controls 패널 등)
    // 가 화면 밖으로 밀려나는 버그가 있음.
    <div className="relative h-[calc(100vh-52px)] w-full overflow-hidden bg-[#0A0A0F]">
      {/* ─── Top: back / title / progress / reset ─────────────────────────── */}
      <div className="absolute left-4 right-4 top-4 z-10 flex items-start gap-3">
        {/* Back */}
        <button
          onClick={() => router.push('/missions')}
          className="flex size-[36px] shrink-0 items-center justify-center rounded-full border border-[#1f1f1f] bg-black/40 text-[#737780] backdrop-blur hover:text-white"
          title="Back to missions"
        >
          <ArrowLeft size={16} />
        </button>

        {/* Title + goal */}
        <div className="shrink-0 rounded-[10px] border border-[#1f1f1f] bg-black/40 px-4 py-2 backdrop-blur">
          <div className="font-manrope text-[14px] font-semibold text-white">{mission.title}</div>
          {mission.goal && (
            <div className="mt-0.5 max-w-[400px] font-manrope text-[12px] text-[#a8a8b0]">{mission.goal}</div>
          )}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Progress: conditions + time + reset */}
        <div className="flex shrink-0 items-center gap-3 rounded-[10px] border border-[#1f1f1f] bg-black/40 px-4 py-2 backdrop-blur">
          <div className="flex flex-col gap-1.5">
            {/* Conditions gauge — N칸 */}
            <div className="flex items-center gap-2">
              <span className="font-manrope text-[10px] uppercase tracking-wider text-[#737780]">
                목표
              </span>
              <div className="flex items-center gap-0.5">
                {Array.from({ length: Math.max(1, total) }).map((_, i) => (
                  <span
                    key={i}
                    className={`h-[8px] w-[24px] rounded-[2px] transition-colors ${
                      i < satisfied ? 'bg-[#22c55e]' : 'bg-[rgba(248,249,250,0.1)]'
                    }`}
                  />
                ))}
              </div>
              <span className="font-mono text-[12px] tabular-nums text-white">{satisfied}/{total}</span>
            </div>
            {/* Time gauge */}
            <div className="flex items-center gap-2">
              <Clock size={12} className="text-[#a48dff]" />
              <div className="relative h-[6px] w-[180px] overflow-hidden rounded-[2px] bg-[rgba(248,249,250,0.1)]">
                <div
                  className="absolute inset-y-0 left-0 transition-all"
                  style={{
                    width: `${timeRatio * 100}%`,
                    backgroundColor: timeRatio > 0.8 ? '#ef4444' : timeRatio > 0.5 ? '#FACC15' : '#7C5CFC',
                  }}
                />
              </div>
              <span className="font-mono text-[11px] tabular-nums text-[#a8a8b0]">
                {formatTime(elapsedS)} / {formatTime(mission.timeLimitS)}
              </span>
            </div>
          </div>
          <button
            onClick={handleReset}
            title="Reset (R)"
            className="ml-1 flex size-[32px] items-center justify-center rounded-full border border-[#1f1f1f] text-[#a8a8b0] hover:border-[#7C5CFC] hover:text-white"
          >
            <RotateCcw size={14} />
          </button>
        </div>
      </div>

      {/* ─── Left: Steps 체크리스트 ─────────────────────────────────────── */}
      {mission.steps.length > 0 && (
        <div className="absolute left-4 top-[110px] z-10 w-[260px] rounded-[10px] border border-[#1f1f1f] bg-black/40 p-3 backdrop-blur">
          <div className="mb-2 font-manrope text-[10px] font-semibold uppercase tracking-wider text-[#737780]">
            단계
          </div>
          <ol className="flex flex-col gap-1.5">
            {mission.steps.map((step, i) => {
              const done = i < currentStepIdx;
              const current = i === currentStepIdx;
              return (
                <li
                  key={i}
                  className={`flex items-start gap-2 rounded-[6px] px-2 py-1.5 transition-colors ${
                    current ? 'bg-[#7C5CFC]/15' : done ? 'opacity-60' : ''
                  }`}
                >
                  <span
                    className={`mt-[1px] flex size-[18px] shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-semibold ${
                      done
                        ? 'bg-[#22c55e]/25 text-[#22c55e]'
                        : current
                        ? 'bg-[#7C5CFC] text-white'
                        : 'bg-[rgba(248,249,250,0.06)] text-[#737780]'
                    }`}
                  >
                    {done ? <Check size={11} strokeWidth={3} /> : i + 1}
                  </span>
                  <span
                    className={`font-manrope text-[12px] leading-[1.4] ${
                      current ? 'text-white' : done ? 'text-[#737780]' : 'text-[#a8a8b0]'
                    }`}
                  >
                    {step}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {/* ─── Right: Conditions 자연어 진행 카드 ───────────────────────── */}
      {(mission.successConditions.length > 0 || mission.failConditions.length > 0) && (
        <div className="absolute right-4 top-[110px] z-10 max-h-[calc(100vh-260px)] w-[280px] overflow-auto rounded-[10px] border border-[#1f1f1f] bg-black/40 p-3 backdrop-blur">
          {mission.successConditions.length > 0 && (
            <div className="mb-2">
              <div className="mb-1.5 font-manrope text-[10px] font-semibold uppercase tracking-wider text-[#22c55e]">
                성공 조건 (모두)
              </div>
              {mission.successConditions.map((c, i) => {
                const isDone = i < satisfied;
                return (
                  <div
                    key={`s-${i}`}
                    className={`mb-1.5 flex items-start gap-2 rounded-[6px] border px-2 py-1.5 transition-colors ${
                      isDone
                        ? 'border-[#22c55e] bg-[#22c55e]/20'
                        : 'border-[#22c55e]/30 bg-[#22c55e]/10'
                    }`}
                  >
                    {isDone ? (
                      <Check size={12} className="mt-[2px] shrink-0 text-[#22c55e]" strokeWidth={3} />
                    ) : (
                      <span className="mt-[1px] shrink-0 rounded bg-[#22c55e]/25 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase text-[#22c55e]">
                        {shortLabel(c)}
                      </span>
                    )}
                    <span className="font-manrope text-[11px] leading-tight text-[#d8d8de]">
                      {describeCondition(c)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          {mission.failConditions.length > 0 && (
            <div>
              <div className="mb-1.5 font-manrope text-[10px] font-semibold uppercase tracking-wider text-[#ef4444]">
                실패 조건 (하나라도)
              </div>
              {mission.failConditions.map((c, i) => (
                <div key={`f-${i}`} className="mb-1.5 flex items-start gap-2 rounded-[6px] border border-[#ef4444]/30 bg-[#ef4444]/10 px-2 py-1.5">
                  <span className="mt-[1px] shrink-0 rounded bg-[#ef4444]/25 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase text-[#ef4444]">
                    {shortLabel(c)}
                  </span>
                  <span className="font-manrope text-[11px] leading-tight text-[#d8d8de]">
                    {describeCondition(c)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── Bottom-right: Speed 슬라이더 + Controls 패널 ──────────────── */}
      <div className="absolute bottom-4 right-4 z-10 flex flex-col items-end gap-2">
        <div className="w-[220px] rounded-[12px] border border-[#1f1f1f] bg-black/50 p-3 backdrop-blur">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="font-manrope text-[10px] font-semibold uppercase tracking-wider text-[#7C5CFC]">
              속도
            </span>
            <span className="font-mono text-[10px] text-[#C0C0CC]">{sensitivity}%</span>
          </div>
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
            className="w-full accent-[#7C5CFC]"
          />
          <div className="mt-0.5 flex justify-between text-[9px] text-[#555]">
            <span>10%</span>
            <span>100%</span>
            <span>300%</span>
          </div>
        </div>
        {controlsOpen ? (
          <div className="rounded-[12px] border border-[#1f1f1f] bg-black/50 p-3 backdrop-blur">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 font-manrope text-[10px] font-semibold uppercase tracking-wider text-[#737780]">
                <Keyboard size={11} /> 조작
              </div>
              <button
                onClick={() => setControlsOpen(false)}
                className="text-[#737780] hover:text-white"
                title="접기"
              >
                <ChevronDown size={14} />
              </button>
            </div>
            <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[11px]">
              <Keys keys={['W', 'A', 'S', 'D']} /> <Action>이동 (앞/왼/뒤/오)</Action>
              <Keys keys={['Q', 'E']} />          <Action>위 / 아래</Action>
              <Keys keys={['↑', '↓', '←', '→']} /><Action>그리퍼 기울이기</Action>
              <Keys keys={['Z', 'C']} />          <Action>손목 회전</Action>
              <Keys keys={['Space']} />           <Action>그리퍼 닫기 / 열기</Action>
              <Keys keys={['R']} />               <Action>리셋</Action>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setControlsOpen(true)}
            className="flex items-center gap-1.5 rounded-full border border-[#1f1f1f] bg-black/50 px-3 py-1.5 font-manrope text-[11px] text-[#a8a8b0] backdrop-blur hover:text-white"
            title="조작법 보기"
          >
            <Keyboard size={12} /> 조작법
            <ChevronUp size={12} />
          </button>
        )}
      </div>

      {/* ─── Scene ─────────────────────────────────────────────────────── */}
      <PandaV3Scene
        controls={controls}
        frameDataRef={frameDataRef}
        onPhysHandle={onPhysHandle}
        missionObjects={mission.objects}
        missionSuccessConditions={mission.successConditions}
        missionFailConditions={mission.failConditions}
      />

      {/* ─── Onboarding overlay ────────────────────────────────────────── */}
      {showOnboarding && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/85 backdrop-blur-sm">
          <div className="w-[520px] max-w-[92vw] rounded-[16px] border border-[#1f1f1f] bg-[#0A0A0F] p-7">
            <div className="mb-3 flex items-center gap-2">
              <span className="rounded-full bg-[#7C5CFC]/20 px-2.5 py-1 font-manrope text-[10px] font-semibold uppercase tracking-wider text-[#a48dff]">
                미션 시작
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
              <div className="mb-3 flex items-center gap-1.5 font-manrope text-[10px] font-semibold uppercase tracking-wider text-[#737780]">
                <Keyboard size={11} /> 기본 조작
              </div>
              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-[12px]">
                <Keys keys={['W', 'A', 'S', 'D']} /> <Action>이동 (앞/왼/뒤/오)</Action>
                <Keys keys={['Q', 'E']} />          <Action>위 / 아래</Action>
                <Keys keys={['Space']} />           <Action>그리퍼 닫기 / 열기</Action>
                <Keys keys={['R']} />               <Action>처음으로 리셋</Action>
              </div>
              <div className="mt-2 font-manrope text-[10px] italic text-[#535357]">
                * 추가 조작 (회전, 기울이기) 은 우하단 패널에서 확인할 수 있어요.
              </div>
            </div>

            <button
              onClick={dismissOnboarding}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-[#7C5CFC] py-3 font-manrope text-[14px] font-semibold text-white hover:bg-[#6B4FE0]"
            >
              <Play size={14} fill="white" /> 시작
            </button>
            <button
              onClick={() => router.push('/missions')}
              className="mt-2 flex w-full items-center justify-center gap-1 rounded-full py-2 font-manrope text-[12px] text-[#737780] hover:text-white"
            >
              <X size={12} /> 나가기
            </button>
          </div>
        </div>
      )}

      {/* ─── Result modal ──────────────────────────────────────────────── */}
      {resultDone && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="w-[420px] rounded-[12px] border border-[#1f1f1f] bg-[#0A0A0F] p-6 text-center">
            {resultDone.result === 'success' ? (
              <>
                <Trophy className="mx-auto mb-3 text-[#FACC15]" size={48} />
                <div className="font-manrope text-[24px] font-semibold text-white">Mission Complete</div>
                {metrics && (
                  <>
                    <div className="mt-3 flex items-center justify-center gap-1">
                      {[1, 2, 3].map((i) => (
                        <Star
                          key={i}
                          size={28}
                          className={i <= metrics.stars ? 'text-[#FACC15]' : 'text-[#2a2a35]'}
                          fill={i <= metrics.stars ? '#FACC15' : 'none'}
                        />
                      ))}
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-2 rounded-[8px] border border-[#1f1f1f] bg-[rgba(248,249,250,0.02)] p-3">
                      <MetricCell icon={<Clock size={12} />} label="Time" value={`${metrics.elapsedS.toFixed(1)}s`} />
                      <MetricCell icon={<Route size={12} />} label="Path" value={`${metrics.pathLengthM.toFixed(2)}m`} />
                      <MetricCell icon={<Activity size={12} />} label="Smooth" value={`${(metrics.smoothnessScore * 100).toFixed(0)}`} />
                    </div>
                  </>
                )}
                {!metrics && (
                  <div className="mt-1 font-mono text-[14px] text-[#a8a8b0]">
                    Time: {formatTime(resultDone.elapsedS)}
                  </div>
                )}
              </>
            ) : resultDone.result === 'timeout' ? (
              <>
                <Clock className="mx-auto mb-3 text-[#737780]" size={48} />
                <div className="font-manrope text-[24px] font-semibold text-white">시간 종료</div>
                <div className="mt-1 font-manrope text-[13px] text-[#a8a8b0]">
                  {formatTime(mission.timeLimitS)} 안에 완료하지 못했어요.
                </div>
              </>
            ) : resultDone.result === 'failed' ? (
              <>
                <XCircle className="mx-auto mb-3 text-red-400" size={48} />
                <div className="font-manrope text-[24px] font-semibold text-white">Mission Failed</div>
                <div className="mt-1 font-manrope text-[13px] text-[#a8a8b0]">
                  {resultDone.reason}
                </div>
              </>
            ) : null}
            <div className="mt-6 flex justify-center gap-3">
              <Link
                href="/missions"
                className="rounded-full border border-[#1f1f1f] px-5 py-2 font-manrope text-[13px] text-[#a8a8b0] hover:bg-[rgba(248,249,250,0.05)]"
              >
                돌아가기
              </Link>
              <button
                onClick={handleReset}
                className="flex items-center gap-1.5 rounded-full bg-[#7C5CFC] px-5 py-2 font-manrope text-[13px] font-medium text-white hover:bg-[#6B4FE0]"
              >
                <RotateCcw size={13} /> 다시 도전
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────

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

function Keys({ keys }: { keys: string[] }) {
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

function Action({ children }: { children: React.ReactNode }) {
  return (
    <span className="self-center font-manrope text-[11px] text-[#a8a8b0]">{children}</span>
  );
}
