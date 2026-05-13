// Mission player 용 read-only 컨디션 시각화.  Admin Edit 모드의 ConditionVisuals
// 와 달리 클릭/선택 없음 — 단순 wireframe / cone 만 렌더해서 사용자에게
// "어디에 무엇을 두면 성공인지" 보여줌.
//
// Color: success=초록 / fail=빨강 (admin 과 동일).  fail 도 render 해서 "여기
// 들어가면 실패한다" 도 알려줌.
//
// Pulsing — material opacity 가 sine wave 로 호흡 → "여기 가야 함" 강조.

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Condition, MissionObject } from '@/lib/missions/types';

const SUCCESS_COLOR = '#22c55e';
const FAIL_COLOR = '#ef4444';

export default function ConditionTargets({
  objects,
  successConditions,
  failConditions,
}: {
  objects: MissionObject[];
  successConditions: Condition[];
  failConditions: Condition[];
}) {
  return (
    <>
      {successConditions.map((c, i) => (
        <TargetViz key={`s-${i}`} cond={c} color={SUCCESS_COLOR} objects={objects} />
      ))}
      {failConditions.map((c, i) => (
        <TargetViz key={`f-${i}`} cond={c} color={FAIL_COLOR} objects={objects} />
      ))}
    </>
  );
}

function TargetViz({
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
          <mesh position={[cx, cy, cz]} raycast={() => null}>
            <sphereGeometry args={[cond.region.radius, 16, 12]} />
            <PulsingMaterial color={color} wireframe base={0.4} amp={0.3} />
          </mesh>
        );
      }
      const [minx, miny, minz] = cond.region.min;
      const [maxx, maxy, maxz] = cond.region.max;
      const cx = (minx + maxx) / 2, cy = (miny + maxy) / 2, cz = (minz + maxz) / 2;
      const sx = Math.max(0.001, maxx - minx);
      const sy = Math.max(0.001, maxy - miny);
      const sz = Math.max(0.001, maxz - minz);
      return (
        <mesh position={[cx, cy, cz]} raycast={() => null}>
          <boxGeometry args={[sx, sy, sz]} />
          <PulsingMaterial color={color} wireframe base={0.4} amp={0.3} />
        </mesh>
      );
    }
    case 'stackedOn': {
      const upper = findObj(cond.upper);
      const lower = findObj(cond.lower);
      if (!upper || !lower) return null;
      const lowerH = bottomHalf(lower);
      const upperH = bottomHalf(upper);
      const goalZ = lower.initialPos[2] + lowerH + upperH;
      const targetUpperPos: [number, number, number] = [
        lower.initialPos[0],
        lower.initialPos[1],
        goalZ,
      ];
      return (
        <>
          {upper.type === 'box' && (
            <mesh position={targetUpperPos} raycast={() => null}>
              <boxGeometry args={[upper.size[0] * 2, upper.size[1] * 2, upper.size[2] * 2]} />
              <PulsingMaterial color={color} wireframe base={0.35} amp={0.3} />
            </mesh>
          )}
          {upper.type === 'sphere' && (
            <mesh position={targetUpperPos} raycast={() => null}>
              <sphereGeometry args={[upper.size[0], 16, 12]} />
              <PulsingMaterial color={color} wireframe base={0.35} amp={0.3} />
            </mesh>
          )}
          {upper.type === 'cylinder' && (
            <mesh position={targetUpperPos} rotation={[Math.PI / 2, 0, 0]} raycast={() => null}>
              <cylinderGeometry args={[upper.size[0], upper.size[0], upper.size[1] * 2, 24]} />
              <PulsingMaterial color={color} wireframe base={0.35} amp={0.3} />
            </mesh>
          )}
        </>
      );
    }
    case 'held': {
      const o = findObj(cond.target);
      if (!o) return null;
      const [px, py, pz] = o.initialPos;
      return (
        <mesh position={[px, py, pz + 0.08]} rotation={[Math.PI, 0, 0]} raycast={() => null}>
          <coneGeometry args={[0.025, 0.06, 8]} />
          <PulsingMaterial color={color} base={0.5} amp={0.3} />
        </mesh>
      );
    }
    case 'distance':
    case 'orientation':
    case 'atRest':
      return null;
  }
}

/** sine-wave opacity 로 호흡하는 wireframe / solid 머티리얼. */
function PulsingMaterial({
  color, wireframe = false, base = 0.4, amp = 0.3, speed = 2,
}: {
  color: string;
  wireframe?: boolean;
  base?: number;
  amp?: number;
  speed?: number;
}) {
  const ref = useRef<THREE.MeshBasicMaterial>(null);
  useFrame((state) => {
    if (ref.current) {
      ref.current.opacity = base + Math.sin(state.clock.elapsedTime * speed) * amp;
    }
  });
  return (
    <meshBasicMaterial
      ref={ref}
      color={color}
      wireframe={wireframe}
      transparent
      opacity={base}
      depthWrite={false}
    />
  );
}

// MissionObject 의 Z 방향 half-extent.
function bottomHalf(o: MissionObject): number {
  switch (o.type) {
    case 'box':      return o.size[2];
    case 'sphere':   return o.size[0];
    case 'cylinder': return o.size[1];
  }
}
