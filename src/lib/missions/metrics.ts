// 미션 플레이어가 매 sample (default 100ms) 마다 gripper 위치를 넣으면
// 누적해서 path length / 평균 속도 / 단순 smoothness 점수 + 별 등급을 산출.
//
// 참고 (sim teleop benchmarks):
//   - RoboEval / RoboCasa: success rate + completion time + path length +
//     trajectory smoothness (mean jerk magnitude) + collision count
//   - SPARC (Balasubramanian et al.): spectral arc length — 본 MVP 는 단순
//     accel magnitude 평균으로 대체
//
// MVP 는 collision 제외 (MuJoCo contact 노출 안 함) + smoothness 는 accel
// 평균 기반 간이 점수.

import type { Vec3 } from './types';

export interface EvalMetrics {
  elapsedS: number;
  pathLengthM: number;
  /** path / time (m/s) */
  meanSpeedMps: number;
  /** 0..1 — 1 = perfectly smooth */
  smoothnessScore: number;
  /** 1 / 2 / 3 */
  stars: 1 | 2 | 3;
}

export class MetricsTracker {
  private lastPos: Vec3 | null = null;
  private lastVel: Vec3 | null = null;
  private pathLength = 0;
  private accelSum = 0;
  private accelSamples = 0;
  private startedAtMs: number | null = null;

  reset() {
    this.lastPos = null;
    this.lastVel = null;
    this.pathLength = 0;
    this.accelSum = 0;
    this.accelSamples = 0;
    this.startedAtMs = null;
  }

  /** gripper(또는 EE) 위치 + 직전 sample 이후 경과 dt (초). */
  update(pos: Vec3, dt: number) {
    if (this.startedAtMs === null) this.startedAtMs = Date.now();
    if (dt <= 0) return;
    if (this.lastPos) {
      const d = v3Dist(this.lastPos, pos);
      // 가만히 있을 때 noise 누적 방지 — 1mm 이상 움직였을 때만 path 누적.
      if (d > 0.001) this.pathLength += d;

      const vel: Vec3 = [
        (pos[0] - this.lastPos[0]) / dt,
        (pos[1] - this.lastPos[1]) / dt,
        (pos[2] - this.lastPos[2]) / dt,
      ];
      if (this.lastVel) {
        const accel: Vec3 = [
          (vel[0] - this.lastVel[0]) / dt,
          (vel[1] - this.lastVel[1]) / dt,
          (vel[2] - this.lastVel[2]) / dt,
        ];
        this.accelSum += v3Norm(accel);
        this.accelSamples++;
      }
      this.lastVel = vel;
    }
    this.lastPos = pos;
  }

  /** elapsedS + mission timeLimit 받아 최종 메트릭 + 별 등급 계산. */
  finalize(elapsedS: number, timeLimitS: number): EvalMetrics {
    const meanSpeedMps = this.pathLength / Math.max(0.01, elapsedS);
    const meanAccel = this.accelSamples > 0 ? this.accelSum / this.accelSamples : 0;
    // accel 평균 → 0..1 점수.  meanAccel 5 m/s² 정도면 매끄러움 (1.0).
    // 25 m/s² 이상이면 거친 동작 (0.0).
    const smoothnessScore = clamp01(1 - (meanAccel - 5) / 20);

    // 별:
    //   3★: 시간 비율 < 50% + smoothness > 0.7
    //   2★: 시간 비율 < 80%  OR smoothness > 0.5
    //   1★: completion 만 보장
    const timeRatio = elapsedS / Math.max(1, timeLimitS);
    let stars: 1 | 2 | 3 = 1;
    if (timeRatio < 0.5 && smoothnessScore > 0.7) stars = 3;
    else if (timeRatio < 0.8 || smoothnessScore > 0.5) stars = 2;

    return {
      elapsedS,
      pathLengthM: this.pathLength,
      meanSpeedMps,
      smoothnessScore,
      stars,
    };
  }
}

function v3Dist(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
function v3Norm(v: Vec3): number {
  return Math.hypot(v[0], v[1], v[2]);
}
function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
