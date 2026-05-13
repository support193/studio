// 그리퍼 첫인칭 카메라 인셋 뷰.  Mission player 좌상단 작은 캔버스로 표시.
//
//  - 별도 R3F Canvas (메인 캔버스와 분리)
//  - 물리는 안 돌림 — 메인 캔버스의 physRef.bodiesRef / objectStatesRef 에서
//    매 frame 값만 읽어서 메쉬 위치/회전 업데이트
//  - 카메라는 left_finger / right_finger 중간점에 위치, hand 의 local +Z
//    (그리퍼가 잡으러 가는 방향) 을 forward 로 lookAt
//  - 메인과 다른 시야 (FOV ~70도) → "그리퍼 시점" 느낌

'use client';

import { Suspense, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { PandaV3PhysicsHandle } from '@/hooks/useMujocoPhysicsPandaV3';
import type { Condition, MissionObject, ObjectState } from '@/lib/missions/types';
import { ZUpFloor, ZUpLights, MissionObjectMeshes } from '@/components/3d-studio/PandaV3Scene';
import ConditionTargets from '@/components/missions/ConditionTargets';

export default function GripperCamView({
  physRef,
  missionObjects,
  missionSuccessConditions = [],
  missionFailConditions = [],
}: {
  physRef: React.MutableRefObject<PandaV3PhysicsHandle | null>;
  missionObjects: MissionObject[];
  missionSuccessConditions?: Condition[];
  missionFailConditions?: Condition[];
}) {
  return (
    <Canvas
      camera={{ position: [0, 0, 0.1], up: [0, 0, 1], fov: 70, near: 0.01, far: 5 }}
      gl={{ antialias: true, alpha: false }}
      dpr={[1, 1.5]}
    >
      <Suspense fallback={null}>
        <ZUpLights />
        <ZUpFloor />
        {/* Environment 는 비싸므로 인셋에선 skip — Lights 만 으로도 PBR floor 보임 */}
        <GripperCamera physRef={physRef} />
        <SyncedMissionObjects physRef={physRef} objects={missionObjects} />
        {(missionSuccessConditions.length > 0 || missionFailConditions.length > 0) && (
          <ConditionTargets
            objects={missionObjects}
            successConditions={missionSuccessConditions}
            failConditions={missionFailConditions}
          />
        )}
      </Suspense>
    </Canvas>
  );
}

// 메인 캔버스 외부에서 default camera 를 매 frame 그리퍼 위치/방향으로 옮김.
function GripperCamera({
  physRef,
}: {
  physRef: React.MutableRefObject<PandaV3PhysicsHandle | null>;
}) {
  const tmpMid = useRef(new THREE.Vector3());
  const tmpQuat = useRef(new THREE.Quaternion());
  const tmpForward = useRef(new THREE.Vector3());
  const tmpUp = useRef(new THREE.Vector3());
  const tmpTarget = useRef(new THREE.Vector3());

  useFrame(({ camera }) => {
    const phys = physRef.current;
    if (!phys || !phys.state.loaded) return;
    const bodies = phys.bodiesRef.current;
    const lf = bodies.find((b) => b.name === 'left_finger');
    const rf = bodies.find((b) => b.name === 'right_finger');
    const hand = bodies.find((b) => b.name === 'hand');
    if (!lf || !rf || !hand) return;

    // 1) 카메라 위치 = left_finger / right_finger 중간점, 약간 손목쪽으로
    //    당겨서 (-Z local) 손가락 끝이 화면에 살짝 들어오게.
    tmpMid.current.set(
      (lf.position[0] + rf.position[0]) / 2,
      (lf.position[1] + rf.position[1]) / 2,
      (lf.position[2] + rf.position[2]) / 2,
    );

    // 2) hand quaternion (wxyz → xyzw) 으로 local +Z (forward) / +Y (up) 회전
    tmpQuat.current.set(
      hand.quaternion[1],
      hand.quaternion[2],
      hand.quaternion[3],
      hand.quaternion[0],
    );
    tmpForward.current.set(0, 0, 1).applyQuaternion(tmpQuat.current);
    tmpUp.current.set(0, 1, 0).applyQuaternion(tmpQuat.current);

    // 카메라 위치를 살짝 손목쪽 (= -forward) 으로 옮겨서 손가락이 frame 안에 보이게
    camera.position.copy(tmpMid.current).addScaledVector(tmpForward.current, -0.02);
    camera.up.copy(tmpUp.current);
    tmpTarget.current.copy(camera.position).addScaledVector(tmpForward.current, 0.5);
    camera.lookAt(tmpTarget.current);
  });
  return null;
}

// MissionObjectMeshes 가 statesRef 를 require — physRef.current 가 아직
// 안 박힌 첫 frame 들엔 빈 배열 ref 를 임시로 넣음.
function SyncedMissionObjects({
  physRef,
  objects,
}: {
  physRef: React.MutableRefObject<PandaV3PhysicsHandle | null>;
  objects: MissionObject[];
}) {
  const emptyRef = useRef<ObjectState[]>([]);
  if (objects.length === 0) return null;
  const states = physRef.current?.objectStatesRef ?? emptyRef;
  return <MissionObjectMeshes objects={objects} statesRef={states} />;
}
