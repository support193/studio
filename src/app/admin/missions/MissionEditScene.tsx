// 미션 어드민의 3D Edit 모드 — 물리 OFF, 클릭 선택 + TransformControls gizmo.
//
// Phase 6 + 7 POC:
//   - panda 안 표시 (Edit 모드는 객체 배치 집중. Play 모드 토글하면 panda + 물리)
//   - 객체는 spec (MissionObject[]) 그대로 mesh 렌더 — physics hook 호출 안 함
//   - 클릭 → selectedId 갱신 + outline + gizmo 마운트
//   - gizmo 드래그 → mesh.position/quaternion → setObjects() 양방향 sync
//   - OrbitControls 와 충돌 회피: dragging-changed 로 일시정지
//
// Z-up: 부모 PandaV3Scene 이 이미 THREE.Object3D.DEFAULT_UP 을 (0,0,1) 로
// mutation 해놨음.  여기서도 같은 컨벤션 — Z 가 위.

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

type GizmoMode = 'translate' | 'rotate';

export interface MissionEditSceneProps {
  objects: MissionObject[];
  setObjects: (next: MissionObject[]) => void;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  gizmoMode: GizmoMode;
  successConditions: Condition[];
  failConditions: Condition[];
  showConditions: boolean;
  showGhosts: boolean;
}

export default function MissionEditScene(props: MissionEditSceneProps) {
  return (
    <Canvas
      shadows
      camera={{ position: [1.5, -1.5, 1.2], up: [0, 0, 1], fov: 45, near: 0.05, far: 50 }}
      gl={{ antialias: true }}
      onPointerMissed={() => props.setSelectedId(null)}
    >
      <Suspense fallback={null}>
        <SceneContent {...props} />
      </Suspense>
    </Canvas>
  );
}

function SceneContent({
  objects, setObjects, selectedId, setSelectedId, gizmoMode,
  successConditions, failConditions, showConditions, showGhosts,
}: MissionEditSceneProps) {
  return (
    <>
      <ZUpLights />
      <ZUpFloor />
      <Environment preset="warehouse" />

      <EditableObjects
        objects={objects}
        setObjects={setObjects}
        selectedId={selectedId}
        setSelectedId={setSelectedId}
        gizmoMode={gizmoMode}
        successConditions={successConditions}
        failConditions={failConditions}
        showConditions={showConditions}
        showGhosts={showGhosts}
      />

      {showConditions && (
        <ConditionVisuals
          objects={objects}
          successConditions={successConditions}
          failConditions={failConditions}
        />
      )}

      {showGhosts && (
        <GoalGhosts objects={objects} successConditions={successConditions} />
      )}

      <OrbitControls
        makeDefault
        target={[0, 0, 0.4]}
        minDistance={0.6} maxDistance={4} enablePan
      />
    </>
  );
}

function EditableObjects({
  objects, setObjects, selectedId, setSelectedId, gizmoMode,
}: MissionEditSceneProps) {
  const groupRefs = useRef<Map<string, THREE.Group>>(new Map());
  const tcRef = useRef<TC | null>(null);
  const { controls } = useThree() as unknown as { controls: { enabled: boolean } | null };

  // Add object → 즉시 selection 셋팅 시, 새 group 의 ref 가 commit 시점에야
  // 박힘.  TransformControls 의 `groupRefs.current.get(selectedId)` 는 render
  // 시점 평가라 첫 render 에선 undefined → TransformControls 미마운트.  Re-render
  // 트리거가 안 걸리면 영구 미마운트.  refReady 카운터를 ref callback 에서 bump
  // 해서 강제 re-render → 다음 render 에서 ref hit.
  const [, setRefReady] = useState(0);
  const setGroupRef = useCallback((id: string, el: THREE.Group | null) => {
    if (el) {
      if (groupRefs.current.get(id) !== el) {
        groupRefs.current.set(id, el);
        setRefReady((v) => v + 1);
      }
    } else if (groupRefs.current.has(id)) {
      groupRefs.current.delete(id);
      setRefReady((v) => v + 1);
    }
  }, []);

  const onTransformChange = useCallback((id: string) => {
    const g = groupRefs.current.get(id);
    if (!g) return;
    const obj = objects.find((o) => o.id === id);
    if (!obj) return;
    // 즉시 시각 clamp — 사용자가 floor 아래로 드래그해도 mesh 가 따라 내려가지
    // 않게 mesh.position.z 를 곧바로 끌어올림.
    const minZ = bottomOffset(obj);
    if (g.position.z < minZ) g.position.z = minZ;
    setObjects(objects.map((o) => {
      if (o.id !== id) return o;
      return clampToFloor({
        ...o,
        initialPos: [g.position.x, g.position.y, g.position.z],
        initialQuat: [
          g.quaternion.w, g.quaternion.x, g.quaternion.y, g.quaternion.z,
        ],
      });
    }));
  }, [objects, setObjects]);

  // OrbitControls 와 gizmo 드래그 충돌 회피 — three.js native 'dragging-changed'
  // 이벤트를 ref 통해 직접 listen.  drei v10 은 prop 으로 안 받음.
  useEffect(() => {
    const tc = tcRef.current;
    if (!tc) return;
    const handler = (e: { value: boolean }) => {
      if (controls) controls.enabled = !e.value;
    };
    // TransformControls type 의 EventMap 에 dragging-changed 가 명시 안 되어 있음
    // (런타임에는 emit 함).  any 캐스팅으로 우회.
    /* eslint-disable @typescript-eslint/no-explicit-any */
    (tc as any).addEventListener('dragging-changed', handler);
    return () => {
      (tc as any).removeEventListener('dragging-changed', handler);
    };
    /* eslint-enable @typescript-eslint/no-explicit-any */
  }, [controls, selectedId]);

  return (
    <>
      {objects.map((o) => (
        <ObjectMesh
          key={o.id}
          obj={o}
          selected={o.id === selectedId}
          onClick={() => setSelectedId(o.id)}
          setGroupRef={setGroupRef}
        />
      ))}
      {selectedId && groupRefs.current.get(selectedId) && (
        <TransformControls
          ref={tcRef as React.Ref<TC>}
          object={groupRefs.current.get(selectedId)!}
          mode={gizmoMode}
          space="world"
          size={0.7}
          onObjectChange={() => onTransformChange(selectedId)}
        />
      )}
    </>
  );
}

function ObjectMesh({
  obj, selected, onClick, setGroupRef,
}: {
  obj: MissionObject;
  selected: boolean;
  onClick: () => void;
  setGroupRef: (id: string, el: THREE.Group | null) => void;
}) {
  // 안정 ref callback — 인라인 (el) => ... 을 쓰면 매 render 마다 함수 참조가
  // 바뀌어 React 가 oldRef(null) → newRef(el) 을 반복 호출 → setRefReady
  // bump → 무한 render 루프 (React #185).  obj.id 별로 useCallback 메모.
  const refFn = useCallback(
    (el: THREE.Group | null) => setGroupRef(obj.id, el),
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
