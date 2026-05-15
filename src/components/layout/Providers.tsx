// Client-side providers wrapping the whole app.  Currently just Turnkey
// (`@turnkey/react-wallet-kit`) so any descendant can call useTurnkey().

'use client';

import { TurnkeyProvider, type TurnkeyProviderConfig } from '@turnkey/react-wallet-kit';

const config: TurnkeyProviderConfig = {
  organizationId:    process.env.NEXT_PUBLIC_TURNKEY_ORGANIZATION_ID!,
  authProxyConfigId: process.env.NEXT_PUBLIC_TURNKEY_AUTH_PROXY_CONFIG_ID!,
};

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <TurnkeyProvider config={config} callbacks={{
      onError: (e) => { if (typeof window !== 'undefined') console.error('Turnkey error', e); },
    }}>
      {children}
    </TurnkeyProvider>
  );
}
