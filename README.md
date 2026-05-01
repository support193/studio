# ZenO Robot — Franka Panda Demo

Interactive Franka Emika Panda arm in your browser. MuJoCo physics + analytical
forward kinematics + differential-IK with null-space posture task. Pure
client-side — no login, no API, no database.

## Stack
- Next.js 16 + React 19 + Three.js + @react-three/fiber/drei
- MuJoCo WASM (zalo build, 3.3.8) for physics
- Diff-IK + null-space posture (kevinzakka/mjctrl pattern)

## Local dev
```bash
npm install
npm run dev
# open http://localhost:3000
```

## Controls
- **W A S D** — EE position (forward / left / back / right)
- **Q / E** — Up / Down
- **Z / C** — Wrist spin
- **↑ ↓** — Forward / back tilt
- **← →** — Left / right tilt
- **Space** — Gripper open / close
- **R** — Reset to home

## Assets
- Robot model: [MuJoCo Menagerie franka_emika_panda](https://github.com/google-deepmind/mujoco_menagerie/tree/main/franka_emika_panda) (Apache-2.0)
- IK: [He et al. 2021 analytical solver](https://github.com/ffall007/franka_analytical_ik) + [kevinzakka/mjctrl](https://github.com/kevinzakka/mjctrl) diff-IK
