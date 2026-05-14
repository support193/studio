// Admin-only signed-URL bouncer for a stored trajectory.  Looks up the
// trajectory_path on the requested log row, asks Supabase Storage for a
// short-lived signed URL, and redirects.  We don't proxy the bytes — the
// browser fetches direct from Storage.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ logId: string }> },
) {
  const { logId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  // is_admin() is enforced at the storage-policy level, but also fetch
  // here so non-admins get a tidy 403 instead of a confusing storage error.
  const adminEmails = (process.env.ADMIN_EMAILS ?? '')
    .split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (!adminEmails.includes((user.email ?? '').toLowerCase())) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const { data: log } = await supabase
    .from('mission_attempt_logs')
    .select('trajectory_path')
    .eq('id', logId)
    .single();
  if (!log || !log.trajectory_path) {
    return NextResponse.json({ error: 'no_trajectory' }, { status: 404 });
  }

  const { data: signed, error } = await supabase.storage
    .from('mission-trajectories')
    .createSignedUrl(log.trajectory_path, 300);  // 5-minute TTL
  if (error || !signed) {
    return NextResponse.json({ error: error?.message ?? 'sign_failed' }, { status: 500 });
  }

  return NextResponse.redirect(signed.signedUrl);
}
