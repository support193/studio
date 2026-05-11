// Condition 시각화 — Edit 모드 wireframe 오버레이 + 클릭 선택.
//
// Unreal TriggerBox 컬러 컨벤션 차용:
//   success → 초록 (#22c55e)
//   fail    → 빨강 (#ef4444)
//
// Condition 별 표시:
//   position (sphere): 반투명 와이어프레임 구  (← 클릭 + 드래그 가능)
//   position (aabb):   반투명 와이어프레임 박스 (클릭 선택만, gizmo 는 추후)
//   stackedOn:         upper → lower 사이 선 + 중간점 마커 (선택용)
//   distance:          a ↔ b 사이 선 + 중간점 마커
//   held:              target 객체에 cone (클릭 선택)
//   orientation / atRest: 시각화 없음 (오른쪽 카드에서만 선택 가능)
//
// position-sphere 와 held cone 은 group ref 를 등록 → MissionEditScene 의
// TransformControls 가 그 group 에 attach 해서 center 드래그 가능.

import { useCallback } from 'react';
import { Line, Outlines } from '@react-three/drei';
import * as THREE from 'three';
import type { Condition, MissionObject } from '@/lib/missions/types';
import type { Selection } from './MissionEditor';

const SUCCESS_COLOR = '#22c55e';
const FAIL_COLOR = '#ef4444';
const SELECTED_OUTLINE = '#FACC15';

type Role = 'success' | 'fail';

interface ConditionVisualsProps {
  objects: MissionObject[];
  successConditions: Condition[];
  failConditions: Condition[];
  selected: Selection | null;
  setSelected: (s: Selection | null) => void;
  setGroupRef: (key: string, el: THREE.Group | null) => void;
}

export default function ConditionVisuals({
  objects, successConditions, failConditions,
  selected, setSelected, setGroupRef,
}: ConditionVisualsProps) {
  const isSelected = (role: Role, index: number) =>
    selected?.kind === 'condition' && selected.role === role && selected.index === index;

  return (
    <>
      {successConditions.map((c, i) => (
        <ConditionViz
          key={`s-${i}`}
          cond={c}
          role="success"
          index={i}
          color={SUCCESS_COLOR}
          objects={objects}
          isSelected={isSelected('success', i)}
          onSelect={() => setSelected({ kind: 'condition', role: 'success', index: i })}
          setGroupRef={setGroupRef}
        />
      ))}
      {failConditions.map((c, i) => (
        <ConditionViz
          key={`f-${i}`}
          cond={c}
          role="fail"
          index={i}
          color={FAIL_COLOR}
          objects={objects}
          isSelected={isSelected('fail', i)}
          onSelect={() => setSelected({ kind: 'condition', role: 'fail', index: i })}
          setGroupRef={setGroupRef}
        />
      ))}
    </>
  );
}

function ConditionViz({
  cond, role, index, color, objects, isSelected, onSelect, setGroupRef,
}: {
  cond: Condition;
  role: Role;
  index: number;
  color: string;
  objects: MissionObject[];
  isSelected: boolean;
  onSelect: () => void;
  setGroupRef: (key: string, el: THREE.Group | null) => void;
}) {
  const findObj = (id: string) => objects.find((o) => o.id === id);
  const key = `condition:${role}:${index}`;

  // 안정 ref callback (React #185 회피 — MissionEditScene 의 ObjectMesh 와 동일 패턴).
  const refFn = useCallback(
    (el: THREE.Group | null) => setGroupRef(key, el),
    [key, setGroupRef],
  );

  const onClick = useCallback((e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    onSelect();
  }, [onSelect]);

  switch (cond.type) {
    case 'position': {
      if (cond.region.kind === 'sphere') {
        const [cx, cy, cz] = cond.region.center;
        return (
          <group ref={refFn} position={[cx, cy, cz]} onClick={onClick}>
            <mesh>
              <sphereGeometry args={[cond.region.radius, 16, 12]} />
              <meshBasicMaterial color={color} wireframe transparent opacity={isSelected ? 0.85 : 0.5} />
              {isSelected && <Outlines thickness={3} color={SELECTED_OUTLINE} />}
            </mesh>
          </group>
        );
      }
      // aabb — group ref 없음 (gizmo 미지원, 클릭 선택만)
      const [minx, miny, minz] = cond.region.min;
      const [maxx, maxy, maxz] = cond.region.max;
      const cx = (minx + maxx) / 2, cy = (miny + maxy) / 2, cz = (minz + maxz) / 2;
      const sx = Math.max(0.001, maxx - minx);
      const sy = Math.max(0.001, maxy - miny);
      const sz = Math.max(0.001, maxz - minz);
      return (
        <mesh position={[cx, cy, cz]} onClick={onClick}>
          <boxGeometry args={[sx, sy, sz]} />
          <meshBasicMaterial color={color} wireframe transparent opacity={isSelected ? 0.85 : 0.5} />
          {isSelected && <Outlines thickness={3} color={SELECTED_OUTLINE} />}
        </mesh>
      );
    }

    case 'stackedOn': {
      const upper = findObj(cond.upper);
      const lower = findObj(cond.lower);
      if (!upper || !lower) return null;
      const mid: [number, number, number] = [
        (upper.initialPos[0] + lower.initialPos[0]) / 2,
        (upper.initialPos[1] + lower.initialPos[1]) / 2,
        (upper.initialPos[2] + lower.initialPos[2]) / 2,
      ];
      return (
        <>
          <Line
            points={[upper.initialPos, lower.initialPos]}
            color={color}
            lineWidth={isSelected ? 3 : 2}
            dashed
            dashSize={0.02}
            gapSize={0.02}
          />
          {/* 중간점 마커 — 클릭 선택용 */}
          <mesh position={mid} onClick={onClick}>
            <sphereGeometry args={[0.015, 12, 8]} />
            <meshBasicMaterial color={color} transparent opacity={isSelected ? 0.9 : 0.6} />
            {isSelected && <Outlines thickness={3} color={SELECTED_OUTLINE} />}
          </mesh>
        </>
      );
    }

    case 'distance': {
      const a = findObj(cond.a);
      const b = findObj(cond.b);
      if (!a || !b) return null;
      const mid: [number, number, number] = [
        (a.initialPos[0] + b.initialPos[0]) / 2,
        (a.initialPos[1] + b.initialPos[1]) / 2,
        (a.initialPos[2] + b.initialPos[2]) / 2,
      ];
      return (
        <>
          <Line
            points={[a.initialPos, b.initialPos]}
            color={color}
            lineWidth={isSelected ? 3 : 2}
            dashed
            dashSize={0.02}
            gapSize={0.02}
          />
          <mesh position={mid} onClick={onClick}>
            <sphereGeometry args={[0.015, 12, 8]} />
            <meshBasicMaterial color={color} transparent opacity={isSelected ? 0.9 : 0.6} />
            {isSelected && <Outlines thickness={3} color={SELECTED_OUTLINE} />}
          </mesh>
        </>
      );
    }

    case 'held': {
      const o = findObj(cond.target);
      if (!o) return null;
      const [px, py, pz] = o.initialPos;
      return (
        <mesh position={[px, py, pz + 0.08]} rotation={[Math.PI, 0, 0]} onClick={onClick}>
          <coneGeometry args={[0.025, 0.06, 8]} />
          <meshBasicMaterial color={color} transparent opacity={isSelected ? 0.95 : 0.7} />
          {isSelected && <Outlines thickness={3} color={SELECTED_OUTLINE} />}
        </mesh>
      );
    }

    case 'orientation':
    case 'atRest':
      // 시각화 없음 — 오른쪽 condition cards 에서만 선택 가능.
      return null;
  }
}
