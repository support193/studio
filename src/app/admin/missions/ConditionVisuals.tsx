// Condition 시각화 — Edit 모드 wireframe 오버레이.
//
// Unreal TriggerBox 컬러 컨벤션 차용:
//   success → 초록 (#22c55e)
//   fail    → 빨강 (#ef4444)
//
// Condition 별 표시:
//   position (sphere): 반투명 와이어프레임 구
//   position (aabb):   반투명 와이어프레임 박스
//   stackedOn:         upper → lower 사이 선 + 라벨
//   distance:          a ↔ b 사이 선 + dist 라벨
//   held:              target 객체에 그리퍼 아이콘 (간이 floating cone)
//   orientation / atRest: 시각화 없음 (target 객체 자체에 작은 배지)
//
// 'use client' 안 붙임 — Canvas children 은 R3F 측에서만 평가됨.

import { Line } from '@react-three/drei';
import type { Condition, MissionObject } from '@/lib/missions/types';

const SUCCESS_COLOR = '#22c55e';
const FAIL_COLOR = '#ef4444';

interface ConditionVisualsProps {
  objects: MissionObject[];
  successConditions: Condition[];
  failConditions: Condition[];
}

export default function ConditionVisuals({
  objects, successConditions, failConditions,
}: ConditionVisualsProps) {
  return (
    <>
      {successConditions.map((c, i) => (
        <ConditionViz key={`s-${i}`} cond={c} color={SUCCESS_COLOR} objects={objects} />
      ))}
      {failConditions.map((c, i) => (
        <ConditionViz key={`f-${i}`} cond={c} color={FAIL_COLOR} objects={objects} />
      ))}
    </>
  );
}

function ConditionViz({
  cond, color, objects,
}: {
  cond: Condition;
  color: string;
  objects: MissionObject[];
}) {
  const findObj = (id: string) => objects.find((o) => o.id === id);

  switch (cond.type) {
    case 'position': {
      if (cond.region.kind === 'sphere') {
        const [cx, cy, cz] = cond.region.center;
        return (
          <mesh position={[cx, cy, cz]}>
            <sphereGeometry args={[cond.region.radius, 16, 12]} />
            <meshBasicMaterial color={color} wireframe transparent opacity={0.5} />
          </mesh>
        );
      }
      // aabb
      const [minx, miny, minz] = cond.region.min;
      const [maxx, maxy, maxz] = cond.region.max;
      const cx = (minx + maxx) / 2, cy = (miny + maxy) / 2, cz = (minz + maxz) / 2;
      const sx = Math.max(0.001, maxx - minx);
      const sy = Math.max(0.001, maxy - miny);
      const sz = Math.max(0.001, maxz - minz);
      return (
        <mesh position={[cx, cy, cz]}>
          <boxGeometry args={[sx, sy, sz]} />
          <meshBasicMaterial color={color} wireframe transparent opacity={0.5} />
        </mesh>
      );
    }

    case 'stackedOn': {
      const upper = findObj(cond.upper);
      const lower = findObj(cond.lower);
      if (!upper || !lower) return null;
      return (
        <Line
          points={[upper.initialPos, lower.initialPos]}
          color={color}
          lineWidth={2}
          dashed
          dashSize={0.02}
          gapSize={0.02}
        />
      );
    }

    case 'distance': {
      const a = findObj(cond.a);
      const b = findObj(cond.b);
      if (!a || !b) return null;
      return (
        <Line
          points={[a.initialPos, b.initialPos]}
          color={color}
          lineWidth={2}
          dashed
          dashSize={0.02}
          gapSize={0.02}
        />
      );
    }

    case 'held': {
      const o = findObj(cond.target);
      if (!o) return null;
      // target 객체 위에 작은 cone 으로 "그리퍼가 잡아야 할 곳" 표시.
      const [px, py, pz] = o.initialPos;
      return (
        <mesh position={[px, py, pz + 0.08]} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[0.025, 0.06, 8]} />
          <meshBasicMaterial color={color} transparent opacity={0.7} />
        </mesh>
      );
    }

    case 'orientation':
    case 'atRest':
      // 시각화 생략 — 객체 자체로 충분 (UI 패널에서만 표시).
      return null;
  }
}
