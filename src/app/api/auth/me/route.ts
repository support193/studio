import { NextResponse } from 'next/server';
import { getServerUser } from '@/lib/auth/server-user';

export async function GET() {
  const user = await getServerUser();
  if (!user) return NextResponse.json({ user: null });
  return NextResponse.json({ user: { id: user.id, kind: user.kind, email: user.email ?? null } });
}
