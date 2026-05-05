// Ghost goal preview — success-condition 의 목표 상태를 반투명 mesh 로 표시.
//
// OpenTeach / RoboHive 의 ghost gripper / twin-scene 패턴.  사용자가 "어떤
// 상태가 success 인지" 직관적으로 봄.
//
// 시각화 규칙:
//   position (sphere region) → target 객체 모양을 region.center 에 ghost
//   position (aabb)         → target 객체 모양을 aabb 중심에 ghost
//   stackedOn               → upper 객체 모양을 lower 위에 ghost (lower.z + lower.h/2 + upper.h/2)
//   distance (op='<')       → b 위치 + dist offset 안쪽 어딘가 (단순화: a 가 b 근처에)
//   distance (op='>')       → 시각화 생략 (멀어지는 거리는 표현 어려움)
//   orientation             → target 객체 위치에 회전된 ghost
//   atRest / held           → 시각화 생략
//
// fail conditions 는 ghost 로 표시 안 함 (그건 피해야 할 상태이므로 audio
// metaphor 안 맞음).  Phase 8 의 wireframe region 으로 충분.

import type { Condition, MissionObject, Vec3, Quat } from '@/lib/missions/types';

const GHOST_OPACITY = 0.35;
const GHOST_COLOR = '#FACC15'; // 노랑 — "여기로 가야 함" 시그널

interface GoalGhostsProps {
  objects: MissionObject[];
  successConditions: Condition[];
}

export default function GoalGhosts({ objects, successConditions }: GoalGhostsProps) {
  const ghosts: Array<{ key: string; obj: MissionObject; pos: Vec3; quat?: Quat }> = [];

  const findObj = (id: string) => objects.find((o) => o.id === id);

  for (let i = 0; i < successConditions.length; i++) {
    const c = successConditions[i];
    const key = `c${i}`;

    if (c.type === 'position') {
      const o = findObj(c.target);
      if (!o) continue;
      let pos: Vec3;
      if (c.region.kind === 'sphere') {
        pos = c.region.center;
      } else {
        // aabb 중심.
        pos = [
          (c.region.min[0] + c.region.max[0]) / 2,
          (c.region.min[1] + c.region.max[1]) / 2,
          (c.region.min[2] + c.region.max[2]) / 2,
        ];
      }
      ghosts.push({ key, obj: o, pos });
    } else if (c.type === 'stackedOn') {
      const upper = findObj(c.upper);
      const lower = findObj(c.lower);
      if (!upper || !lower) continue;
      // lower 의 top 위에 upper 가 놓이는 위치.  lower 의 z-half 는 type 에 따라:
      //   box: lower.size[2], sphere: lower.size[0], cylinder: lower.size[1]
      const lowerHalfZ =
        lower.type === 'box' ? lower.size[2] :
        lower.type === 'sphere' ? lower.size[0] :
        lower.size[1];
      const upperHalfZ =
        upper.type === 'box' ? upper.size[2] :
        upper.type === 'sphere' ? upper.size[0] :
        upper.size[1];
      const pos: Vec3 = [
        lower.initialPos[0],
        lower.initialPos[1],
        lower.initialPos[2] + lowerHalfZ + upperHalfZ,
      ];
      ghosts.push({ key, obj: upper, pos });
    } else if (c.type === 'orientation') {
      const o = findObj(c.target);
      if (!o) continue;
      // Euler XYZ → quat (wxyz).  evaluator 와 같은 컨벤션.
      const [rx, ry, rz] = c.eulerTarget;
      const cx = Math.cos(rx / 2), sx = Math.sin(rx / 2);
      const cy = Math.cos(ry / 2), sy = Math.sin(ry / 2);
      const cz = Math.cos(rz / 2), sz = Math.sin(rz / 2);
      const qw = cx * cy * cz + sx * sy * sz;
      const qx = sx * cy * cz - cx * sy * sz;
      const qy = cx * sy * cz + sx * cy * sz;
      const qz = cx * cy * sz - sx * sy * cz;
      ghosts.push({ key, obj: o, pos: o.initialPos, quat: [qw, qx, qy, qz] });
    }
    // distance, atRest, held — ghost 시각화 안 함.
  }

  return (
    <>
      {ghosts.map(({ key, obj, pos, quat }) => (
        <Ghost key={key} obj={obj} pos={pos} quat={quat ?? obj.initialQuat} />
      ))}
    </>
  );
}

function Ghost({ obj, pos, quat }: { obj: MissionObject; pos: Vec3; quat: Quat }) {
  return (
    <group
      position={[pos[0], pos[1], pos[2]]}
      quaternion={[quat[1], quat[2], quat[3], quat[0]]}
    >
      {obj.type === 'box' && (
        <mesh>
          <boxGeometry args={[obj.size[0] * 2, obj.size[1] * 2, obj.size[2] * 2]} />
          <meshStandardMaterial
            color={GHOST_COLOR}
            transparent
            opacity={GHOST_OPACITY}
            depthWrite={false}
            emissive={GHOST_COLOR}
            emissiveIntensity={0.3}
          />
        </mesh>
      )}
      {obj.type === 'sphere' && (
        <mesh>
          <sphereGeometry args={[obj.size[0], 24, 16]} />
          <meshStandardMaterial
            color={GHOST_COLOR}
            transparent
            opacity={GHOST_OPACITY}
            depthWrite={false}
            emissive={GHOST_COLOR}
            emissiveIntensity={0.3}
          />
        </mesh>
      )}
      {obj.type === 'cylinder' && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[obj.size[0], obj.size[0], obj.size[1] * 2, 24]} />
          <meshStandardMaterial
            color={GHOST_COLOR}
            transparent
            opacity={GHOST_OPACITY}
            depthWrite={false}
            emissive={GHOST_COLOR}
            emissiveIntensity={0.3}
          />
        </mesh>
      )}
    </group>
  );
}
