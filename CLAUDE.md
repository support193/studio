# 제노 로봇 (studio-production-7d27.up.railway.app)

ZenO 의 외부 공개용 Franka Panda 데모 + missions.  단일 페이지 + admin / mission player.

## ⚠ 두 환경 구분 (작업 위치 식별) — 2026-05-14 명칭 변경됨

| 사용자 호칭 | 디렉터리 | GitHub | Railway | URL |
|---|---|---|---|---|
| **스튜디오** | `/Users/dawnagent2/zeno-studio/` | `support193/zeno-studio` (private, develop) | ZenO-Studio | studio.zen-o.xyz (PROD) / zeno-studio-stg.up.railway.app (STG) |
| **제노 로봇** | `/Users/dawnagent2/zeno-panda-demo/` (← 여기) | `support193/studio` (public, main) | studio | studio-production-7d27.up.railway.app (`/test` 페이지가 데모) |

- "**스튜디오**" = 파이프라인이 있던 메인 작업 환경.  **구 명칭 "파이프라인"**.
- "**제노 로봇**" = 이 디렉터리. Franka Panda 데모 + missions admin/player.  **구 명칭 "스튜디오"**.
- 어느 쪽인지 명확하지 않으면 반드시 물어볼 것.  이 디렉터리에서 작업 시 기본값은 제노 로봇.
- 구 명칭 "파이프라인" / "스튜디오" 가 과거 commit message 에 남아있음 — 새 매핑으로 해석.

## Overview
- Stack: Next.js 16 + React 19 + Three.js + @react-three/fiber/drei + MuJoCo WASM (3.3.8) + Supabase + Railway
- Pages: `/` (랜딩), `/test` (데모 arm 단독), `/missions/[id]/play` (미션 플레이어), `/admin` (미션 CRUD)
- Z-up world (REP-103: +X 앞 / +Y 왼쪽 / +Z 위) — MuJoCo native, Three.js 는 `THREE.Object3D.DEFAULT_UP` mutation 으로 맞춤

## Rules
- **코드 수정 전 반드시 계획 제출 + 사용자 컨펌 받기** (절대 바로 진행하지 않기)
- 로그인/인증 필요한 작업은 사용자에게 credential 요청
- Dark mode only, purple accent (#7C5CFC)
- Comments: 한글 (방향성 / why), 식별자는 영문
- Functional components, Tailwind v4, lucide-react

## Credentials
- Admin: `admin@zen-o.xyz` / `Zeno2025!` (Z 대문자, 하이픈 있는 이메일 — 스튜디오의 admin@zeno.xyz 와 다름)
- Supabase: project `Studio-Panda` (ref `tcxlwssnlfeusjrqvssh`, ap-northeast-1)
- ADMIN_EMAILS Railway env 화이트리스트 필수

## 핵심 디렉터리
- `src/app/admin/missions/` — 미션 CRUD + 3D Editor (MissionEditor/EditScene/ConditionVisuals)
- `src/app/missions/[id]/play/` — 미션 플레이어 (MissionPlayer + metrics)
- `src/components/3d-studio/PandaV3Scene.tsx` — Franka Panda 메인 씬 (ZUpFloor/ZUpLights 도 export)
- `src/components/missions/ConditionTargets.tsx` — player 용 read-only 컨디션 wireframe (pulsing)
- `src/lib/missions/` — `types` (스키마) / `evaluator` (조건 평가) / `metrics` (사용자 평가 메트릭) / `describe` (자연어) / `mjcf-builder` (MJCF 주입)
- `src/hooks/useMujocoPhysicsPandaV3.ts` — 물리 루프
- `src/hooks/usePandaV3Controls.ts` — 키보드 입력 (W/A/S/D/Q/E/↑↓←→/Z/C/Space/R)

## 컨벤션
- 미션 schema: `MissionDefinition` (types.ts) — objects (box/sphere/cylinder), success_conditions (AND), fail_conditions (OR)
- Object size = half-extents (box [hx,hy,hz], sphere [r,0,0], cylinder [r,h,0])
- Object center = geometric center, 따라서 `z >= bottomOffset(obj)` 강제 (clampToFloor)
- Quaternion = `[w, x, y, z]` (MuJoCo 컨벤션) — three.js 로 넘길 때 순서 주의
- 컨디션 타입 6 종: position / orientation / atRest / held / stackedOn / distance

## 롤백
- 태그 `rollback/pre-phase14` (commit `14f5f81`) — Phase 14/15 (예제 미션 + 메트릭 + UI 직관화) 전체 되돌리기
- `git reset --hard rollback/pre-phase14` (로컬에만 태그 있음)
