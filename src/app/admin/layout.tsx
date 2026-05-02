import { createClient } from '@/lib/supabase/server';
import LogoutButton from './LogoutButton';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <div className="min-h-[calc(100vh-52px)]">
      {user && (
        <div className="flex items-center justify-between border-b border-[#1a1a1a] px-6 py-3">
          <div className="flex items-center gap-2">
            <span className="font-manrope text-[10px] font-semibold uppercase tracking-[0.2em] text-[#7C5CFC]">
              Admin
            </span>
            <span className="font-manrope text-[12px] text-[#939399]">
              · signed in as {user.email}
            </span>
          </div>
          <LogoutButton />
        </div>
      )}
      {children}
    </div>
  );
}
