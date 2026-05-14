// Server actions invoked by /admin/xp forms.
//
// `saveSettings` writes weekly_pool_xp + distribution_dow via the
// admin_set_xp_settings RPC.  `distributeWeek` calls admin_distribute_week
// for the supplied Monday-aligned week-start timestamp.

'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function saveSettings(formData: FormData) {
  const pool = parseInt(String(formData.get('pool') ?? ''), 10);
  const dow  = parseInt(String(formData.get('dow')  ?? ''), 10);
  if (!Number.isFinite(pool) || pool < 0 || !Number.isFinite(dow) || dow < 0 || dow > 6) {
    redirect('/admin/xp?error=' + encodeURIComponent('Invalid settings'));
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc('admin_set_xp_settings', {
    p_weekly_pool: pool,
    p_dow: dow,
  });
  if (error) {
    redirect('/admin/xp?error=' + encodeURIComponent(error.message));
  }
  redirect('/admin/xp?saved=1');
}

export async function distributeWeek(formData: FormData) {
  const weekStart = String(formData.get('week_start') ?? '');
  if (!weekStart) {
    redirect('/admin/xp?error=' + encodeURIComponent('Missing week'));
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc('admin_distribute_week', { p_week_start: weekStart });
  if (error) {
    redirect('/admin/xp?error=' + encodeURIComponent(error.message));
  }
  redirect('/admin/xp?distributed=' + encodeURIComponent(weekStart));
}
