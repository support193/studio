// 미션 어드민의 3D Edit 모드 — 물리 OFF, 클릭 선택 + TransformControls gizmo.
//
// Object 와 Condition 둘 다 클릭/드래그 가능.  Selection 은 union state 라 둘 중
// 하나만 활성.  groupRefs 는 selection key ("object:id" 또는
// "condition:role:index") 로 통합 관리 → 단일 TransformControls 가 현재 selection
// 에 attach.
//
// Z-up: PandaV3Scene 이 THREE.Object3D.DEFAULT_UP 을 (0,0,1) 로 mutation 함.

'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Environment, OrbitControls, TransformControls, Outlines } from '@react-three/drei';
import * as THREE from 'three';
import type { TransformControls as TC } from 'three-stdlib';
import { bottomOffset, clampToFloor, type Condition, type MissionObject } from '@/lib/missions/types';
import { ZUpFloor, ZUpLights } from '@/components/3d-studio/PandaV3Scene';
import ConditionVisuals from './ConditionVisuals';
import GoalGhosts from './GoalGhosts';
import type { Selection } from './MissionEditor';

type GizmoMode = 'translate' | 'rotate';
type Role = 'success' | 'fail';

export interface MissionEditSceneProps {
  objects: MissionObject[];
  setObjects: (next: MissionObject[]) => void;
  selected: Selection | null;
  setSelected: (s: Selection | null) => void;
  gizmoMode: GizmoMode;
  successConditions: Condition[];
  failConditions: Condition[];
  updateCondition: (role: Role, index: number, next: Condition) => void;
  showConditions: boolean;
  showGhosts: boolean;
}

// selection → groupRefs map key
export function selectionKey(s: Selection): string {
  return s.kind === 'object' ? `object:${s.id}` : `condition:${s.role}:${s.index}`;
}

export default function MissionEditScene(props: MissionEditSceneProps) {
  return (
    <Canvas
      shadows
      camera={{ position: [1.5, -1.5, 1.2], up: [0, 0, 1], fov: 45, near: 0.05, far: 50 }}
      gl={{ antialias: true }}
      onPointerMissed={() => props.setSelected(null)}
    >
      <Suspense fallback={null}>
        <SceneContent {...props} />
      </Suspense>
    </Canvas>
  );
}

function SceneContent({
  objects, setObjects, selected, setSelected, gizmoMode,
  successConditions, failConditions, updateCondition,
  showConditions, showGhosts,
}: MissionEditSceneProps) {
  const groupRefs = useRef<Map<string, THREE.Group>>(new Map());
  const tcRef = useRef<TC | null>(null);
  const { controls } = useThree() as unknown as { controls: { enabled: boolean } | null };

  // ref 마운트 race 회피 — ref callback 에서 카운터 bump → re-render → TC mount.
  const [, setRefReady] = useState(0);
  const setGroupRef = useCallback((key: string, el: THREE.Group | null) => {
    if (el) {
      if (groupRefs.current.get(key) !== el) {
        groupRefs.current.set(key, el);
        setRefReady((v) => v + 1);
      }
    } else if (groupRefs.current.has(key)) {
      groupRefs.current.delete(key);
      setRefReady((v) => v + 1);
    }
  }, []);

  // OrbitControls 와 gizmo 드래그 충돌 회피.
  useEffect(() => {
    const tc = tcRef.current;
    if (!tc) return;
    const handler = (e: { value: boolean }) => {
      if (controls) controls.enabled = !e.value;
    };
    /* eslint-disable @typescript-eslint/no-explicit-any */
    (tc as any).addEventListener('dragging-changed', handler);
    return () => {
      (tc as any).removeEventListener('dragging-changed', handler);
    };
    /* eslint-enable @typescript-eslint/no-explicit-any */
  }, [controls, selected]);

  // gizmo drag → 선택된 entity 업데이트 (object pos/quat 또는 condition center).
  const onTransformChange = useCallback(() => {
    if (!selected) return;
    const key = selectionKey(selected);
    const g = groupRefs.current.get(key);
    if (!g) return;

    if (selected.kind === 'object') {
      const obj = objects.find((o) => o.id === selected.id);
      if (!obj) return;
      const minZ = bottomOffset(obj);
      if (g.position.z < minZ) g.position.z = minZ;
      setObjects(objects.map((o) => {
        if (o.id !== selected.id) return o;
        return clampToFloor({
          ...o,
          initialPos: [g.position.x, g.position.y, g.position.z],
          initialQuat: [
            g.quaternion.w, g.quaternion.x, g.quaternion.y, g.quaternion.z,
          ],
        });
      }));
    } else {
      // condition — 현재는 position-sphere center 드래그만 지원.
      const arr = selected.role === 'success' ? successConditions : failConditions;
      const cond = arr[selected.index];
      if (!cond) return;
      if (cond.type === 'position' && cond.region.kind === 'sphere') {
        updateCondition(selected.role, selected.index, {
          ...cond,
          region: {
            kind: 'sphere',
            center: [g.position.x, g.position.y, g.position.z],
            radius: cond.region.radius,
          },
        });
      }
    }
  }, [selected, objects, setObjects, successConditions, failConditions, updateCondition]);

  // 현재 selection 에 해당하는 group 이 마운트되어 있을 때만 gizmo 렌더.
  // (condition 중에서도 spatial 인 것 — position-sphere — 만 group 등록함)
  const target = selected ? groupRefs.current.get(selectionKey(selected)) : null;
  const gizmoAllowed = selected
    ? (selected.kind === 'object' || isSpatialConditionSelection(selected, successConditions, failConditions))
    : false;

  return (
    <>
      <ZUpLights />
      <ZUpFloor />
      <Environment preset="warehouse" />

      <EditableObjects
        objects={objects}
        selected={selected}
        setSelected={setSelected}
        setGroupRef={setGroupRef}
      />

      {showConditions && (
        <ConditionVisuals
          objects={objects}
          successConditions={successConditions}
          failConditions={failConditions}
          selected={selected}
          setSelected={setSelected}
          setGroupRef={setGroupRef}
        />
      )}

      {showGhosts && (
        <GoalGhosts objects={objects} successConditions={successConditions} />
      )}

      {target && gizmoAllowed && (
        <TransformControls
          ref={tcRef as React.Ref<TC>}
          object={target}
          mode={selected?.kind === 'condition' ? 'translate' : gizmoMode}
          space="world"
          size={0.7}
          onObjectChange={onTransformChange}
        />
      )}

      <OrbitControls
        makeDefault
        target={[0, 0, 0.4]}
        minDistance={0.6} maxDistance={4} enablePan
      />
    </>
  );
}

function isSpatialConditionSelection(
  sel: Selection,
  successConditions: Condition[],
  failConditions: Condition[],
): boolean {
  if (sel.kind !== 'condition') return false;
  const arr = sel.role === 'success' ? successConditions : failConditions;
  const c = arr[sel.index];
  if (!c) return false;
  // 현재 gizmo 가능한 컨디션 타입: position-sphere.
  // 추후 position-aabb / held cone 등 확장 시 여기 추가.
  return c.type === 'position' && c.region.kind === 'sphere';
}

function EditableObjects({
  objects, selected, setSelected, setGroupRef,
}: {
  objects: MissionObject[];
  selected: Selection | null;
  setSelected: (s: Selection | null) => void;
  setGroupRef: (key: string, el: THREE.Group | null) => void;
}) {
  return (
    <>
      {objects.map((o) => (
        <ObjectMesh
          key={o.id}
          obj={o}
          selected={selected?.kind === 'object' && selected.id === o.id}
          onClick={() => setSelected({ kind: 'object', id: o.id })}
          setGroupRef={setGroupRef}
        />
      ))}
    </>
  );
}

function ObjectMesh({
  obj, selected, onClick, setGroupRef,
}: {
  obj: MissionObject;
  selected: boolean;
  onClick: () => void;
  setGroupRef: (key: string, el: THREE.Group | null) => void;
}) {
  // 안정 ref callback — 인라인 (el) => ... 을 쓰면 매 render 마다 함수 참조가
  // 바뀌어 React 가 oldRef(null) → newRef(el) 을 반복 호출 → setRefReady
  // bump → 무한 render 루프 (React #185).  obj.id 별로 useCallback 메모.
  const refFn = useCallback(
    (el: THREE.Group | null) => setGroupRef(`object:${obj.id}`, el),
    [obj.id, setGroupRef],
  );
  return (
    <group
      ref={refFn}
      position={[obj.initialPos[0], obj.initialPos[1], obj.initialPos[2]]}
      quaternion={[obj.initialQuat[1], obj.initialQuat[2], obj.initialQuat[3], obj.initialQuat[0]]}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
    >
      {obj.type === 'box' && (
        <mesh castShadow receiveShadow>
          <boxGeometry args={[obj.size[0] * 2, obj.size[1] * 2, obj.size[2] * 2]} />
          <meshStandardMaterial color={obj.color} roughness={0.5} metalness={0.1} />
          {selected && <Outlines thickness={3} color="#FACC15" />}
        </mesh>
      )}
      {obj.type === 'sphere' && (
        <mesh castShadow receiveShadow>
          <sphereGeometry args={[obj.size[0], 24, 16]} />
          <meshStandardMaterial color={obj.color} roughness={0.5} metalness={0.1} />
          {selected && <Outlines thickness={3} color="#FACC15" />}
        </mesh>
      )}
      {obj.type === 'cylinder' && (
        <mesh rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[obj.size[0], obj.size[0], obj.size[1] * 2, 24]} />
          <meshStandardMaterial color={obj.color} roughness={0.5} metalness={0.1} />
          {selected && <Outlines thickness={3} color="#FACC15" />}
        </mesh>
      )}
    </group>
  );
}
