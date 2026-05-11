// Studio v3 scene — **Z-up native** (REP-103 / robotics standard).
// Three.js defaults to Y-up but supports Z-up via `Object3D.DEFAULT_UP`.
// We set it once at module load so that the camera + OrbitControls treat
// world-Z as gravity-up (matches MuJoCo coordinates exactly — no rotation
// wrapper needed).
//
// Floor + lights are inlined here (Z-up specific) instead of using the
// shared Y-up Floor/Lights components from /3d-studio/v1/v2.

'use client';

import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { Grid, OrbitControls, Environment } from '@react-three/drei';
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import {
  PANDA_V3_BASE_URL,
  PANDA_V3_BODY_MESH_MAP,
  PANDA_V3_UNIQUE_OBJS,
} from '@/lib/3d-studio/franka-panda-v3';
import {
  useMujocoPhysicsPandaV3,
  type PandaV3BodyPose,
  type PandaV3FrameSnapshot,
  type PandaV3PhysicsHandle,
} from '@/hooks/useMujocoPhysicsPandaV3';
import type { PandaV3Controls } from '@/hooks/usePandaV3Controls';
import type { Condition, MissionObject, ObjectState } from '@/lib/missions/types';
import ConditionTargets from '@/components/missions/ConditionTargets';

// **Make Three.js Z-up.** Must run before any Object3D / Camera is created.
// Subsequent <Canvas> camera + OrbitControls inherit this up axis.
THREE.Object3D.DEFAULT_UP.set(0, 0, 1);

const armMaterial = new THREE.MeshStandardMaterial({
  color: '#e8e8e8',
  roughness: 0.4,
  metalness: 0.6,
});
const gripperMaterial = new THREE.MeshStandardMaterial({
  color: '#333333',
  roughness: 0.5,
  metalness: 0.3,
});

function isGripperBody(name: string): boolean {
  return name === 'hand' || name.endsWith('_finger');
}

const OBJ_URLS = PANDA_V3_UNIQUE_OBJS.map((f) => `${PANDA_V3_BASE_URL}/assets/${f}`);

function MissionObjectMeshes({
  objects,
  statesRef,
}: {
  objects: MissionObject[];
  statesRef: React.MutableRefObject<ObjectState[]>;
}) {
  // R3F group ref by id, updated each frame from MuJoCo state.
  const groupRefs = useRef<Map<string, THREE.Group>>(new Map());

  useFrame(() => {
    const states = statesRef.current;
    for (const s of states) {
      const g = groupRefs.current.get(s.id);
      if (!g) continue;
      g.position.set(s.pos[0], s.pos[1], s.pos[2]);
      g.quaternion.set(s.quat[1], s.quat[2], s.quat[3], s.quat[0]); // wxyz → xyzw
    }
  });

  return (
    <group>
      {objects.map((o) => (
        <group
          key={o.id}
          ref={(el) => { if (el) groupRefs.current.set(o.id, el); }}
          position={[o.initialPos[0], o.initialPos[1], o.initialPos[2]]}
        >
          {o.type === 'box' && (
            <mesh castShadow receiveShadow>
              <boxGeometry args={[o.size[0] * 2, o.size[1] * 2, o.size[2] * 2]} />
              <meshStandardMaterial color={o.color} roughness={0.5} metalness={0.1} />
            </mesh>
          )}
          {o.type === 'sphere' && (
            <mesh castShadow receiveShadow>
              <sphereGeometry args={[o.size[0], 24, 16]} />
              <meshStandardMaterial color={o.color} roughness={0.5} metalness={0.1} />
            </mesh>
          )}
          {o.type === 'cylinder' && (
            // Three CylinderGeometry axis = Y, MuJoCo cylinder axis = Z.
            // mesh local rotation π/2 around X 으로 Y→Z 정렬.
            <mesh rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
              <cylinderGeometry args={[o.size[0], o.size[0], o.size[1] * 2, 24]} />
              <meshStandardMaterial color={o.color} roughness={0.5} metalness={0.1} />
            </mesh>
          )}
        </group>
      ))}
    </group>
  );
}

function PandaMeshes({ bodiesRef }: { bodiesRef: React.MutableRefObject<PandaV3BodyPose[]> }) {
  const objs = useLoader(OBJLoader, OBJ_URLS);
  const groupRefs = useRef<Map<string, THREE.Group>>(new Map());

  const objMap = useMemo(() => {
    const m = new Map<string, THREE.Group>();
    PANDA_V3_UNIQUE_OBJS.forEach((file, i) => m.set(file, objs[i]));
    return m;
  }, [objs]);

  // useFrame reads body poses from ref every frame — no React state ↔
  // no re-render cascade.
  useFrame(() => {
    const bodies = bodiesRef.current;
    for (const body of bodies) {
      const g = groupRefs.current.get(body.name);
      if (!g) continue;
      g.position.set(body.position[0], body.position[1], body.position[2]);
      g.quaternion.set(
        body.quaternion[1], // x
        body.quaternion[2], // y
        body.quaternion[3], // z
        body.quaternion[0], // w  (MuJoCo wxyz → Three.js xyzw)
      );
    }
  });

  return (
    // Z-up native: panda body coords go straight to Three.js with no
    // rotation wrapper.
    <group>
      {PANDA_V3_BODY_MESH_MAP.map(([bodyName, files]) => {
        const mat = isGripperBody(bodyName) ? gripperMaterial : armMaterial;
        return (
          <group
            key={bodyName}
            ref={(el) => { if (el) groupRefs.current.set(bodyName, el); }}
          >
            {files.map((file, i) => {
              const obj = objMap.get(file);
              if (!obj) return null;
              const clone = obj.clone(true);
              clone.traverse((child) => {
                if ((child as THREE.Mesh).isMesh) {
                  (child as THREE.Mesh).material = mat;
                  (child as THREE.Mesh).castShadow = true;
                  (child as THREE.Mesh).receiveShadow = true;
                }
              });
              return <primitive key={`${bodyName}-${i}`} object={clone} />;
            })}
          </group>
        );
      })}
    </group>
  );
}

function SceneContent({
  controls,
  frameDataRef,
  onPhysHandle,
  promo = false,
  missionObjects = [],
  missionSuccessConditions = [],
  missionFailConditions = [],
}: {
  controls: PandaV3Controls;
  frameDataRef: React.MutableRefObject<PandaV3FrameSnapshot | null>;
  onPhysHandle?: (h: PandaV3PhysicsHandle) => void;
  promo?: boolean;
  missionObjects?: MissionObject[];
  missionSuccessConditions?: Condition[];
  missionFailConditions?: Condition[];
}) {
  const phys = useMujocoPhysicsPandaV3(true, controls, frameDataRef, missionObjects);

  useEffect(() => {
    if (onPhysHandle) onPhysHandle(phys);
  }, [phys, onPhysHandle]);

  if (phys.state.error) {
    return (
      <Html><div style={{ color: 'red', padding: 20 }}>Error: {phys.state.error}</div></Html>
    );
  }

  return (
    <>
      <ZUpLights />
      {!promo && <ZUpFloor />}
      <Environment preset="warehouse" />
      <OrbitControls
        target={[0, 0, 0.4]}
        minDistance={0.6}
        maxDistance={4}
        enablePan
      />
      {phys.state.loaded && <PandaMeshes bodiesRef={phys.bodiesRef} />}
      {phys.state.loaded && missionObjects.length > 0 && (
        <MissionObjectMeshes objects={missionObjects} statesRef={phys.objectStatesRef} />
      )}
      {(missionSuccessConditions.length > 0 || missionFailConditions.length > 0) && (
        <ConditionTargets
          objects={missionObjects}
          successConditions={missionSuccessConditions}
          failConditions={missionFailConditions}
        />
      )}
    </>
  );
}

// ─── Z-up Floor + Lights (inline, replaces shared Y-up components) ────────

export function ZUpFloor() {
  return (
    <>
      {/* XY plane at z=0 (no rotation).  Render mesh 1mm below z=0 to avoid
          z-fighting with object bottoms that rest exactly on z=0.  Physics
          floor (MJCF) is still at z=0; the offset is render-only. */}
      <mesh position={[0, 0, -0.001]} receiveShadow>
        <planeGeometry args={[2, 2]} />
        <meshStandardMaterial color="#2a2a35" metalness={0.3} roughness={0.7} />
      </mesh>
      {/* drei Grid renders on XZ-plane by default; rotate -π/2 around X to put it on XY (z=0). */}
      <Grid
        args={[2, 2]}
        position={[0, 0, 0.001]}
        rotation={[-Math.PI / 2, 0, 0]}
        cellSize={0.1}
        cellThickness={0.5}
        cellColor="#3a3a4a"
        sectionSize={0.5}
        sectionThickness={1}
        sectionColor="#4a4a5a"
        fadeDistance={2}
        fadeStrength={1.5}
        infiniteGrid={false}
      />
    </>
  );
}

export function ZUpLights() {
  return (
    <>
      <ambientLight intensity={0.5} color="#b0b0cc" />
      {/* Light positions in MuJoCo Z-up coords (x, y, z=up). */}
      <directionalLight
        position={[10, 15, 25]}
        intensity={1.2}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={50}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
      />
      <directionalLight position={[-10, -10, 15]} intensity={0.3} color="#8888cc" />
    </>
  );
}

// Tiny inline HTML helper for error display (avoids drei's Html overhead).
function Html({ children }: { children: React.ReactNode }) {
  return (
    <group>
      <mesh>
        <planeGeometry args={[1, 0.3]} />
        <meshBasicMaterial color="black" transparent opacity={0.7} />
      </mesh>
      {children}
    </group>
  );
}

export function PandaV3Scene({
  controls,
  frameDataRef,
  onPhysHandle,
  promo = false,
  missionObjects = [],
  missionSuccessConditions = [],
  missionFailConditions = [],
}: {
  controls: PandaV3Controls;
  frameDataRef: React.MutableRefObject<PandaV3FrameSnapshot | null>;
  onPhysHandle?: (h: PandaV3PhysicsHandle) => void;
  /** Promo mode: hides the floor + grid for a clean black-bg screenshot. */
  promo?: boolean;
  /** Mission spec — empty for plain demo, populated for mission player. */
  missionObjects?: MissionObject[];
  /** Player 모드에서 success/fail target 영역을 wireframe 으로 표시. */
  missionSuccessConditions?: Condition[];
  missionFailConditions?: Condition[];
}) {
  return (
    <div className="h-full w-full">
      <Canvas
        shadows
        camera={{
          position: [1.5, -1.5, 1.2],
          up: [0, 0, 1],
          fov: 45, near: 0.05, far: 50,
        }}
        gl={{ antialias: true }}
      >
        <Suspense fallback={null}>
          <SceneContent
            controls={controls}
            frameDataRef={frameDataRef}
            onPhysHandle={onPhysHandle}
            promo={promo}
            missionObjects={missionObjects}
            missionSuccessConditions={missionSuccessConditions}
            missionFailConditions={missionFailConditions}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}
