'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function LogoutButton() {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        const supabase = createClient();
        await supabase.auth.signOut();
        router.replace('/admin/login');
        router.refresh();
      }}
      className="rounded-full border border-[#1f1f1f] px-3 py-1 font-manrope text-[12px] text-[#737780] hover:text-[#f8f9fa]"
    >
      Sign out
    </button>
  );
}
