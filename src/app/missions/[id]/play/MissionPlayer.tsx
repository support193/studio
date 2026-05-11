// Mission player — 키보드 조작 + 매 프레임 evaluator 호출 + HUD + 결과 모달.
//
// Phase 5 핵심:
//  - PandaV3Scene 마운트 (missionObjects 포함, controls 활성)
//  - elapsedS 타이머, evaluator (1 fps) → satisfied/total + result
//  - success / failed / timeout 시 결과 모달 (Retry / Back)
//
// evaluator 호출은 1 Hz 로 충분 — 60fps 마다 돌릴 필요 없음 (condition tolerance
// 가 ms 단위 정밀도 요구 안 함).  setInterval 1000ms.

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, RotateCcw, Trophy, XCircle, Clock, Star, Route, Activity } from 'lucide-react';
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

export default function MissionPlayer({ mission }: { mission: MissionDefinition }) {
  const router = useRouter();
  const controls = usePandaV3Controls();
  const frameDataRef = useRef<PandaV3FrameSnapshot | null>(null);
  const physRef = useRef<PandaV3PhysicsHandle | null>(null);
  const onPhysHandle = useCallback((h: PandaV3PhysicsHandle) => {
    physRef.current = h;
  }, []);

  // 시작 시간 — 첫 mount 시 한 번만.  Reset 시 다시 set.
  const startMsRef = useRef<number>(Date.now());
  const [elapsedS, setElapsedS] = useState(0);
  const [evalRes, setEvalRes] = useState<EvalResult>({ result: 'running', satisfied: 0, total: mission.successConditions.length });
  const [resultDone, setResultDone] = useState<EvalResult | null>(null);
  const [metrics, setMetrics] = useState<EvalMetrics | null>(null);

  const trackerRef = useRef<MetricsTracker>(new MetricsTracker());
  const lastSampleMsRef = useRef<number>(Date.now());

  // 100ms 샘플링: gripper pos → path/smoothness 누적.
  useEffect(() => {
    const id = setInterval(() => {
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
  }, []);

  // 매 1초: timer + evaluator.
  useEffect(() => {
    const id = setInterval(() => {
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
        // success 만 메트릭 산출 (fail/timeout 은 의미 없음).
        if (r.result === 'success') {
          setMetrics(trackerRef.current.finalize(r.elapsedS, mission.timeLimitS));
        }
      }
    }, 1000);
    return () => clearInterval(id);
  }, [mission]);

  // resultDone 이 한번 설정되면 평가 멈춤 — interval 은 계속 돌지만 setEvalRes
  // 만 멈추는 게 깔끔.  대신 resultDone 가드는 위 effect 안에서 처리.
  // (단순화 — 별도 가드 불필요, interval 은 unmount 시 정리됨.)

  function handleRetry() {
    setResultDone(null);
    setMetrics(null);
    setElapsedS(0);
    setEvalRes({ result: 'running', satisfied: 0, total: mission.successConditions.length });
    startMsRef.current = Date.now();
    lastSampleMsRef.current = Date.now();
    trackerRef.current.reset();
    // Reset robot home + mission objects.
    controls.resetRef.current = true;
    physRef.current?.resetMissionObjects();
  }

  const total = mission.successConditions.length;
  const satisfied = evalRes.result === 'running' ? evalRes.satisfied : (evalRes.result === 'success' ? total : 0);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#0A0A0F]">
      {/* Top-left: back + title + goal */}
      <div className="absolute left-4 top-4 z-10 flex items-start gap-3">
        <button
          onClick={() => router.push('/missions')}
          className="flex size-[36px] items-center justify-center rounded-full border border-[#1f1f1f] bg-black/40 text-[#737780] backdrop-blur hover:text-white"
          title="Back to missions"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="rounded-[10px] border border-[#1f1f1f] bg-black/40 px-4 py-2 backdrop-blur">
          <div className="font-manrope text-[14px] font-semibold text-white">{mission.title}</div>
          {mission.goal && (
            <div className="mt-0.5 max-w-[400px] font-manrope text-[12px] text-[#a8a8b0]">{mission.goal}</div>
          )}
        </div>
      </div>

      {/* Top-right: timer + progress */}
      <div className="absolute right-4 top-4 z-10 flex items-center gap-3 rounded-[10px] border border-[#1f1f1f] bg-black/40 px-4 py-2 backdrop-blur">
        <Clock size={14} className="text-[#a48dff]" />
        <span className="font-mono text-[14px] tabular-nums text-white">
          {formatTime(elapsedS)} / {formatTime(mission.timeLimitS)}
        </span>
        <span className="ml-3 font-manrope text-[12px] text-[#a8a8b0]">
          Conditions: <span className="text-[#7C5CFC]">{satisfied}</span>/{total}
        </span>
      </div>

      {/* Right side: 자연어 condition 진행 카드 — 무엇이 만족됐는지 한눈에 */}
      {(mission.successConditions.length > 0 || mission.failConditions.length > 0) && (
        <div className="absolute right-4 top-20 z-10 max-h-[calc(100vh-220px)] w-[300px] overflow-auto rounded-[10px] border border-[#1f1f1f] bg-black/40 p-3 backdrop-blur">
          {mission.successConditions.length > 0 && (
            <div className="mb-2">
              <div className="mb-1 font-manrope text-[10px] uppercase text-[#22c55e]">Success (모두)</div>
              {mission.successConditions.map((c, i) => (
                <div key={`s-${i}`} className="mb-1.5 flex items-start gap-2 rounded-[6px] border border-[#22c55e]/30 bg-[#22c55e]/10 px-2 py-1.5">
                  <span className="mt-[1px] rounded bg-[#22c55e]/25 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase text-[#22c55e]">
                    {shortLabel(c)}
                  </span>
                  <span className="font-manrope text-[11px] leading-tight text-[#d8d8de]">
                    {describeCondition(c)}
                  </span>
                </div>
              ))}
            </div>
          )}
          {mission.failConditions.length > 0 && (
            <div>
              <div className="mb-1 font-manrope text-[10px] uppercase text-[#ef4444]">Fail (하나라도)</div>
              {mission.failConditions.map((c, i) => (
                <div key={`f-${i}`} className="mb-1.5 flex items-start gap-2 rounded-[6px] border border-[#ef4444]/30 bg-[#ef4444]/10 px-2 py-1.5">
                  <span className="mt-[1px] rounded bg-[#ef4444]/25 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase text-[#ef4444]">
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

      {/* Bottom: keyboard hint */}
      <div className="pointer-events-none absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-[10px] border border-[#1f1f1f] bg-black/40 px-4 py-2 backdrop-blur">
        <div className="font-manrope text-[11px] text-[#737780]">
          <kbd className="kbd">W A S D</kbd> move ·
          <kbd className="kbd ml-1">Q E</kbd> up/down ·
          <kbd className="kbd ml-1">↑↓←→</kbd> tilt ·
          <kbd className="kbd ml-1">Z C</kbd> wrist ·
          <kbd className="kbd ml-1">Space</kbd> grip ·
          <kbd className="kbd ml-1">R</kbd> reset
        </div>
      </div>

      {/* Scene */}
      <PandaV3Scene
        controls={controls}
        frameDataRef={frameDataRef}
        onPhysHandle={onPhysHandle}
        missionObjects={mission.objects}
        missionSuccessConditions={mission.successConditions}
        missionFailConditions={mission.failConditions}
      />

      {/* Result modal */}
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
                <div className="font-manrope text-[24px] font-semibold text-white">Time&apos;s up</div>
                <div className="mt-1 font-manrope text-[13px] text-[#a8a8b0]">
                  Mission incomplete after {formatTime(mission.timeLimitS)}.
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
                Back
              </Link>
              <button
                onClick={handleRetry}
                className="flex items-center gap-1.5 rounded-full bg-[#7C5CFC] px-5 py-2 font-manrope text-[13px] font-medium text-white hover:bg-[#6B4FE0]"
              >
                <RotateCcw size={13} /> Retry
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        :global(.kbd) {
          display: inline-block;
          padding: 1px 6px;
          margin: 0 1px;
          border-radius: 4px;
          background: rgba(255, 255, 255, 0.08);
          font-family: ui-monospace, monospace;
          font-size: 10px;
          color: #d8d8de;
        }
      `}</style>
    </div>
  );
}

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
