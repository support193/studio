// Franka Emika Panda — v3 constants.  Independent from v1 (different code
// path: actuator-direct control + analytical IK, no mocap + no weld).
//
// Asset source: mujoco_menagerie/franka_emika_panda (Apache-2.0), staged
// at /public/models/franka_panda_v3/ (NOT v1's /public/models/franka_panda/).

export const PANDA_V3_BASE_URL = '/models/franka_panda_v3';

/** All mesh files referenced by panda.xml — loaded into MuJoCo VFS. */
export const PANDA_V3_MESH_FILES = [
  'finger_0.obj', 'finger_1.obj',
  'hand_0.obj', 'hand_1.obj', 'hand_2.obj', 'hand_3.obj', 'hand_4.obj', 'hand.stl',
  'link0_0.obj', 'link0_1.obj', 'link0_2.obj', 'link0_3.obj', 'link0_4.obj',
  'link0_5.obj', 'link0_7.obj', 'link0_8.obj', 'link0_9.obj', 'link0_10.obj',
  'link0_11.obj', 'link0.stl',
  'link1.obj', 'link1.stl',
  'link2.obj', 'link2.stl',
  'link3_0.obj', 'link3_1.obj', 'link3_2.obj', 'link3_3.obj', 'link3.stl',
  'link4_0.obj', 'link4_1.obj', 'link4_2.obj', 'link4_3.obj', 'link4.stl',
  'link5_0.obj', 'link5_1.obj', 'link5_2.obj',
  'link5_collision_0.obj', 'link5_collision_1.obj', 'link5_collision_2.obj',
  'link6_0.obj', 'link6_1.obj', 'link6_2.obj', 'link6_3.obj', 'link6_4.obj',
  'link6_5.obj', 'link6_6.obj', 'link6_7.obj', 'link6_8.obj', 'link6_9.obj',
  'link6_10.obj', 'link6_11.obj', 'link6_12.obj', 'link6_13.obj',
  'link6_14.obj', 'link6_15.obj', 'link6_16.obj', 'link6.stl',
  'link7_0.obj', 'link7_1.obj', 'link7_2.obj', 'link7_3.obj',
  'link7_4.obj', 'link7_5.obj', 'link7_6.obj', 'link7_7.obj', 'link7.stl',
];

/** Body → visual OBJ files (Menagerie panda.xml class="visual" geoms). */
export const PANDA_V3_BODY_MESH_MAP: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['link0', ['link0_0.obj', 'link0_1.obj', 'link0_2.obj', 'link0_3.obj', 'link0_4.obj',
             'link0_5.obj', 'link0_7.obj', 'link0_8.obj', 'link0_9.obj', 'link0_10.obj', 'link0_11.obj']],
  ['link1', ['link1.obj']],
  ['link2', ['link2.obj']],
  ['link3', ['link3_0.obj', 'link3_1.obj', 'link3_2.obj', 'link3_3.obj']],
  ['link4', ['link4_0.obj', 'link4_1.obj', 'link4_2.obj', 'link4_3.obj']],
  ['link5', ['link5_0.obj', 'link5_1.obj', 'link5_2.obj']],
  ['link6', ['link6_0.obj', 'link6_1.obj', 'link6_2.obj', 'link6_3.obj', 'link6_4.obj',
             'link6_5.obj', 'link6_6.obj', 'link6_7.obj', 'link6_8.obj', 'link6_9.obj',
             'link6_10.obj', 'link6_11.obj', 'link6_12.obj', 'link6_13.obj',
             'link6_14.obj', 'link6_15.obj', 'link6_16.obj']],
  ['link7', ['link7_0.obj', 'link7_1.obj', 'link7_2.obj', 'link7_3.obj',
             'link7_4.obj', 'link7_5.obj', 'link7_6.obj', 'link7_7.obj']],
  ['hand', ['hand_0.obj', 'hand_1.obj', 'hand_2.obj', 'hand_3.obj', 'hand_4.obj']],
  ['left_finger', ['finger_0.obj', 'finger_1.obj']],
  ['right_finger', ['finger_0.obj', 'finger_1.obj']],
] as const;

export const PANDA_V3_TRACKED_BODIES = PANDA_V3_BODY_MESH_MAP.map(([name]) => name);
export const PANDA_V3_UNIQUE_OBJS = [
  ...new Set(PANDA_V3_BODY_MESH_MAP.flatMap(([, files]) => files)),
];

/** 7 arm joints + 2 finger qpos at the canonical "ready" pose. */
export const PANDA_V3_HOME_QPOS = [0, -0.785, 0, -2.356, 0, 1.571, 0.785, 0.04, 0.04] as const;

/** 7 arm actuator targets + 1 gripper command at home (matches Menagerie keyframe). */
export const PANDA_V3_HOME_CTRL = [0, -0.785, 0, -2.356, 0, 1.571, 0.785, 255] as const;

export const PANDA_V3_GRIPPER_OPEN = 255;
export const PANDA_V3_GRIPPER_CLOSED = 0;

/** 7 actuator names from Menagerie panda.xml. */
export const PANDA_V3_ACTUATOR_NAMES = [
  'actuator1', 'actuator2', 'actuator3', 'actuator4',
  'actuator5', 'actuator6', 'actuator7', 'actuator8',
] as const;
