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

## 8. 다음 액션

이 문서는 **계획서**. 진행은 별도 task 로:

1. POC 시작 결정 → Phase 6 (Edit 모드 + click selection + TransformControls)
2. Phase 7 (양방향 sync)
3. POC 평가 → Phase 8 (condition region) 진행 여부 결정
4. Phase 9, 10 (add object, 단축키) 점진 추가

진행하려면 사용자가 명시적으로 시작 신호.
