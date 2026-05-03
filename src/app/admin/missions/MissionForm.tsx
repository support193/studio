'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  CONDITION_LABELS,
  CONDITION_TYPES,
  defaultCondition,
  defaultObject,
  type Condition,
  type MissionObject,
  type ObjectType,
} from '@/lib/missions/types';

type Vec3Tuple = [number, number, number];

export interface MissionFormValues {
  id?: string;
  title: string;
  goal: string;
  steps: string[];
  timeLimitS: number;
  objects: MissionObject[];
  successConditions: Condition[];
  failConditions: Condition[];
}

type Tab = 'details' | 'objects' | 'conditions';

export default function MissionForm({ initial }: { initial?: MissionFormValues }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('details');

  const [title, setTitle] = useState(initial?.title ?? '');
  const [goal, setGoal] = useState(initial?.goal ?? '');
  const [steps, setSteps] = useState<string[]>(
    initial?.steps && initial.steps.length > 0 ? initial.steps : [''],
  );
  const [timeLimit, setTimeLimit] = useState(initial?.timeLimitS ?? 300);
  const [objects, setObjects] = useState<MissionObject[]>(initial?.objects ?? []);
  const [successConds, setSuccessConds] = useState<Condition[]>(initial?.successConditions ?? []);
  const [failConds, setFailConds] = useState<Condition[]>(initial?.failConditions ?? []);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = !!initial?.id;
  const objectIds = objects.map((o) => o.id).filter(Boolean);

  function updateStep(idx: number, value: string) {
    setSteps((p) => p.map((s, i) => (i === idx ? value : s)));
  }
  function addStep() { setSteps((p) => [...p, '']); }
  function removeStep(idx: number) {
    setSteps((p) => (p.length === 1 ? [''] : p.filter((_, i) => i !== idx)));
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const supabase = createClient();

    const cleanSteps = steps.map((s) => s.trim()).filter((s) => s.length > 0);

    const payload = {
      title: title.trim(),
      goal: goal.trim() || null,
      steps: cleanSteps,
      time_limit_s: Math.max(1, timeLimit),
      objects: objects,
      success_conditions: successConds,
      fail_conditions: failConds,
    };

    if (isEdit) {
      const { error } = await supabase.from('missions').update(payload).eq('id', initial!.id!);
      setSaving(false);
      if (error) { setError(error.message); return; }
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('missions').insert({ ...payload, created_by: user?.id });
      setSaving(false);
      if (error) { setError(error.message); return; }
    }
    router.push('/admin');
    router.refresh();
  }

  async function onDelete() {
    if (!isEdit) return;
    if (!confirm(`Delete "${initial!.title}"?  This cannot be undone.`)) return;
    setDeleting(true);
    const supabase = createClient();
    const { error } = await supabase.from('missions').delete().eq('id', initial!.id!);
    setDeleting(false);
    if (error) { setError(error.message); return; }
    router.push('/admin');
    router.refresh();
  }

  return (
    <form onSubmit={onSave} className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="font-manrope mb-1 text-[24px] font-semibold text-[#f8f9fa]">
        {isEdit ? 'Edit mission' : 'New mission'}
      </h1>
      <p className="font-manrope mb-6 text-[13px] text-[#737780]">
        Define the task, the scene objects, and the conditions for success.
      </p>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 border-b border-[#1f1f1f]">
        <TabBtn active={tab === 'details'} onClick={() => setTab('details')}>Details</TabBtn>
        <TabBtn active={tab === 'objects'} onClick={() => setTab('objects')} count={objects.length}>Objects</TabBtn>
        <TabBtn active={tab === 'conditions'} onClick={() => setTab('conditions')} count={successConds.length + failConds.length}>Conditions</TabBtn>
      </div>

      {error && (
        <div className="mb-4 rounded-[6px] border border-red-700 bg-red-900/20 px-3 py-2 text-[12px] text-red-300">
          {error}
        </div>
      )}

      {/* ─── Details ─── */}
      {tab === 'details' && (
        <>
          <Field label="Title">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={120}
              placeholder="e.g. Pick the red cube"
              className="w-full rounded-[8px] border border-[#1f1f1f] bg-transparent px-3 py-2 font-manrope text-[14px] text-[#f8f9fa] focus:border-[#7C5CFC] focus:outline-none"
            />
          </Field>
          <Field label="Goal" hint="What should the user accomplish?">
            <textarea
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              rows={3}
              placeholder="Pick up the red cube and place it inside the green region."
              className="w-full resize-y rounded-[8px] border border-[#1f1f1f] bg-transparent px-3 py-2 font-manrope text-[14px] leading-[1.5] text-[#f8f9fa] focus:border-[#7C5CFC] focus:outline-none"
            />
          </Field>
          <Field label="Steps" hint="Break the goal into ordered substeps.">
            <div className="flex flex-col gap-2">
              {steps.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="flex size-[24px] items-center justify-center rounded-full bg-[rgba(248,249,250,0.05)] font-manrope text-[11px] font-medium text-[#737780]">
                    {i + 1}
                  </span>
                  <input
                    type="text"
                    value={s}
                    onChange={(e) => updateStep(i, e.target.value)}
                    placeholder={`Step ${i + 1}`}
                    className="flex-1 rounded-[8px] border border-[#1f1f1f] bg-transparent px-3 py-2 font-manrope text-[14px] text-[#f8f9fa] focus:border-[#7C5CFC] focus:outline-none"
                  />
                  <button type="button" onClick={() => removeStep(i)} className="text-[#737780] hover:text-red-400">
                    <Trash2 size={16} strokeWidth={1.5} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addStep}
                className="mt-1 flex items-center gap-1.5 self-start rounded-full border border-[#1f1f1f] px-3 py-1.5 font-manrope text-[12px] font-medium text-[#737780] hover:text-[#f8f9fa]"
              >
                <Plus size={14} strokeWidth={1.75} /> Add step
              </button>
            </div>
          </Field>
          <Field label="Time limit" hint="Seconds before the mission counts as failed.">
            <div className="flex items-center gap-2">
              <input
                type="number" min={1} max={36000}
                value={timeLimit}
                onChange={(e) => setTimeLimit(parseInt(e.target.value) || 0)}
                className="w-32 rounded-[8px] border border-[#1f1f1f] bg-transparent px-3 py-2 font-manrope text-[14px] text-[#f8f9fa] focus:border-[#7C5CFC] focus:outline-none"
              />
              <span className="font-manrope text-[12px] text-[#737780]">sec</span>
            </div>
          </Field>
        </>
      )}

      {/* ─── Objects ─── */}
      {tab === 'objects' && (
        <ObjectsTab objects={objects} setObjects={setObjects} />
      )}

      {/* ─── Conditions ─── */}
      {tab === 'conditions' && (
        <ConditionsTab
          objectIds={objectIds}
          successConds={successConds} setSuccessConds={setSuccessConds}
          failConds={failConds} setFailConds={setFailConds}
        />
      )}

      {/* Actions */}
      <div className="mt-8 flex items-center justify-between">
        <button
          type="button"
          onClick={() => router.push('/admin')}
          className="rounded-full px-4 py-2 font-manrope text-[13px] text-[#737780] hover:text-[#f8f9fa]"
        >
          Cancel
        </button>
        <div className="flex items-center gap-3">
          {isEdit && (
            <button
              type="button" onClick={onDelete} disabled={deleting}
              className="rounded-full border border-red-900 px-4 py-2 font-manrope text-[13px] text-red-300 hover:bg-red-900/20 disabled:opacity-50"
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          )}
          <button
            type="submit" disabled={saving || !title.trim()}
            className="rounded-full border border-[#040404] bg-[rgba(248,249,250,0.06)] px-5 py-2 font-manrope text-[13px] text-[#f8f9fa] hover:bg-[rgba(248,249,250,0.1)] disabled:opacity-50"
          >
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create'}
          </button>
        </div>
      </div>
    </form>
  );
}

// ─── Reusable bits ────────────────────────────────────────────────────────

function TabBtn({ active, onClick, count, children }: { active: boolean; onClick: () => void; count?: number; children: React.ReactNode }) {
  return (
    <button
      type="button" onClick={onClick}
      className={`relative px-4 py-2 font-manrope text-[13px] font-medium transition-colors ${
        active ? 'text-[#f8f9fa]' : 'text-[#737780] hover:text-[#f8f9fa]'
      }`}
    >
      {children}
      {typeof count === 'number' && count > 0 && (
        <span className="ml-2 rounded-full bg-[rgba(248,249,250,0.1)] px-1.5 py-0.5 font-mono text-[10px] text-[#f8f9fa]">{count}</span>
      )}
      {active && <span className="absolute bottom-[-1px] left-0 right-0 h-[2px] bg-[#7C5CFC]" />}
    </button>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <label className="mb-1.5 block">
        <span className="font-manrope text-[11px] font-semibold uppercase tracking-wider text-[#737780]">{label}</span>
        {hint && <span className="ml-2 font-manrope text-[11px] text-[#535357]">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

function Mini({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 font-manrope text-[10px] font-semibold uppercase tracking-wider text-[#535357]">{label}</div>
      {children}
    </div>
  );
}

function NumInput({ value, onChange, step = 0.01 }: { value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <input
      type="number" step={step} value={value}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      className="w-20 rounded-[6px] border border-[#1f1f1f] bg-transparent px-2 py-1 font-mono text-[12px] text-[#f8f9fa] focus:border-[#7C5CFC] focus:outline-none"
    />
  );
}

function TextInput({ value, onChange, placeholder, className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <input
      type="text" value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`rounded-[6px] border border-[#1f1f1f] bg-transparent px-2 py-1 font-manrope text-[12px] text-[#f8f9fa] focus:border-[#7C5CFC] focus:outline-none ${className ?? ''}`}
    />
  );
}

// ─── Objects tab ──────────────────────────────────────────────────────────

function ObjectsTab({ objects, setObjects }: { objects: MissionObject[]; setObjects: (xs: MissionObject[]) => void }) {
  function addObject() {
    const id = `object_${objects.length + 1}`;
    setObjects([...objects, defaultObject(id)]);
  }
  function patch(idx: number, p: Partial<MissionObject>) {
    setObjects(objects.map((o, i) => (i === idx ? { ...o, ...p } : o)));
  }
  function remove(idx: number) {
    setObjects(objects.filter((_, i) => i !== idx));
  }

  return (
    <div>
      {objects.length === 0 && (
        <div className="mb-4 rounded-[12px] border border-dashed border-[#1f1f1f] py-10 text-center">
          <p className="font-manrope text-[13px] text-[#737780]">
            No objects yet — add a cube, sphere, or cylinder for the user to manipulate.
          </p>
        </div>
      )}
      {objects.map((o, i) => (
        <div key={i} className="mb-3 rounded-[12px] border border-[#1f1f1f] bg-[rgba(248,249,250,0.02)] p-4">
          <div className="mb-3 flex items-center justify-between">
            <TextInput value={o.id} onChange={(v) => patch(i, { id: v })} placeholder="object_id" className="w-40 font-mono" />
            <button type="button" onClick={() => remove(i)} className="text-[#737780] hover:text-red-400">
              <Trash2 size={14} strokeWidth={1.5} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Mini label="Type">
              <select
                value={o.type}
                onChange={(e) => patch(i, { type: e.target.value as ObjectType })}
                className="w-full rounded-[6px] border border-[#1f1f1f] bg-[#0A0A0F] px-2 py-1 font-manrope text-[12px] text-[#f8f9fa]"
              >
                <option value="box">Box</option>
                <option value="sphere">Sphere</option>
                <option value="cylinder">Cylinder</option>
              </select>
            </Mini>
            <Mini label="Color">
              <input
                type="color" value={o.color}
                onChange={(e) => patch(i, { color: e.target.value })}
                className="h-[26px] w-full rounded-[6px] border border-[#1f1f1f] bg-transparent"
              />
            </Mini>
            <Mini label="Mass (kg)">
              <NumInput value={o.mass} onChange={(v) => patch(i, { mass: v })} step={0.05} />
            </Mini>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Mini label="Position (x, y, z)">
              <div className="flex gap-1">
                {[0, 1, 2].map((axis) => (
                  <NumInput
                    key={axis}
                    value={o.initialPos[axis]}
                    onChange={(v) => {
                      const next: [number, number, number] = [...o.initialPos];
                      next[axis] = v;
                      patch(i, { initialPos: next });
                    }}
                  />
                ))}
              </div>
            </Mini>
            <Mini label="Size (x, y, z) — half-extents / radius">
              <div className="flex gap-1">
                {[0, 1, 2].map((axis) => (
                  <NumInput
                    key={axis}
                    value={o.size[axis]}
                    onChange={(v) => {
                      const next: [number, number, number] = [...o.size];
                      next[axis] = v;
                      patch(i, { size: next });
                    }}
                  />
                ))}
              </div>
            </Mini>
          </div>
        </div>
      ))}
      <button
        type="button" onClick={addObject}
        className="flex items-center gap-1.5 rounded-full border border-[#1f1f1f] px-3 py-1.5 font-manrope text-[12px] font-medium text-[#737780] hover:text-[#f8f9fa]"
      >
        <Plus size={14} strokeWidth={1.75} /> Add object
      </button>
    </div>
  );
}

// ─── Conditions tab ───────────────────────────────────────────────────────

function ConditionsTab({
  objectIds,
  successConds, setSuccessConds,
  failConds, setFailConds,
}: {
  objectIds: string[];
  successConds: Condition[];
  setSuccessConds: (xs: Condition[]) => void;
  failConds: Condition[];
  setFailConds: (xs: Condition[]) => void;
}) {
  return (
    <div className="space-y-8">
      <CondSection
        title="Success — all must hold"
        helper="Mission completes when every condition below is true at the same time."
        conds={successConds}
        setConds={setSuccessConds}
        objectIds={objectIds}
      />
      <CondSection
        title="Fail — any one trips"
        helper="Mission ends in failure as soon as any condition below holds."
        conds={failConds}
        setConds={setFailConds}
        objectIds={objectIds}
      />
    </div>
  );
}

function CondSection({
  title, helper, conds, setConds, objectIds,
}: {
  title: string; helper: string; conds: Condition[]; setConds: (xs: Condition[]) => void; objectIds: string[];
}) {
  function add() {
    setConds([...conds, defaultCondition('position')]);
  }
  function patch(idx: number, c: Condition) {
    setConds(conds.map((x, i) => (i === idx ? c : x)));
  }
  function remove(idx: number) {
    setConds(conds.filter((_, i) => i !== idx));
  }

  return (
    <div>
      <div className="mb-2">
        <h3 className="font-manrope text-[14px] font-semibold text-[#f8f9fa]">{title}</h3>
        <p className="font-manrope text-[11px] text-[#535357]">{helper}</p>
      </div>
      {conds.length === 0 && (
        <div className="mb-3 rounded-[8px] border border-dashed border-[#1f1f1f] py-6 text-center">
          <p className="font-manrope text-[12px] text-[#737780]">No conditions yet.</p>
        </div>
      )}
      {conds.map((c, i) => (
        <div key={i} className="mb-2 rounded-[10px] border border-[#1f1f1f] bg-[rgba(248,249,250,0.02)] p-3">
          <div className="mb-2 flex items-center gap-2">
            <select
              value={c.type}
              onChange={(e) => patch(i, defaultCondition(e.target.value as Condition['type']))}
              className="rounded-[6px] border border-[#1f1f1f] bg-[#0A0A0F] px-2 py-1 font-manrope text-[12px] text-[#f8f9fa]"
            >
              {CONDITION_TYPES.map((t) => (
                <option key={t} value={t}>{CONDITION_LABELS[t]}</option>
              ))}
            </select>
            <button type="button" onClick={() => remove(i)} className="ml-auto text-[#737780] hover:text-red-400">
              <Trash2 size={14} strokeWidth={1.5} />
            </button>
          </div>
          <CondFields cond={c} onChange={(c2) => patch(i, c2)} objectIds={objectIds} />
        </div>
      ))}
      <button
        type="button" onClick={add}
        className="flex items-center gap-1.5 rounded-full border border-[#1f1f1f] px-3 py-1.5 font-manrope text-[12px] font-medium text-[#737780] hover:text-[#f8f9fa]"
      >
        <Plus size={14} strokeWidth={1.75} /> Add condition
      </button>
    </div>
  );
}

function ObjectIdSelect({ value, onChange, options, placeholder = 'object' }: { value: string; onChange: (v: string) => void; options: string[]; placeholder?: string }) {
  return (
    <select
      value={value} onChange={(e) => onChange(e.target.value)}
      className="rounded-[6px] border border-[#1f1f1f] bg-[#0A0A0F] px-2 py-1 font-mono text-[12px] text-[#f8f9fa]"
    >
      <option value="">{`— ${placeholder} —`}</option>
      {options.map((id) => <option key={id} value={id}>{id}</option>)}
    </select>
  );
}

function CondFields({ cond, onChange, objectIds }: { cond: Condition; onChange: (c: Condition) => void; objectIds: string[] }) {
  switch (cond.type) {
    case 'position':
      if (cond.region.kind !== 'sphere') return null; // AABB 는 추후 — 지금은 sphere 만 UI 노출
      return (
        <div className="flex flex-wrap items-center gap-2">
          <ObjectIdSelect value={cond.target} onChange={(v) => onChange({ ...cond, target: v })} options={objectIds} placeholder="target" />
          <span className="font-manrope text-[12px] text-[#737780]">in sphere center</span>
          {[0, 1, 2].map((axis) => (
            <NumInput
              key={axis}
              value={(cond.region as { center: Vec3Tuple }).center[axis]}
              onChange={(v) => {
                if (cond.region.kind !== 'sphere') return;
                const next: Vec3Tuple = [
                  cond.region.center[0],
                  cond.region.center[1],
                  cond.region.center[2],
                ];
                next[axis] = v;
                onChange({ ...cond, region: { kind: 'sphere', center: next, radius: cond.region.radius } });
              }}
            />
          ))}
          <span className="font-manrope text-[12px] text-[#737780]">r</span>
          <NumInput
            value={cond.region.radius}
            onChange={(v) => {
              if (cond.region.kind !== 'sphere') return;
              onChange({ ...cond, region: { kind: 'sphere', center: cond.region.center, radius: v } });
            }}
          />
        </div>
      );
    case 'orientation':
      return (
        <div className="flex flex-wrap items-center gap-2">
          <ObjectIdSelect value={cond.target} onChange={(v) => onChange({ ...cond, target: v })} options={objectIds} />
          <span className="font-manrope text-[12px] text-[#737780]">euler (rad)</span>
          {[0, 1, 2].map((axis) => (
            <NumInput
              key={axis}
              value={cond.eulerTarget[axis]}
              onChange={(v) => {
                const next: [number, number, number] = [...cond.eulerTarget];
                next[axis] = v;
                onChange({ ...cond, eulerTarget: next });
              }}
            />
          ))}
          <span className="font-manrope text-[12px] text-[#737780]">tol °</span>
          <NumInput value={cond.toleranceDeg} onChange={(v) => onChange({ ...cond, toleranceDeg: v })} step={1} />
        </div>
      );
    case 'atRest':
      return (
        <div className="flex flex-wrap items-center gap-2">
          <ObjectIdSelect value={cond.target} onChange={(v) => onChange({ ...cond, target: v })} options={objectIds} />
          <span className="font-manrope text-[12px] text-[#737780]">|v| &lt;</span>
          <NumInput value={cond.velThreshold} onChange={(v) => onChange({ ...cond, velThreshold: v })} step={0.01} />
        </div>
      );
    case 'held':
      return (
        <div className="flex flex-wrap items-center gap-2">
          <ObjectIdSelect value={cond.target} onChange={(v) => onChange({ ...cond, target: v })} options={objectIds} />
          <span className="font-manrope text-[12px] text-[#737780]">near gripper &lt;</span>
          <NumInput value={cond.nearDist} onChange={(v) => onChange({ ...cond, nearDist: v })} step={0.01} />
          <span className="font-manrope text-[12px] text-[#737780]">m</span>
        </div>
      );
    case 'stackedOn':
      return (
        <div className="flex flex-wrap items-center gap-2">
          <ObjectIdSelect value={cond.upper} onChange={(v) => onChange({ ...cond, upper: v })} options={objectIds} placeholder="upper" />
          <span className="font-manrope text-[12px] text-[#737780]">on</span>
          <ObjectIdSelect value={cond.lower} onChange={(v) => onChange({ ...cond, lower: v })} options={objectIds} placeholder="lower" />
          <span className="font-manrope text-[12px] text-[#737780]">xy tol</span>
          <NumInput value={cond.xyTolerance} onChange={(v) => onChange({ ...cond, xyTolerance: v })} step={0.005} />
        </div>
      );
    case 'distance':
      return (
        <div className="flex flex-wrap items-center gap-2">
          <ObjectIdSelect value={cond.a} onChange={(v) => onChange({ ...cond, a: v })} options={objectIds} placeholder="a" />
          <select
            value={cond.op} onChange={(e) => onChange({ ...cond, op: e.target.value as '<' | '>' })}
            className="rounded-[6px] border border-[#1f1f1f] bg-[#0A0A0F] px-2 py-1 font-mono text-[12px] text-[#f8f9fa]"
          >
            <option value="<">&lt;</option>
            <option value=">">&gt;</option>
          </select>
          <NumInput value={cond.dist} onChange={(v) => onChange({ ...cond, dist: v })} step={0.01} />
          <span className="font-manrope text-[12px] text-[#737780]">m from</span>
          <ObjectIdSelect value={cond.b} onChange={(v) => onChange({ ...cond, b: v })} options={objectIds} placeholder="b" />
        </div>
      );
  }
}
