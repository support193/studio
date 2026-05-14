// Admin XP distribution drill-down — per-user awards for one weekly payout.

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

interface AwardRow {
  user_id: string;
  user_email: string | null;
  user_score_sum: number;
  share_fraction: number;
  xp_awarded: number;
}
interface Dist {
  id: string;
  week_start: string;
  week_end: string;
  distributed_at: string;
  pool_xp: number;
  total_score: number;
  participant_count: number;
  distributor_email: string | null;
}

export default async function AdminDistributionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: awardsRaw }, { data: listRaw }] = await Promise.all([
    supabase.rpc('admin_distribution_awards', { p_dist_id: id }),
    supabase.rpc('admin_list_distributions'),
  ]);
  const awards: AwardRow[] = (awardsRaw ?? []) as AwardRow[];
  const dist = ((listRaw ?? []) as Dist[]).find((d) => d.id === id) ?? null;

  return (
    <div className="px-6 py-8">
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/admin/xp"
          className="flex size-[32px] items-center justify-center rounded-full border border-[#1f1f1f] text-[#a8a8b0] hover:text-white"
        >
          <ArrowLeft size={14} />
        </Link>
        <div>
          <h1 className="font-manrope text-[24px] font-semibold text-[#f8f9fa]">
            Distribution {dist ? `${formatDate(dist.week_start)} – ${formatDate(dist.week_end)}` : ''}
          </h1>
          {dist && (
            <p className="font-manrope text-[12px] text-[#737780]">
              Pool {dist.pool_xp.toLocaleString()} XP · {dist.participant_count} participants · total score {Number(dist.total_score).toFixed(1)} · paid {formatDate(dist.distributed_at)} by {dist.distributor_email ?? '—'}
            </p>
          )}
        </div>
      </div>

      {awards.length === 0 ? (
        <div className="rounded-[12px] border border-dashed border-[#1f1f1f] py-10 text-center font-manrope text-[13px] text-[#737780]">
          This week had no eligible participants — the pool was forfeit.
        </div>
      ) : (
        <div className="overflow-hidden rounded-[12px] border border-[#1f1f1f]">
          <table className="w-full text-left">
            <thead className="bg-[rgba(248,249,250,0.03)]">
              <tr>
                <Th>User</Th>
                <Th>Score sum</Th>
                <Th>Share</Th>
                <Th>XP awarded</Th>
              </tr>
            </thead>
            <tbody>
              {awards.map((a) => (
                <tr key={a.user_id} className="border-t border-[#1a1a1a]">
                  <Td>
                    <span className="font-manrope text-[13px] text-[#f8f9fa]">{a.user_email ?? '(deleted)'}</span>
                  </Td>
                  <Td>
                    <span className="font-mono text-[12px] text-[#a8a8b0]">{Number(a.user_score_sum).toFixed(1)}</span>
                  </Td>
                  <Td>
                    <span className="font-mono text-[12px] text-[#a8a8b0]">
                      {(Number(a.share_fraction) * 100).toFixed(1)}%
                    </span>
                  </Td>
                  <Td>
                    <span className="font-mono text-[13px] text-[#a48dff]">+{a.xp_awarded.toLocaleString()} XP</span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 font-manrope text-[10px] font-semibold uppercase tracking-wider text-[#737780]">
      {children}
    </th>
  );
}
function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-3 align-middle">{children}</td>;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric', timeZone: 'UTC' });
}
