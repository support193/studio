// 미션 어드민의 풀스크린 3D 에디터 — Edit / Play 두 모드.
//
//  Edit 모드: 물리 OFF, 객체/컨디션 클릭 선택 + gizmo + inspector.
//  Play  모드: 기존 PandaV3Scene 동작 — 물리 ON, 키보드 조작.
//
// Selection 은 union state: object 또는 condition 한쪽만 선택됨.

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, Move3d, RotateCcw, Play as PlayIcon, Pencil, Plus, Eye, EyeOff, Trash2, Sparkles, Target } from 'lucide-react';
import { PandaV3Scene } from '@/components/3d-studio/PandaV3Scene';
import { usePandaV3Controls } from '@/hooks/usePandaV3Controls';
import type { PandaV3FrameSnapshot } from '@/hooks/useMujocoPhysicsPandaV3';
import {
  clampToFloor, defaultCondition, defaultObject,
  CONDITION_LABELS, CONDITION_TYPES,
  type Condition, type MissionObject, type ObjectType, type Vec3,
} from '@/lib/missions/types';
import { describeCondition, shortLabel, conditionColor } from '@/lib/missions/describe';
import MissionEditScene from './MissionEditScene';

type Mode = 'edit' | 'play';
type GizmoMode = 'translate' | 'rotate';
type Role = 'success' | 'fail';

/** 현재 선택된 entity — 객체 또는 컨디션. */
export type Selection =
  | { kind: 'object'; id: string }
  | { kind: 'condition'; role: Role; index: number };

export default function MissionEditor({
  objects,
  setObjects,
  successConditions = [],
  setSuccessConditions,
  failConditions = [],
  setFailConditions,
  onClose,
}: {
  objects: MissionObject[];
  setObjects: (next: MissionObject[]) => void;
  successConditions?: Condition[];
  setSuccessConditions?: (next: Condition[]) => void;
  failConditions?: Condition[];
  setFailConditions?: (next: Condition[]) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<Mode>('edit');
  const [gizmoMode, setGizmoMode] = useState<GizmoMode>('translate');
  const [selected, setSelected] = useState<Selection | null>(null);
  const [showConditions, setShowConditions] = useState(true);
  const [showGhosts, setShowGhosts] = useState(true);

  const controls = usePandaV3Controls();
  const frameDataRef = useRef<PandaV3FrameSnapshot | null>(null);

  // ─── Resolve selection → data ─────────────────────────────────────────────
  const selectedObject = selected?.kind === 'object'
    ? objects.find((o) => o.id === selected.id) ?? null
    : null;
  const selectedCondition = selected?.kind === 'condition'
    ? (selected.role === 'success' ? successConditions[selected.index] : failConditions[selected.index]) ?? null
    : null;

  // ─── Object helpers ───────────────────────────────────────────────────────
  const updateObject = useCallback((id: string, patch: Partial<MissionObject>) => {
    setObjects(objects.map((o) => (o.id === id ? clampToFloor({ ...o, ...patch }) : o)));
  }, [objects, setObjects]);
  const removeObject = useCallback((id: string) => {
    setObjects(objects.filter((o) => o.id !== id));
    setSelected((sel) => (sel?.kind === 'object' && sel.id === id ? null : sel));
  }, [objects, setObjects]);

  // ─── Condition helpers ────────────────────────────────────────────────────
  const conditionsByRole = useCallback(
    (role: Role) => (role === 'success' ? successConditions : failConditions),
    [successConditions, failConditions],
  );
  const setConditionsByRole = useCallback((role: Role, next: Condition[]) => {
    if (role === 'success') setSuccessConditions?.(next);
    else setFailConditions?.(next);
  }, [setSuccessConditions, setFailConditions]);
  const updateCondition = useCallback((role: Role, index: number, next: Condition) => {
    const arr = conditionsByRole(role);
    setConditionsByRole(role, arr.map((c, i) => (i === index ? next : c)));
  }, [conditionsByRole, setConditionsByRole]);
  const removeCondition = useCallback((role: Role, index: number) => {
    const arr = conditionsByRole(role);
    setConditionsByRole(role, arr.filter((_, i) => i !== index));
    setSelected((sel) => (
      sel?.kind === 'condition' && sel.role === role && sel.index === index ? null : sel
    ));
  }, [conditionsByRole, setConditionsByRole]);
  const addCondition = useCallback((role: Role, type: Condition['type']) => {
    const arr = conditionsByRole(role);
    setConditionsByRole(role, [...arr, defaultCondition(type)]);
    setSelected({ kind: 'condition', role, index: arr.length });
  }, [conditionsByRole, setConditionsByRole]);

  // ─── Keyboard ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (mode !== 'edit') return;
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === 'Escape') { setSelected(null); return; }
      if (e.key === 't' || e.key === 'T') { setGizmoMode('translate'); return; }
      if (e.key === 'r' || e.key === 'R') { setGizmoMode('rotate'); return; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
        if (selected.kind === 'object') removeObject(selected.id);
        else removeCondition(selected.role, selected.index);
        e.preventDefault();
        return;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [mode, selected, removeObject, removeCondition]);

  // ─── Add object ───────────────────────────────────────────────────────────
  const addObject = (type: ObjectType) => {
    const existingNs = objects
      .map((o) => o.id.match(/^obj_(\d+)$/)?.[1])
      .filter((s): s is string => !!s)
      .map((s) => parseInt(s, 10));
    const nextN = (existingNs.length === 0 ? 0 : Math.max(...existingNs)) + 1;
    const id = `obj_${nextN}`;
    const base = defaultObject(id);
    const o: MissionObject = clampToFloor({
      ...base,
      type,
      size: type === 'box' ? [0.025, 0.025, 0.025]
          : type === 'sphere' ? [0.025, 0, 0]
          : [0.02, 0.04, 0],
    });
    setObjects([...objects, o]);
    setSelected({ kind: 'object', id });
  };

  // ─── Gizmo toggle disabled state ──────────────────────────────────────────
  // 객체 선택 시 항상 활성.  컨디션 선택 시 position-sphere (center 드래그) 만 활성.
  const gizmoUsable = useMemo(() => {
    if (selectedObject) return true;
    if (selectedCondition?.type === 'position' && selectedCondition.region.kind === 'sphere') return true;
    return false;
  }, [selectedObject, selectedCondition]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
      onClick={onClose}
    >
      <div
        className="relative h-[92vh] w-[96vw] max-w-[1600px] overflow-hidden rounded-[12px] border border-[#1f1f1f] bg-[#0A0A0F]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top bar */}
        <div className="absolute left-3 top-3 z-10 flex items-center gap-2">
          <ModeToggle mode={mode} setMode={setMode} />
          {mode === 'edit' && (
            <>
              <GizmoToggle gizmoMode={gizmoMode} setGizmoMode={setGizmoMode} disabled={!gizmoUsable} />
              <AddObjectMenu onAdd={addObject} />
              <AddConditionMenu onAdd={addCondition} />
              <button
                type="button"
                onClick={() => setShowConditions((v) => !v)}
                title={showConditions ? 'Hide conditions' : 'Show conditions'}
                className="flex items-center gap-1.5 rounded-full border border-[#1f1f1f] bg-black/40 px-3 py-1 font-manrope text-[12px] text-[#737780] backdrop-blur hover:text-white"
              >
                {showConditions ? <Eye size={12} /> : <EyeOff size={12} />}
                Conditions
              </button>
              <button
                type="button"
                onClick={() => setShowGhosts((v) => !v)}
                title={showGhosts ? 'Hide goal ghosts' : 'Show goal ghosts (성공 시점 객체 위치)'}
                className={`flex items-center gap-1.5 rounded-full border border-[#1f1f1f] bg-black/40 px-3 py-1 font-manrope text-[12px] backdrop-blur ${
                  showGhosts ? 'text-[#FACC15] hover:text-yellow-300' : 'text-[#737780] hover:text-white'
                }`}
              >
                <Sparkles size={12} /> Goal
              </button>
            </>
          )}
        </div>
        <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
          <span className="rounded-full bg-[#5856d6]/20 px-3 py-1 font-manrope text-[11px] font-medium text-[#c5c3ff]">
            {objects.length} object{objects.length === 1 ? '' : 's'}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="flex size-[28px] items-center justify-center rounded-full bg-black/50 text-[#737780] hover:bg-black/80 hover:text-white"
            title="Close (Esc)"
          >
            <X size={14} />
          </button>
        </div>

        {/* Scene */}
        {mode === 'edit' ? (
          <MissionEditScene
            objects={objects}
            setObjects={setObjects}
            selected={selected}
            setSelected={setSelected}
            gizmoMode={gizmoMode}
            successConditions={successConditions}
            failConditions={failConditions}
            updateCondition={updateCondition}
            showConditions={showConditions}
            showGhosts={showGhosts}
          />
        ) : (
          <PandaV3Scene
            controls={controls}
            frameDataRef={frameDataRef}
            missionObjects={objects}
          />
        )}

        {/* Bottom-left: inspector — object 또는 condition */}
        {mode === 'edit' && selectedObject && (
          <ObjectInspector
            obj={selectedObject}
            onUpdate={(patch) => updateObject(selectedObject.id, patch)}
            onDelete={() => removeObject(selectedObject.id)}
          />
        )}
        {mode === 'edit' && selected?.kind === 'condition' && selectedCondition && (
          <ConditionInspector
            cond={selectedCondition}
            role={selected.role}
            objectIds={objects.map((o) => o.id)}
            onUpdate={(next) => updateCondition(selected.role, selected.index, next)}
            onDelete={() => removeCondition(selected.role, selected.index)}
          />
        )}

        {/* Bottom-right: condition 자연어 카드 — 클릭으로 선택 */}
        {mode === 'edit' && (successConditions.length > 0 || failConditions.length > 0) && (
          <ConditionCards
            successConditions={successConditions}
            failConditions={failConditions}
            selected={selected}
            onSelect={setSelected}
          />
        )}

        {/* Bottom-center: hint */}
        <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-[10px] border border-[#1f1f1f] bg-black/40 px-4 py-2 backdrop-blur">
          {mode === 'edit' ? (
            <div className="font-manrope text-[11px] text-[#737780]">
              <kbd className="kbd">T</kbd> Move ·
              <kbd className="kbd ml-1">R</kbd> Rotate ·
              <kbd className="kbd ml-1">Esc</kbd> Deselect ·
              <kbd className="kbd ml-1">Del</kbd> Remove · 클릭/드래그
            </div>
          ) : (
            <div className="font-manrope text-[11px] text-[#737780]">
              <kbd className="kbd">W A S D</kbd> move ·
              <kbd className="kbd ml-1">Q E</kbd> up/down ·
              <kbd className="kbd ml-1">Space</kbd> grip ·
              <kbd className="kbd ml-1">R</kbd> reset
            </div>
          )}
        </div>

        <style jsx>{`
          :global(.kbd) {
            display: inline-block;
            padding: 1px 6px;
            margin: 0 1px;
            border-radius: 4px;
            background: rgba(255, 255, 255, 0.08);
            font-family: ui-monospace, monospace;
            font-size: 10px;
            color: #d8d8de;
          }
        `}</style>
      </div>
    </div>
  );
}

function ModeToggle({ mode, setMode }: { mode: Mode; setMode: (m: Mode) => void }) {
  return (
    <div className="flex rounded-full border border-[#1f1f1f] bg-black/40 p-0.5 backdrop-blur">
      <button
        type="button"
        onClick={() => setMode('edit')}
        className={`flex items-center gap-1.5 rounded-full px-3 py-1 font-manrope text-[12px] font-medium transition-colors ${
          mode === 'edit' ? 'bg-[#5856d6] text-white' : 'text-[#737780] hover:text-white'
        }`}
      >
        <Pencil size={12} /> Edit
      </button>
      <button
        type="button"
        onClick={() => setMode('play')}
        className={`flex items-center gap-1.5 rounded-full px-3 py-1 font-manrope text-[12px] font-medium transition-colors ${
          mode === 'play' ? 'bg-[#5856d6] text-white' : 'text-[#737780] hover:text-white'
        }`}
      >
        <PlayIcon size={12} /> Play
      </button>
    </div>
  );
}

function AddObjectMenu({ onAdd }: { onAdd: (type: ObjectType) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-full border border-[#1f1f1f] bg-black/40 px-3 py-1 font-manrope text-[12px] text-[#737780] backdrop-blur hover:text-white"
      >
        <Plus size={12} /> Object
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 flex flex-col rounded-[8px] border border-[#1f1f1f] bg-[#0A0A0F] shadow-lg">
          {(['box', 'sphere', 'cylinder'] as ObjectType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => { onAdd(t); setOpen(false); }}
              className="px-3 py-1.5 text-left font-manrope text-[12px] text-[#a8a8b0] hover:bg-[rgba(248,249,250,0.05)] hover:text-white"
            >
              {t}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AddConditionMenu({ onAdd }: { onAdd: (role: Role, type: Condition['type']) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-full border border-[#1f1f1f] bg-black/40 px-3 py-1 font-manrope text-[12px] text-[#737780] backdrop-blur hover:text-white"
        title="Add success / fail condition"
      >
        <Target size={12} /> Condition
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 flex gap-2 rounded-[8px] border border-[#1f1f1f] bg-[#0A0A0F] p-2 shadow-lg">
          <RoleColumn role="success" onAdd={onAdd} onClose={() => setOpen(false)} />
          <div className="w-px self-stretch bg-[#1f1f1f]" />
          <RoleColumn role="fail" onAdd={onAdd} onClose={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}

function RoleColumn({
  role, onAdd, onClose,
}: {
  role: Role;
  onAdd: (role: Role, type: Condition['type']) => void;
  onClose: () => void;
}) {
  const color = conditionColor(role);
  return (
    <div className="flex flex-col gap-0.5 min-w-[100px]">
      <div className="px-1 pb-1 font-manrope text-[10px] font-semibold uppercase tracking-wider" style={{ color }}>
        {role}
      </div>
      {CONDITION_TYPES.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => { onAdd(role, t); onClose(); }}
          className="rounded-[6px] px-2 py-1 text-left font-manrope text-[11px] text-[#a8a8b0] hover:bg-[rgba(248,249,250,0.05)] hover:text-white"
        >
          {CONDITION_LABELS[t]}
        </button>
      ))}
    </div>
  );
}

function GizmoToggle({
  gizmoMode, setGizmoMode, disabled,
}: {
  gizmoMode: GizmoMode;
  setGizmoMode: (m: GizmoMode) => void;
  disabled: boolean;
}) {
  return (
    <div
      className={`flex rounded-full border border-[#1f1f1f] bg-black/40 p-0.5 backdrop-blur transition-opacity ${
        disabled ? 'opacity-40' : ''
      }`}
    >
      <button
        type="button"
        onClick={() => setGizmoMode('translate')}
        disabled={disabled}
        className={`flex items-center gap-1.5 rounded-full px-3 py-1 font-manrope text-[12px] font-medium transition-colors ${
          gizmoMode === 'translate' ? 'bg-[rgba(248,249,250,0.12)] text-white' : 'text-[#737780] hover:text-white'
        }`}
        title="Translate (T)"
      >
        <Move3d size={12} /> Move
      </button>
      <button
        type="button"
        onClick={() => setGizmoMode('rotate')}
        disabled={disabled}
        className={`flex items-center gap-1.5 rounded-full px-3 py-1 font-manrope text-[12px] font-medium transition-colors ${
          gizmoMode === 'rotate' ? 'bg-[rgba(248,249,250,0.12)] text-white' : 'text-[#737780] hover:text-white'
        }`}
        title="Rotate (R)"
      >
        <RotateCcw size={12} /> Rotate
      </button>
    </div>
  );
}

function ConditionCards({
  successConditions, failConditions, selected, onSelect,
}: {
  successConditions: Condition[];
  failConditions: Condition[];
  selected: Selection | null;
  onSelect: (s: Selection) => void;
}) {
  return (
    <div className="absolute bottom-3 right-3 z-10 max-h-[280px] w-[300px] overflow-auto rounded-[10px] border border-[#1f1f1f] bg-black/60 p-3 backdrop-blur">
      <div className="mb-2 font-manrope text-[11px] font-semibold uppercase tracking-wider text-[#737780]">
        Conditions
      </div>
      {successConditions.length > 0 && (
        <div className="mb-2">
          <div className="mb-1 font-manrope text-[10px] uppercase text-[#22c55e]">Success (모두)</div>
          {successConditions.map((c, i) => (
            <ConditionCard
              key={`s-${i}`}
              cond={c}
              role="success"
              active={selected?.kind === 'condition' && selected.role === 'success' && selected.index === i}
              onClick={() => onSelect({ kind: 'condition', role: 'success', index: i })}
            />
          ))}
        </div>
      )}
      {failConditions.length > 0 && (
        <div>
          <div className="mb-1 font-manrope text-[10px] uppercase text-[#ef4444]">Fail (하나라도)</div>
          {failConditions.map((c, i) => (
            <ConditionCard
              key={`f-${i}`}
              cond={c}
              role="fail"
              active={selected?.kind === 'condition' && selected.role === 'fail' && selected.index === i}
              onClick={() => onSelect({ kind: 'condition', role: 'fail', index: i })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ConditionCard({
  cond, role, active, onClick,
}: {
  cond: Condition;
  role: Role;
  active: boolean;
  onClick: () => void;
}) {
  const color = conditionColor(role);
  return (
    <button
      type="button"
      onClick={onClick}
      className="mb-1.5 flex w-full items-start gap-2 rounded-[6px] border px-2 py-1.5 text-left transition-colors"
      style={{
        borderColor: active ? color : `${color}40`,
        backgroundColor: active ? `${color}30` : `${color}15`,
      }}
    >
      <span
        className="mt-[1px] rounded px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase"
        style={{ color, backgroundColor: `${color}25` }}
      >
        {shortLabel(cond)}
      </span>
      <span className="font-manrope text-[11px] leading-tight text-[#d8d8de]">
        {describeCondition(cond)}
      </span>
    </button>
  );
}

// ─── Inspectors ──────────────────────────────────────────────────────────────

function ObjectInspector({
  obj, onUpdate, onDelete,
}: {
  obj: MissionObject;
  onUpdate: (patch: Partial<MissionObject>) => void;
  onDelete: () => void;
}) {
  return (
    <div className="absolute bottom-3 left-3 z-10 w-[280px] rounded-[10px] border border-[#1f1f1f] bg-black/60 p-3 backdrop-blur">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-manrope text-[11px] font-semibold uppercase tracking-wider text-[#737780]">
          {obj.type} · {obj.id || 'unnamed'}
        </span>
        <button
          type="button"
          onClick={onDelete}
          title="Remove (Del)"
          className="flex size-[20px] items-center justify-center rounded text-[#737780] hover:bg-red-900/30 hover:text-red-400"
        >
          <Trash2 size={12} />
        </button>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {(['x', 'y', 'z'] as const).map((axis, i) => (
          <label key={axis} className="flex flex-col">
            <span className="mb-0.5 text-[9px] uppercase text-[#535357]">pos {axis}</span>
            <input
              type="number"
              step={0.01}
              value={obj.initialPos[i].toFixed(3)}
              onChange={(e) => {
                const v = parseFloat(e.target.value) || 0;
                const next: Vec3 = [obj.initialPos[0], obj.initialPos[1], obj.initialPos[2]];
                next[i] = v;
                onUpdate({ initialPos: next });
              }}
              className="rounded-[4px] border border-[#1f1f1f] bg-transparent px-1.5 py-1 font-mono text-[11px] text-[#f8f9fa] focus:border-[#5856d6] focus:outline-none"
            />
          </label>
        ))}
      </div>
    </div>
  );
}

function ConditionInspector({
  cond, role, objectIds, onUpdate, onDelete,
}: {
  cond: Condition;
  role: Role;
  objectIds: string[];
  onUpdate: (next: Condition) => void;
  onDelete: () => void;
}) {
  const color = conditionColor(role);
  return (
    <div
      className="absolute bottom-3 left-3 z-10 w-[320px] rounded-[10px] border bg-black/60 p-3 backdrop-blur"
      style={{ borderColor: `${color}60` }}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="font-manrope text-[11px] font-semibold uppercase tracking-wider" style={{ color }}>
          {role} · {shortLabel(cond)}
        </span>
        <button
          type="button"
          onClick={onDelete}
          title="Remove (Del)"
          className="flex size-[20px] items-center justify-center rounded text-[#737780] hover:bg-red-900/30 hover:text-red-400"
        >
          <Trash2 size={12} />
        </button>
      </div>
      <ConditionFields cond={cond} objectIds={objectIds} onChange={onUpdate} />
    </div>
  );
}

function ConditionFields({
  cond, objectIds, onChange,
}: {
  cond: Condition;
  objectIds: string[];
  onChange: (next: Condition) => void;
}) {
  switch (cond.type) {
    case 'position':
      if (cond.region.kind === 'sphere') {
        const c = cond.region.center;
        return (
          <div className="space-y-2">
            <Row label="target">
              <ObjSelect value={cond.target} onChange={(v) => onChange({ ...cond, target: v })} options={objectIds} />
            </Row>
            <Row label="center">
              <Vec3Input
                value={c}
                onChange={(v) => onChange({ ...cond, region: { kind: 'sphere', center: v, radius: cond.region.kind === 'sphere' ? cond.region.radius : 0.05 } })}
              />
            </Row>
            <Row label="radius">
              <NumIn value={cond.region.radius} onChange={(v) => onChange({ ...cond, region: { kind: 'sphere', center: c, radius: Math.max(0.001, v) } })} step={0.01} />
            </Row>
          </div>
        );
      }
      return <div className="text-[11px] text-[#737780]">aabb region — form 에서만 편집 가능 (TODO)</div>;

    case 'orientation':
      return (
        <div className="space-y-2">
          <Row label="target">
            <ObjSelect value={cond.target} onChange={(v) => onChange({ ...cond, target: v })} options={objectIds} />
          </Row>
          <Row label="euler (rad)">
            <Vec3Input value={cond.eulerTarget} onChange={(v) => onChange({ ...cond, eulerTarget: v })} />
          </Row>
          <Row label="tol °">
            <NumIn value={cond.toleranceDeg} onChange={(v) => onChange({ ...cond, toleranceDeg: v })} step={1} />
          </Row>
        </div>
      );

    case 'atRest':
      return (
        <div className="space-y-2">
          <Row label="target">
            <ObjSelect value={cond.target} onChange={(v) => onChange({ ...cond, target: v })} options={objectIds} />
          </Row>
          <Row label="|v| <">
            <NumIn value={cond.velThreshold} onChange={(v) => onChange({ ...cond, velThreshold: v })} step={0.01} />
          </Row>
        </div>
      );

    case 'held':
      return (
        <div className="space-y-2">
          <Row label="target">
            <ObjSelect value={cond.target} onChange={(v) => onChange({ ...cond, target: v })} options={objectIds} />
          </Row>
          <Row label="near <">
            <NumIn value={cond.nearDist} onChange={(v) => onChange({ ...cond, nearDist: v })} step={0.01} />
          </Row>
        </div>
      );

    case 'stackedOn':
      return (
        <div className="space-y-2">
          <Row label="upper">
            <ObjSelect value={cond.upper} onChange={(v) => onChange({ ...cond, upper: v })} options={objectIds} placeholder="upper" />
          </Row>
          <Row label="lower">
            <ObjSelect value={cond.lower} onChange={(v) => onChange({ ...cond, lower: v })} options={objectIds} placeholder="lower" />
          </Row>
          <Row label="xy tol">
            <NumIn value={cond.xyTolerance} onChange={(v) => onChange({ ...cond, xyTolerance: v })} step={0.005} />
          </Row>
        </div>
      );

    case 'distance':
      return (
        <div className="space-y-2">
          <Row label="a">
            <ObjSelect value={cond.a} onChange={(v) => onChange({ ...cond, a: v })} options={objectIds} placeholder="a" />
          </Row>
          <Row label="b">
            <ObjSelect value={cond.b} onChange={(v) => onChange({ ...cond, b: v })} options={objectIds} placeholder="b" />
          </Row>
          <Row label="op / dist">
            <div className="flex items-center gap-1">
              <select
                value={cond.op}
                onChange={(e) => onChange({ ...cond, op: e.target.value as '<' | '>' })}
                className="rounded-[4px] border border-[#1f1f1f] bg-[#0A0A0F] px-1.5 py-1 font-mono text-[11px] text-[#f8f9fa]"
              >
                <option value="<">&lt;</option>
                <option value=">">&gt;</option>
              </select>
              <NumIn value={cond.dist} onChange={(v) => onChange({ ...cond, dist: v })} step={0.01} />
            </div>
          </Row>
        </div>
      );
  }
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-2">
      <span className="w-[68px] shrink-0 font-manrope text-[10px] uppercase text-[#535357]">{label}</span>
      <div className="flex-1">{children}</div>
    </label>
  );
}

function NumIn({ value, onChange, step = 0.01 }: { value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <input
      type="number"
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      className="w-24 rounded-[4px] border border-[#1f1f1f] bg-transparent px-1.5 py-1 font-mono text-[11px] text-[#f8f9fa] focus:border-[#5856d6] focus:outline-none"
    />
  );
}

function Vec3Input({ value, onChange }: { value: Vec3; onChange: (v: Vec3) => void }) {
  return (
    <div className="flex gap-1">
      {[0, 1, 2].map((i) => (
        <input
          key={i}
          type="number"
          step={0.01}
          value={value[i].toFixed(3)}
          onChange={(e) => {
            const v = parseFloat(e.target.value) || 0;
            const next: Vec3 = [value[0], value[1], value[2]];
            next[i] = v;
            onChange(next);
          }}
          className="w-full rounded-[4px] border border-[#1f1f1f] bg-transparent px-1.5 py-1 font-mono text-[11px] text-[#f8f9fa] focus:border-[#5856d6] focus:outline-none"
        />
      ))}
    </div>
  );
}

function ObjSelect({
  value, onChange, options, placeholder = 'object',
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-[4px] border border-[#1f1f1f] bg-[#0A0A0F] px-1.5 py-1 font-mono text-[11px] text-[#f8f9fa]"
    >
      <option value="">{`— ${placeholder} —`}</option>
      {options.map((id) => <option key={id} value={id}>{id}</option>)}
    </select>
  );
}
