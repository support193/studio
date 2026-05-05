# Mission 3D Editor — 도입 계획서

> 작성일: 2026-05-05
> 상태: **계획 (미착수)**
> 목적: 어드민이 3D 화면 보면서 객체 배치 + 조건 영역 시각적으로 편집
> 현재 상태: 표 형식 입력만 가능 (`/admin/missions/[id]` 의 Objects / Conditions 탭)

---

## 1. 사례 조사 결과

### r3f / drei 빌트인
- **`<TransformControls>`** — 선택된 객체에 translate / rotate / scale gizmo 부착. 큰 화살표가 객체 바깥에 그려짐. mode 전환 가능 (T/R/S 단축키 관례). `dragging-changed` 이벤트로 OrbitControls 일시정지.
- **`<PivotControls>`** — 객체 pivot 위치에 작은 인라인 gizmo. 여러 객체 동시 핸들에 좋음. depthTest 옵션으로 가려진 객체에도 표시.
- **`<Outlines>` / `<Edges>`** — 선택 highlight.
- **`<Bounds>`** — 자동 카메라 fit.
- **`<Line>`** — 두 객체 사이 선 그리기 (stackedOn / distance 시각화).

### 참고할 r3f 에디터
| | 설명 | 우리에게 쓸 만한 점 |
|---|---|---|
| **Triplex** (triplex.dev) | r3f source 파일 직접 편집하는 에디터 — 뷰포트에서 mesh 드래그하면 코드의 position prop 이 갱신됨 | "viewport ↔ form 양방향 바인딩, 단일 source of truth" 패턴 |
| **leva** (pmndrs/leva) | r3f 용 floating GUI — `useControls` 훅으로 슬라이더 자동 생성 | 프로토타이핑용. 실제 어드민은 shadcn 으로. `?debug=1` 뒤에서만 |
| **Theatre.js** | 애니메이션 키프레임 스튜디오 | "Studio vs Production mode" 토글 패턴만 차용 |

### 로보틱스 씬 에디터
| | 방식 | 차용 포인트 |
|---|---|---|
| **NVIDIA Isaac Sim / Omniverse** | Outliner + 뷰포트, USD prim transform gizmo, Play 버튼으로 physics 시작 시 transform read-only | edit/play 모드 명확 분리 |
| **Webots** (desktop) | 트리 노드 + drag 핸들 + pause/run | 동일 패턴 |
| **MuJoCo `simulate` 뷰어** | 읽기 전용. XML 수정 후 reload | 비교용 — 우리가 더 나은 UX |
| **RoboCasa / AI2-THOR** | Python declarative, GUI 없음 | "snap to support surface" 패턴만 차용 (드래그 시 floor 에 붙이기) |

### 결론 — 우리가 쓸 스택
- **`<TransformControls>`** (translate + rotate, T/R 단축키)
- 클릭→selection store
- 사이드 패널 = 기존 `MissionForm` 의 Objects/Conditions 입력란 (그대로 재사용)
- **wireframe `<mesh>`** 로 condition region 표시 (sphere / aabb)
- **Edit 모드 vs Play 모드 토글** — Edit 면 물리 정지, Play 면 PandaV3Scene 정상 작동
- **Skip**: PivotControls (객체 많을 때 핸들 어수선), Theatre.js (애니메이션 불필요), leva (어드민 UI 면 shadcn)

---

## 2. 목표 (UX)

### 어드민 미션 편집 페이지 (`/admin/missions/new`, `/admin/missions/[id]`)
1. 좌: 사이드 패널 (현재 그대로) — Details / Objects / Conditions 탭
2. 우: 3D 뷰포트 — 큰 영역
3. 상단 토글: **Edit / Play**
   - **Edit**: 물리 정지, 객체 = 스펙 위치 그대로, 클릭 → gizmo 표시 → 드래그하면 사이드 패널의 위치 입력란이 실시간 동기화
   - **Play**: 기존 `MissionPreview` 동작 (물리 ON, 객체 떨어짐, 패널 read-only)

### 동작
- **객체 클릭** → 선택 → 우측 패널이 해당 객체로 점프 + Outline 하이라이트
- **gizmo 드래그** → spec 의 `initialPos` / `initialQuat` 업데이트
- **Add object** 버튼 → 기본 위치에 큐브 spawn → 즉시 선택 + gizmo 표시
- **Condition 영역** 시각화:
  - `position` (sphere region): 반투명 와이어프레임 구
  - `position` (aabb): 와이어프레임 박스
  - `stackedOn` / `distance`: 두 객체 중심 사이 선
  - `held`: target 객체에 그리퍼 아이콘
- **Condition region 편집**: 와이어프레임 클릭 → gizmo 로 center/size 드래그
- **단축키**: T (translate), R (rotate), Esc (선택 해제), Delete (객체 삭제)

---

## 3. 아키텍처

### 상태 관리
- `useMissionEditorStore` (Zustand 또는 React Context):
  ```
  selectedId: string | null              // 선택된 객체/region id
  selectedKind: 'object' | 'region' | null
  mode: 'edit' | 'play'
  gizmoMode: 'translate' | 'rotate'
  ```
- 객체 / 조건 데이터는 기존 `MissionForm` 의 useState 그대로 → store 가 단순히 selection 만 들고 있음

### 두 가지 렌더 경로
- **Edit 모드**: 새 컴포넌트 `MissionEditScene`
  - 물리 hook 호출 안 함 (panda 만 정적 home pose 로 표시 또는 아예 숨김)
  - 객체 = 스펙 그대로 mesh 렌더링 (position/quaternion = `o.initialPos` / `o.initialQuat`)
  - 선택된 객체 ref 에 `<TransformControls>` 부착
  - Outlines / region wireframe 그리기
- **Play 모드**: 기존 `PandaV3Scene` (gizmo 없음)

### 양방향 sync
- 사이드 패널의 input 변경 → state 업데이트 → mesh 의 position prop 변경 → TransformControls 가 새 값 반영
- TransformControls drag → `onObjectChange` 이벤트 → mesh.position 읽어서 state 업데이트
- 한 방향 source of truth: **MissionForm 의 useState**

---

## 4. Phase 별 실행 계획

### Phase 6 — Edit 모드 + 객체 gizmo (필수)
- `MissionEditScene.tsx` — Canvas 내부, 물리 hook 호출 X
  - panda 는 정적 home (또는 옵션으로 숨김)
  - mission objects 만 렌더링 (`MissionObjectMeshes` 재사용)
  - `<TransformControls>` 가 selectedId 의 ref 에 마운트
- `MissionEditorRoot.tsx` — 좌우 split layout
  - 좌: 기존 `MissionForm`
  - 우: `MissionEditScene` + Edit/Play 토글 + T/R 버튼
- 클릭 핸들러: mesh `onClick` → `setSelectedId(o.id)`
- `OrbitControls` 와 충돌 회피: `dragging-changed` 으로 일시정지

### Phase 7 — 사이드 패널 양방향 sync
- TransformControls 의 `onObjectChange` 이벤트에서:
  - mesh.position → `setObjects(...)` 의 해당 객체 `initialPos` 업데이트
  - mesh.quaternion → `initialQuat` 업데이트
- 사이드 패널 number input → state 변경 → React re-render → mesh prop 갱신
- Auto-scroll: 객체 클릭 시 사이드 패널 Objects 탭 자동 활성 + 해당 행 scrollIntoView

### Phase 8 — Condition region 시각화
- `ConditionVisuals.tsx` — Edit 모드에서만 렌더
- 각 condition 별 wireframe:
  - `position` sphere: `<mesh><sphereGeometry args={[r]}/><meshBasicMaterial wireframe color="#7C5CFC" transparent opacity={0.5}/></mesh>`
  - `position` aabb: 박스
  - `stackedOn` / `distance`: drei `<Line>` from A to B + label
- Region 도 selectable (selectedKind='region', selectedId=conditionIndex)
- Region 선택 시 TransformControls 로 center 이동 + 사이드 패널에서 radius 조절 input

### Phase 9 — Add object UX (편의)
- "Add box" / "Add sphere" / "Add cylinder" 버튼
- 기본 위치 (예: `[0.4, 0, 0.05]`) 에 spawn → 즉시 선택 + Edit 모드 + translate gizmo
- 선택 사항: floor raycast 로 클릭 위치에 spawn
- 선택 사항: 드래그 중 floor 에 snap (z = max(0, half_height))

### Phase 10 — 단축키 + 미세 UX (마무리)
- T = translate, R = rotate, Esc = deselect, Delete = remove object
- Grid snap 옵션 (5cm 단위)
- 선택된 객체 outline (`<Outlines>` from drei)
- "Reset positions" 버튼 (모든 객체를 default 위치로)

---

## 5. 위험 & 완화

| 위험 | 영향 | 완화 |
|---|---|---|
| **TransformControls 와 MuJoCo physics 가 같은 transform 을 두고 싸움** | gizmo 드래그가 즉시 physics 에 덮어쓰임 | **Edit 모드에서는 물리 hook 자체를 호출 안 함**. 두 별개 render path. |
| OrbitControls 와 gizmo 조작 충돌 | 드래그 시 카메라도 같이 돔 | drei 표준 패턴: `dragging-changed` → `controls.enabled = false` |
| Selection state 가 form state 와 분리되면 race | Form re-render 시 selection 잃음 | Zustand store + form useState 분리 — store 는 selection 만, form 은 데이터만 |
| 너무 많은 객체 / region 동시 표시로 지저분 | UX 저하 | "Show conditions" 토글 + opacity 0.3 |
| Z-up TransformControls 축 표시 | 익숙치 않음 (보통 Y-up) | 이미 V3 가 Z-up native — 자연스럽게 Z 가 위로 보임 |
| Cylinder 의 mesh local rotation (π/2 around X, MuJoCo Z 축↔Three Y 축) 가 gizmo 와 충돌 | 회전 결과가 spec 으로 잘못 저장 | TransformControls 는 부모 group 의 quaternion 만 변경. mesh local rotation 은 정적 → 상관 없음. |

---

## 6. 우선순위 / POC

POC 는 Phase 6 + 7 만으로 시작:
- 객체 클릭해서 gizmo 로 위치 옮기기 + 사이드 패널 수치 동기화

이거 동작하면 나머지 phase (조건 시각화, add object UX, 단축키) 는 점진 추가 가능.

---

## 7. 참고 라이브러리 / 문서

- drei: https://github.com/pmndrs/drei (TransformControls, Outlines, Line, Bounds, Helper)
- Triplex: https://triplex.dev (참고용 — viewport ↔ source 양방향 바인딩 패턴)
- Three.js TransformControls: https://threejs.org/docs/#examples/en/controls/TransformControls
- Isaac Sim Outliner: 비교용
- Theatre.js mode toggle: 비교용

---

## 7.5. 추가 사례 (2차 조사)

### 로봇 학습 task 에디터
| | 패턴 | 차용 포인트 |
|---|---|---|
| **NVIDIA Isaac Lab** (isaac-sim.github.io/IsaacLab) | RL framework, task = `RewardTermCfg` / `TerminationTermCfg` 데이터클래스 조합 | term-based reward composition — 우리도 condition 마다 weight 줘서 합성 가능 (mid-term) |
| **ManiSkill3** (maniskill.ai) | `_load_scene` / `_initialize_episode` / `evaluate()` 세 단계 분리 | 우리 schema 도 같음 (objects = scene, initialPos = init, conditions = eval). 검증 ✓ |
| **BEHAVIOR-1K / OmniGibson** (behavior.stanford.edu) | **BDDL** (PDDL-derived) — `(inside apple fridge)` 같은 symbolic 술어 | mid/long-term: 비코더가 `inside(cup, drawer)` 타입 입력하게 — predicate 라이브러리 상위 추상화 |
| **Habitat-Sim + RearrangeEpisodeGenerator** | episode = scene + start state + goal state, JSON 직렬화 | 우리 schema 와 일치. JSON dump/load 패턴 검증 ✓ |

### 브라우저 3D 에디터
| | 패턴 | 차용 |
|---|---|---|
| **three.js editor** (threejs.org/editor) | left tree / center viewport / right inspector — 3-pane | 우리 layout 의 표준. localStorage autosave 도 차용 가능 |
| **PlayCanvas Editor** | ECS — entity 에 component attach (script / physics / trigger) | "객체에 SuccessCondition component 붙이기" 추상화 — 미션 component 모델 |
| **Spline** (spline.design) | **Events 탭** — 트리거 (click / collide / look-at) → 액션 시각 바인딩 | **이게 Phase 8 의 best UX 레퍼런스.** "조건 → 시각화" 흐름 그대로 모방 가능 |
| **A-Frame Inspector** (Ctrl+Alt+I) | DOM attribute hot-reload, physics state 유지 | 편집 중 physics 안 끊는 패턴 |

### 게임엔진 트리거 / 목표 에디터
| | 패턴 | 차용 |
|---|---|---|
| **Unreal Blueprint + TriggerBox** | TriggerBox = first-class scene actor, color-coded (success=green, fail=red) | **condition region 색상 컨벤션 즉시 적용**: position-success=초록, fail=빨강, checkpoint=파랑 |
| **Unity Quest Machine / Game Creator 2** | node-graph mission — sequential / parallel / branching | mid-term: 복합 미션 (step 1 → step 2 → 분기) |
| **Godot Area3D + signals** | `body_entered` signal, inspector 에서 signal/slot wiring | `onObjectInZone` callback 모델 (우리 evaluator 와 일치) |
| **Roblox Studio** `Touched` event | 초보자용 "if X touches Y" 템플릿 | UX 단순화 — "Add condition" 버튼 누르면 자연어 템플릿 (e.g. "When X enters Y") |

### 제약 / 목표 시각화 (가장 중요)
| | 패턴 | 차용 |
|---|---|---|
| **ManiSkill goal sites** | **MuJoCo `<site>` element** — 투명 sphere / box, success = `dist(tcp_site, goal_site) < threshold` | 🌟 **MuJoCo 가 이미 site 지원.**  React 에서 wireframe mesh 직접 그리는 대신 mission XML 에 `<site>` 추가 → MuJoCo 가 알아서 렌더 + collision-aware. **Phase 8 단순화** |
| **Isaac Lab reward viz** | rerun.io 또는 omni.debug.draw 로 reward heatmap | 우리는 단순 satisfied/total 표시면 충분. 향후 고급 미션에서 차용 |
| **OpenTeach / AnyTeleop** (open-teach.github.io) | VR teleop, target EE pose 를 **ghost gripper** 로 표시 | **Phase 8/11 추가**: "show goal state" 토글 — 성공 시점의 객체 위치를 반투명으로 미리보기 |
| **RoboHive / FrankaKitchen** | dual-render — 현재 scene + goal scene 동시 (반투명 오버레이) | mid-term — 사용자가 "도달해야 할 상태" 를 직관적으로 봄 |

### 브라우저 physics + 에디터
| | 패턴 | 차용 |
|---|---|---|
| **Triplex + react-three/rapier** | `editor.config.ts` 로 custom inspector 확장점 | 우리도 비슷한 extension point 만들면 추후 condition 종류 추가 쉬움 |
| **Needle Engine** (needle.tools) | Unity export → web, glTF extras 에 component 직렬화 | mid-term: glTF 로 mission scene 익스포트해서 외부 도구와 호환 |
| **Theatre.js** (theatrejs.com) | timeline / keyframe — episode replay | 추후 "성공 시점까지 길이" 시각화 |
| **r3f-editor** (isaac-mason) | running r3f scene 위에 HUD overlay, in-place 편집 | physics 안 끊고 편집하는 ref |

---

## 7.6. 추가 차용 결정 (반영)

기존 계획서의 7번 섹션 위주로 다음 변경:

1. **Condition region 시각화 = MuJoCo `<site>`** (ManiSkill 패턴)
   - React 에서 wireframe mesh 직접 그리는 대신 `mjcf-builder.ts` 에서 condition 별 `<site>` element 생성
   - rgba 색상 컨벤션 (Unreal 차용): success-region 초록 `0 0.8 0 0.3`, fail-region 빨강 `0.9 0.1 0.1 0.3`, checkpoint 파랑 `0.2 0.4 1 0.3`
   - MuJoCo native 렌더 → 우리 코드 더 단순함
   - 단, 우리 R3F 가 MuJoCo XML 의 `<site>` 직접 안 그림 (mesh 만 추출). React 측에서도 site 좌표/크기 별도 mirror mesh 그려야. ManiSkill 은 MuJoCo Python viewer 사용 → site 자동 표시. 우리는 어차피 R3F 라 wireframe mesh 가 더 단순할 수도 있음. **Phase 8 시작할 때 재평가**.

2. **Spline Events tab UX 모방**
   - "Add condition" → 작은 카드 (이름 + 타입 드롭다운 + 인자) → 카드 클릭 시 3D 에서 region 하이라이트
   - 카드 = 사이드 패널, region = 3D — 클릭으로 양방향 동기화

3. **BDDL-스타일 자연어 템플릿** (Phase 11+)
   - "When X enters region Y" / "When X is held by gripper" 같은 문장으로 condition 추가
   - 술어 라이브러리는 우리가 정의 (mid-term)

4. **Ghost goal preview** (Phase 11+)
   - "Show goal state" 토글 → 성공 condition 만족 시점의 객체 위치를 반투명으로 그림
   - position-region condition 의 center 가 그 객체의 goal pos

5. **3-pane layout** (three.js editor 차용)
   - left: object/condition 트리 (이미 사이드 패널 탭 구조 있음 — 그대로 활용)
   - center: 3D 뷰포트
   - right: 선택된 객체/condition 의 상세 inspector (현재는 사이드 패널 안에 inline. POC 후 분리 검토)

---

## 8. 다음 액션

이 문서는 **계획서**. 진행은 별도 task 로:

1. POC 시작 결정 → Phase 6 (Edit 모드 + click selection + TransformControls)
2. Phase 7 (양방향 sync)
3. POC 평가 → Phase 8 (condition region) 진행 여부 결정
4. Phase 9, 10 (add object, 단축키) 점진 추가

진행하려면 사용자가 명시적으로 시작 신호.
