'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export interface MissionFormValues {
  id?: string;
  title: string;
  goal: string;
  steps: string[];
  timeLimitS: number;
}

export default function MissionForm({ initial }: { initial?: MissionFormValues }) {
  const router = useRouter();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [goal, setGoal] = useState(initial?.goal ?? '');
  const [steps, setSteps] = useState<string[]>(
    initial?.steps && initial.steps.length > 0 ? initial.steps : [''],
  );
  const [timeLimit, setTimeLimit] = useState(initial?.timeLimitS ?? 300);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = !!initial?.id;

  function updateStep(idx: number, value: string) {
    setSteps((prev) => prev.map((s, i) => (i === idx ? value : s)));
  }
  function addStep() {
    setSteps((prev) => [...prev, '']);
  }
  function removeStep(idx: number) {
    setSteps((prev) => (prev.length === 1 ? [''] : prev.filter((_, i) => i !== idx)));
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
    };

    if (isEdit) {
      const { error } = await supabase.from('missions').update(payload).eq('id', initial!.id!);
      setSaving(false);
      if (error) { setError(error.message); return; }
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('missions')
        .insert({ ...payload, created_by: user?.id });
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
    <form onSubmit={onSave} className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="font-manrope mb-6 text-[24px] font-semibold text-[#f8f9fa]">
        {isEdit ? 'Edit mission' : 'New mission'}
      </h1>

      {error && (
        <div className="mb-4 rounded-[6px] border border-red-700 bg-red-900/20 px-3 py-2 text-[12px] text-red-300">
          {error}
        </div>
      )}

      {/* Title */}
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

      {/* Goal */}
      <Field label="Goal" hint="What should the user accomplish?">
        <textarea
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          rows={3}
          placeholder="Pick up the red cube and place it inside the green region."
          className="w-full resize-y rounded-[8px] border border-[#1f1f1f] bg-transparent px-3 py-2 font-manrope text-[14px] leading-[1.5] text-[#f8f9fa] focus:border-[#7C5CFC] focus:outline-none"
        />
      </Field>

      {/* Steps */}
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
              <button
                type="button"
                onClick={() => removeStep(i)}
                className="text-[#737780] hover:text-red-400"
                aria-label="Remove step"
              >
                <Trash2 size={16} strokeWidth={1.5} />
              </button>
              <span className="text-[#1f1f1f]"><GripVertical size={16} /></span>
            </div>
          ))}
          <button
            type="button"
            onClick={addStep}
            className="mt-1 flex items-center gap-1.5 self-start rounded-full border border-[#1f1f1f] px-3 py-1.5 font-manrope text-[12px] font-medium text-[#737780] hover:text-[#f8f9fa]"
          >
            <Plus size={14} strokeWidth={1.75} />
            Add step
          </button>
        </div>
      </Field>

      {/* Time limit */}
      <Field label="Time limit" hint="Seconds before the mission counts as failed.">
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={36000}
            value={timeLimit}
            onChange={(e) => setTimeLimit(parseInt(e.target.value) || 0)}
            className="w-32 rounded-[8px] border border-[#1f1f1f] bg-transparent px-3 py-2 font-manrope text-[14px] text-[#f8f9fa] focus:border-[#7C5CFC] focus:outline-none"
          />
          <span className="font-manrope text-[12px] text-[#737780]">sec</span>
        </div>
      </Field>

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
              type="button"
              onClick={onDelete}
              disabled={deleting}
              className="rounded-full border border-red-900 px-4 py-2 font-manrope text-[13px] text-red-300 hover:bg-red-900/20 disabled:opacity-50"
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          )}
          <button
            type="submit"
            disabled={saving || !title.trim()}
            className="rounded-full border border-[#040404] bg-[rgba(248,249,250,0.06)] px-5 py-2 font-manrope text-[13px] text-[#f8f9fa] hover:bg-[rgba(248,249,250,0.1)] disabled:opacity-50"
          >
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create'}
          </button>
        </div>
      </div>
    </form>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <label className="mb-1.5 block">
        <span className="font-manrope text-[11px] font-semibold uppercase tracking-wider text-[#737780]">
          {label}
        </span>
        {hint && <span className="ml-2 font-manrope text-[11px] text-[#535357]">{hint}</span>}
      </label>
      {children}
    </div>
  );
}
