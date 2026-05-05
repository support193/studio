// 미션 어드민의 풀스크린 3D 에디터 — Edit / Play 두 모드.
//
//  Edit 모드: 물리 OFF, 객체 클릭/드래그로 위치 조정, 사이드 패널 입력값과 양방향 sync.
//  Play  모드: 기존 PandaV3Scene 동작 — 물리 ON, 키보드 조작.
//
// MissionForm 의 "Open 3D editor" 버튼이 띄움.  objects state 를 받아서 props 로
// 받음.  Edit 모드에서 변경 사항은 setObjects 로 즉시 반영 → Form 의 inputs 도 자동 sync.

'use client';

import { useEffect, useRef, useState } from 'react';
import { X, Move3d, RotateCcw, Play as PlayIcon, Pencil, Plus, Eye, EyeOff, Trash2 } from 'lucide-react';
import { PandaV3Scene } from '@/components/3d-studio/PandaV3Scene';
import { usePandaV3Controls } from '@/hooks/usePandaV3Controls';
import type { PandaV3FrameSnapshot } from '@/hooks/useMujocoPhysicsPandaV3';
import { defaultObject, type Condition, type MissionObject, type ObjectType } from '@/lib/missions/types';
import MissionEditScene from './MissionEditScene';

type Mode = 'edit' | 'play';
type GizmoMode = 'translate' | 'rotate';

export default function MissionEditor({
  objects,
  setObjects,
  successConditions = [],
  failConditions = [],
  onClose,
}: {
  objects: MissionObject[];
  setObjects: (next: MissionObject[]) => void;
  successConditions?: Condition[];
  failConditions?: Condition[];
  onClose: () => void;
}) {
  const [mode, setMode] = useState<Mode>('edit');
  const [gizmoMode, setGizmoMode] = useState<GizmoMode>('translate');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showConditions, setShowConditions] = useState(true);

  const controls = usePandaV3Controls();
  const frameDataRef = useRef<PandaV3FrameSnapshot | null>(null);

  const selected = objects.find((o) => o.id === selectedId) ?? null;

  // 단축키: T (translate), R (rotate), Esc (deselect), Delete (remove selected),
  //         W (close).  Edit 모드에서만 동작.
  useEffect(() => {
    if (mode !== 'edit') return;
    const handler = (e: KeyboardEvent) => {
      // input 안에서 타이핑 중이면 무시.
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === 'Escape') { setSelectedId(null); return; }
      if (e.key === 't' || e.key === 'T') { setGizmoMode('translate'); return; }
      if (e.key === 'r' || e.key === 'R') { setGizmoMode('rotate'); return; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        setObjects(objects.filter((o) => o.id !== selectedId));
        setSelectedId(null);
        e.preventDefault();
        return;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [mode, selectedId, objects, setObjects]);

  // Add object — 새 id 자동 생성 (obj_1, obj_2, ...) + 즉시 선택.
  const addObject = (type: ObjectType) => {
    const existingNs = objects
      .map((o) => o.id.match(/^obj_(\d+)$/)?.[1])
      .filter((s): s is string => !!s)
      .map((s) => parseInt(s, 10));
    const nextN = (existingNs.length === 0 ? 0 : Math.max(...existingNs)) + 1;
    const id = `obj_${nextN}`;
    const base = defaultObject(id);
    const o: MissionObject = {
      ...base,
      type,
      // type 별로 합리적인 default size.
      size: type === 'box' ? [0.025, 0.025, 0.025]
          : type === 'sphere' ? [0.025, 0, 0]
          : [0.02, 0.04, 0],
    };
    setObjects([...objects, o]);
    setSelectedId(id);
  };

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
              <GizmoToggle gizmoMode={gizmoMode} setGizmoMode={setGizmoMode} disabled={!selectedId} />
              <AddObjectMenu onAdd={addObject} />
              <button
                type="button"
                onClick={() => setShowConditions((v) => !v)}
                title={showConditions ? 'Hide conditions' : 'Show conditions'}
                className="flex items-center gap-1.5 rounded-full border border-[#1f1f1f] bg-black/40 px-3 py-1 font-manrope text-[12px] text-[#737780] backdrop-blur hover:text-white"
              >
                {showConditions ? <Eye size={12} /> : <EyeOff size={12} />}
                Conditions
              </button>
            </>
          )}
        </div>
        <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
          <span className="rounded-full bg-[#7C5CFC]/20 px-3 py-1 font-manrope text-[11px] font-medium text-[#a48dff]">
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
            selectedId={selectedId}
            setSelectedId={setSelectedId}
            gizmoMode={gizmoMode}
            successConditions={successConditions}
            failConditions={failConditions}
            showConditions={showConditions}
          />
        ) : (
          <PandaV3Scene
            controls={controls}
            frameDataRef={frameDataRef}
            missionObjects={objects}
          />
        )}

        {/* Bottom-left: selected object inspector (Edit 모드) */}
        {mode === 'edit' && selected && (
          <SelectedInspector
            obj={selected}
            onUpdate={(patch) => {
              setObjects(objects.map((o) => (o.id === selected.id ? { ...o, ...patch } : o)));
            }}
            onDelete={() => {
              setObjects(objects.filter((o) => o.id !== selected.id));
              setSelectedId(null);
            }}
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
          mode === 'edit' ? 'bg-[#7C5CFC] text-white' : 'text-[#737780] hover:text-white'
        }`}
      >
        <Pencil size={12} /> Edit
      </button>
      <button
        type="button"
        onClick={() => setMode('play')}
        className={`flex items-center gap-1.5 rounded-full px-3 py-1 font-manrope text-[12px] font-medium transition-colors ${
          mode === 'play' ? 'bg-[#7C5CFC] text-white' : 'text-[#737780] hover:text-white'
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
        <Plus size={12} /> Add
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

function SelectedInspector({
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
                const next = [...obj.initialPos] as [number, number, number];
                next[i] = v;
                onUpdate({ initialPos: next });
              }}
              className="rounded-[4px] border border-[#1f1f1f] bg-transparent px-1.5 py-1 font-mono text-[11px] text-[#f8f9fa] focus:border-[#7C5CFC] focus:outline-none"
            />
          </label>
        ))}
      </div>
    </div>
  );
}
