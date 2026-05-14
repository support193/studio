// XP Station — Figma "XP Station" (4:144300 / 4:143818) wired to live data.
//
// Server-renders the donut, metrics, leaderboard, and the user's mission
// history.  A small client wrapper handles tab state + countdown ticker.

import { createClient } from '@/lib/supabase/server';
import XpStationClient from './XpStationClient';

export const dynamic = 'force-dynamic';

interface UserSummary {
  user_id: string;
  total_xp: number;
  weekly_xp: number;
  avg_score: number;
  grade: 'S' | 'A' | 'B' | 'C';
  rank: number;
  attempts_count: number;
  successes: number;
}

export interface LeaderRowDB {
  rank: number;
  user_id: string;
  user_email: string | null;
  total_xp: number;
  avg_score: number;
  grade: 'S' | 'A' | 'B' | 'C';
  attempts: number;
}

export interface HistoryRowDB {
  id: string;
  started_at: string;
  status: 'running' | 'success' | 'failed' | 'timeout' | 'abandoned';
  quality_score: number | null;
  stars: number | null;
  xp_awarded: number | null;
  mission_id: string;
  mission_title: string;
  mission_difficulty: 'easy' | 'medium' | 'hard' | 'expert';
}

export default async function XpStationPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let summary: UserSummary | null = null;
  let history: HistoryRowDB[] = [];
  if (user) {
    const [{ data: sum }, { data: hist }] = await Promise.all([
      supabase.rpc('user_xp_summary', { p_user_id: user.id }).single<UserSummary>(),
      supabase
        .from('mission_attempt_logs')
        .select(`
          id, started_at, status, quality_score, stars, xp_awarded,
          mission:mission_id ( id, title, difficulty )
        `)
        .eq('user_id', user.id)
        .order('started_at', { ascending: false })
        .limit(50),
    ]);
    summary = sum ?? null;
    history = ((hist ?? []) as unknown as Array<{
      id: string;
      started_at: string;
      status: HistoryRowDB['status'];
      quality_score: number | null;
      stars: number | null;
      xp_awarded: number | null;
      mission: { id: string; title: string; difficulty: HistoryRowDB['mission_difficulty'] } | null;
    }>).map((r) => ({
      id: r.id,
      started_at: r.started_at,
      status: r.status,
      quality_score: r.quality_score,
      stars: r.stars,
      xp_awarded: r.xp_awarded,
      mission_id: r.mission?.id ?? '',
      mission_title: r.mission?.title ?? '(deleted mission)',
      mission_difficulty: r.mission?.difficulty ?? 'medium',
    }));
  }

  // Leaderboard (only for signed-in viewers; anon sees empty state).
  let leaders: LeaderRowDB[] = [];
  if (user) {
    const { data } = await supabase.rpc('public_leaderboard', { p_limit: 100 });
    leaders = (data ?? []) as LeaderRowDB[];
  }

  return (
    <div className="relative min-h-[calc(100vh-52px)] w-full overflow-hidden bg-[#030303]">
      {/* hero glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[1050px]"
        style={{
          background:
            'radial-gradient(60% 50% at 30% 18%, rgba(255,255,255,0.10), transparent 70%), radial-gradient(50% 40% at 75% 25%, rgba(124,92,252,0.08), transparent 70%)',
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-[400px] h-[650px]"
        style={{
          background: 'linear-gradient(to bottom, rgba(3,3,3,0) 0%, #030303 100%)',
        }}
      />

      <XpStationClient
        signedIn={!!user}
        summary={summary}
        history={history}
        leaders={leaders}
        currentUserId={user?.id ?? null}
      />
    </div>
  );
}
