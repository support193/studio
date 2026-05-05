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

import { Suspense, useCallback, useEffect, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Grid, OrbitControls, TransformControls, Outlines } from '@react-three/drei';
import * as THREE from 'three';
import type { TransformControls as TC } from 'three-stdlib';
import type { MissionObject } from '@/lib/missions/types';

type GizmoMode = 'translate' | 'rotate';

export interface MissionEditSceneProps {
  objects: MissionObject[];
  setObjects: (next: MissionObject[]) => void;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  gizmoMode: GizmoMode;
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
}: MissionEditSceneProps) {
  return (
    <>
      <ambientLight intensity={0.5} color="#b0b0cc" />
      <directionalLight position={[10, 15, 25]} intensity={1.0} castShadow />
      <directionalLight position={[-10, -10, 15]} intensity={0.3} color="#8888cc" />
      {/* Floor (XY plane at z=0) */}
      <mesh position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[2, 2]} />
        <meshStandardMaterial color="#2a2a35" metalness={0.3} roughness={0.7} />
      </mesh>
      <Grid
        args={[2, 2]}
        position={[0, 0, 0.001]}
        rotation={[-Math.PI / 2, 0, 0]}
        cellSize={0.1} cellThickness={0.5} cellColor="#3a3a4a"
        sectionSize={0.5} sectionThickness={1} sectionColor="#4a4a5a"
        fadeDistance={2} fadeStrength={1.5} infiniteGrid={false}
      />

      <EditableObjects
        objects={objects}
        setObjects={setObjects}
        selectedId={selectedId}
        setSelectedId={setSelectedId}
        gizmoMode={gizmoMode}
      />

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

  const onTransformChange = useCallback((id: string) => {
    const g = groupRefs.current.get(id);
    if (!g) return;
    setObjects(objects.map((o) => {
      if (o.id !== id) return o;
      return {
        ...o,
        initialPos: [g.position.x, g.position.y, g.position.z],
        initialQuat: [
          g.quaternion.w, g.quaternion.x, g.quaternion.y, g.quaternion.z,
        ],
      };
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
          groupRefs={groupRefs}
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
  obj, selected, onClick, groupRefs,
}: {
  obj: MissionObject;
  selected: boolean;
  onClick: () => void;
  groupRefs: React.MutableRefObject<Map<string, THREE.Group>>;
}) {
  return (
    <group
      ref={(el) => { if (el) groupRefs.current.set(obj.id, el); }}
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
