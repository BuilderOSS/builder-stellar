'use client';

import { defaultModules } from '@creit.tech/stellar-wallets-kit/modules/utils';
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import { KitEventType } from '@creit.tech/stellar-wallets-kit/types';
import type { Route } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type ReactNode, useEffect } from 'react';
import { Grid, Stack } from 'styled-system/jsx';

import { Badge, Button, Callout, Card, Heading, ShortId, Text } from '@/components/ui';
import { getDaoNetworkConfig, getDefaultDaoNetwork } from '@/lib/dao-config';
import { useDaoSessionStore } from '@/stores/dao-session-store';

const BASE_NAV_ITEMS: Array<{ href: Route; label: string }> = [
  { href: '/', label: 'Dashboard' },
  { href: '/proposals', label: 'Proposals' },
  { href: '/auctions', label: 'Auctions' },
  { href: '/treasury', label: 'Treasury' },
  { href: '/members', label: 'Members' }
];

function NavLink({ href, label, active }: { href: Route; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      style={{
        padding: '10px 14px',
        borderRadius: '999px',
        border: active ? '1px solid rgba(0,133,255,0.42)' : '1px solid rgba(148,163,184,0.2)',
        background: active ? 'rgba(0,133,255,0.12)' : 'rgba(255,255,255,0.03)',
        color: active ? 'white' : 'rgba(177,198,220,0.88)',
        textDecoration: 'none',
        fontSize: '0.92rem',
        fontWeight: 600,
        whiteSpace: 'nowrap'
      }}
    >
      {label}
    </Link>
  );
}

async function validateWalletNetwork(
  address: string,
  currentNetwork: ReturnType<typeof getDaoNetworkConfig>,
  updateSession: ReturnType<typeof useDaoSessionStore.getState>['updateSession']
) {
  try {
    const walletNetwork = await StellarWalletsKit.getNetwork();
    const matchesConfiguredNetwork = walletNetwork.networkPassphrase === currentNetwork.passphrase;
    const status = matchesConfiguredNetwork
      ? `Connected on ${currentNetwork.label}`
      : `Wallet network mismatch: ${walletNetwork.network ?? 'unknown'} is not ${currentNetwork.label}`;

    updateSession({
      address,
      status,
      walletNetworkPassphrase: walletNetwork.networkPassphrase,
      walletNetworkIssue: matchesConfiguredNetwork
        ? ''
        : `Wallet is on ${walletNetwork.network ?? 'an unknown network'} and must be switched to ${currentNetwork.label}.`
    });
  } catch (error) {
    updateSession({
      address,
      status: 'Wallet network validation unavailable',
      walletNetworkPassphrase: '',
      walletNetworkIssue:
        error instanceof Error ? error.message : 'This wallet cannot report its network, so the app cannot validate it.'
    });
  }
}

export function DaoShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const session = useDaoSessionStore();
  const updateSession = useDaoSessionStore((state) => state.updateSession);
  const network = getDefaultDaoNetwork();
  const currentNetwork = getDaoNetworkConfig(network);
  const walletDisabled = Boolean(session.address && session.walletNetworkIssue);
  const adminNavItem: { href: Route; label: string } = { href: '/admin', label: 'Admin' };
  const _isAdmin = session.address && session.address === currentNetwork.adminAddress;
  const navItems: Array<{ href: Route; label: string }> = session.address
    ? [...BASE_NAV_ITEMS, adminNavItem]
    : BASE_NAV_ITEMS;

  useEffect(() => {
    StellarWalletsKit.init({ modules: defaultModules() });

    const onStateUpdated = StellarWalletsKit.on(KitEventType.STATE_UPDATED, (event) => {
      const nextAddress = event.payload.address ?? '';
      updateSession({ address: nextAddress });
    });

    const onDisconnect = StellarWalletsKit.on(KitEventType.DISCONNECT, () => {
      updateSession({
        address: '',
        status: 'Disconnected',
        syncedAt: '',
        walletNetworkPassphrase: '',
        walletNetworkIssue: ''
      });
    });

    return () => {
      onStateUpdated();
      onDisconnect();
    };
  }, [currentNetwork.label, updateSession]);

  useEffect(() => {
    if (!session.address) {
      return;
    }

    void validateWalletNetwork(session.address, currentNetwork, updateSession);
  }, [currentNetwork, session.address, updateSession]);

  async function connectWallet() {
    try {
      const result = await StellarWalletsKit.authModal();
      await validateWalletNetwork(result.address, currentNetwork, updateSession);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Wallet connection failed';
      updateSession({ status: message });
    }
  }

  async function disconnectWallet() {
    try {
      await StellarWalletsKit.disconnect();
    } finally {
      updateSession({
        address: '',
        status: 'Disconnected',
        syncedAt: '',
        walletNetworkPassphrase: '',
        walletNetworkIssue: ''
      });
    }
  }

  return (
    <main className="page-shell">
      <Card p="6">
        <Stack gap="5">
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '16px',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
          >
            <Stack gap="3" style={{ minWidth: 0 }}>
              <Text className="eyebrow" style={{ margin: 0 }}>
                DAO governance
              </Text>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', alignItems: 'flex-start', minWidth: 0 }}>
                <Image
                  src="/icon.svg"
                  alt=""
                  aria-hidden="true"
                  width="76"
                  height="76"
                  style={{
                    border: '1px solid rgba(91, 181, 255, 0.28)',
                    borderRadius: '24px',
                    boxShadow: '0 22px 54px rgba(0, 133, 255, 0.22)',
                    flex: '0 0 auto'
                  }}
                />
                <Stack gap="1" style={{ minWidth: 0 }}>
                  <Heading style={{ fontSize: 'clamp(2.2rem, 4vw, 4rem)', lineHeight: 1.02, margin: 0 }}>
                    {currentNetwork.tokenName}
                  </Heading>
                  <Text className="lede" style={{ margin: 0, maxWidth: '72ch' }}>
                    {currentNetwork.tokenDescription}
                  </Text>
                </Stack>
              </div>
            </Stack>

            <Grid columns={1} gap="3">
              <Badge>
                {session.walletNetworkIssue ? 'Wallet invalid' : session.address ? 'Wallet connected' : 'Wallet idle'}
              </Badge>
              <Badge>{session.status}</Badge>
              {session.address ? <ShortId value={session.address} /> : null}
            </Grid>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            {navItems.map((item) => (
              <NavLink
                key={item.href}
                href={item.href}
                label={item.label}
                active={pathname === item.href || pathname.startsWith(`${item.href}/`)}
              />
            ))}
          </div>

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '10px',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            <Text className="lede" style={{ margin: 0, fontSize: '0.92rem' }}>
              RPC: {currentNetwork.rpcUrl}
            </Text>
            <Button type="button" size="lg" onClick={session.address ? disconnectWallet : connectWallet}>
              {session.address ? 'Disconnect wallet' : 'Connect wallet'}
            </Button>
          </div>
        </Stack>
      </Card>

      <div
        style={{
          position: 'relative',
          pointerEvents: walletDisabled ? 'none' : undefined
        }}
      >
        <div
          style={{
            filter: walletDisabled ? 'saturate(0.7) brightness(0.55)' : undefined,
            opacity: walletDisabled ? 0.55 : 1
          }}
        >
          {children}
        </div>

        {walletDisabled ? (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'center',
              padding: '24px',
              background: 'rgba(2, 6, 23, 0.72)',
              backdropFilter: 'blur(2px)',
              zIndex: 20
            }}
          >
            <div style={{ maxWidth: '760px', width: '100%' }}>
              <Callout
                variant="error"
                badge="Network mismatch"
                title={session.walletNetworkIssue}
                description={`Switch the connected wallet to ${currentNetwork.label} to continue using the app.`}
              />
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
