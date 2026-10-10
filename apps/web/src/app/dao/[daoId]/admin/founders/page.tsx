'use client';

import { Client as TokenClient } from '@builder-stellar/token-bindings';
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import { TransactionBuilder } from '@stellar/stellar-sdk';
import Link from 'next/link';
import { useState } from 'react';
import { Stack } from 'styled-system/jsx';

import { AdminSurfaceNav as AdminSectionNav } from '@/components/admin/admin-surface-nav';
import { type FounderMintRow, founderMintValues } from '@/components/admin/founder-mint-values';
import { PageSection } from '@/components/page-section';
import { Button, Callout, Card, Heading, Input, Text } from '@/components/ui';
import { useDaoContext } from '@/contexts/dao-context';
import { adminReadOptions, useAdminArtwork, useAdminTokenState } from '@/lib/admin-surfaces';
import { useTransactionFeedback } from '@/lib/transaction-feedback';
import { confirmCreationTransaction, DefinitiveTransactionFailure } from '@/lib/use-dao-deployment';
import { useAuthSessionStore } from '@/stores/auth-session-store';

export default function FoundersAdminPage() {
  const { daoId, daoConfig: config } = useDaoContext();
  const session = useAuthSessionStore();
  const token = useAdminTokenState(config, session.address);
  const artwork = useAdminArtwork(config, session.address);
  const tx = useTransactionFeedback(config.name);
  const [rows, setRows] = useState<FounderMintRow[]>([{ recipient: '', amount: '1' }]);
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [receipt, setReceipt] = useState('');
  const allowed = Boolean(
    token.data && !token.data.live && token.data.owner === session.address && session.authStatus === 'authenticated'
  );
  const networkReady =
    !session.walletNetworkIssue &&
    (!session.walletNetworkPassphrase || session.walletNetworkPassphrase === config.passphrase);
  const receiptKey = `founder-mint:${config.name}:${config.tokenContractId}:${session.address}`;

  async function mint(recoverOnly = false) {
    if (!allowed || !networkReady || busy || !session.address) return;
    setBusy(true);
    setMessage('');
    try {
      if (!navigator.locks)
        throw new Error('Use a browser with Web Locks support to keep founder minting safe across tabs.');
      await navigator.locks.request(`dao-${receiptKey}`, { ifAvailable: true }, async (lock) => {
        if (!lock) throw new Error('A founder mint is already being processed in another tab.');
        // A saved signed hash prevents blind re-minting after a timeout/reload.
        const saved = localStorage.getItem(receiptKey);
        if (saved) {
          await confirmCreationTransaction(saved, config.rpcUrl);
          setReceipt(saved);
          setMessage('Saved founder mint confirmed. Review the updated supply before starting another allocation.');
          await token.mutate();
          return;
        }
        if (recoverOnly) {
          setMessage('No saved founder mint transaction for this wallet and DAO.');
          return;
        }
        if (!review) throw new Error('Review the founder allocation before signing.');
        const values = founderMintValues(rows);
        const current = await token.mutate();
        if (!current || current.live || current.owner !== session.address)
          throw new Error('Setup ownership changed. Refresh before minting.');
        const client = new TokenClient({
          ...adminReadOptions(config, config.tokenContractId, session.address),
          signTransaction: async (xdr, opts) => {
            const checkWallet = () => {
              const wallet = useAuthSessionStore.getState();
              if (
                wallet.address !== session.address ||
                wallet.authStatus !== 'authenticated' ||
                wallet.walletNetworkIssue ||
                (wallet.walletNetworkPassphrase && wallet.walletNetworkPassphrase !== config.passphrase)
              )
                throw new Error('Wallet changed. Reconnect the setup owner on the DAO network.');
            };
            checkWallet();
            const signed = await StellarWalletsKit.signTransaction(xdr, {
              ...opts,
              address: session.address!,
              networkPassphrase: config.passphrase
            });
            checkWallet();
            const hash = Array.from(TransactionBuilder.fromXDR(signed.signedTxXdr, config.passphrase).hash(), (byte) =>
              byte.toString(16).padStart(2, '0')
            ).join('');
            localStorage.setItem(receiptKey, hash);
            if (localStorage.getItem(receiptKey) !== hash)
              throw new Error('Could not save the mint recovery hash. Transaction not submitted.');
            return signed;
          }
        });
        tx.start('Mint founder allocation');
        const assembled = await client.batch_mint({
          minter: session.address,
          recipients: values.recipients,
          amounts: values.amounts
        });
        const sent = await assembled.signAndSend();
        const expectedHash = localStorage.getItem(receiptKey);
        const hash = sent.sendTransactionResponse?.hash || expectedHash;
        if (!hash || hash !== expectedHash)
          throw new Error(
            'Mint transaction hash could not be verified. Check the saved transaction before trying again.'
          );
        tx.submitted('Founder allocation submitted', hash);
        await confirmCreationTransaction(hash, config.rpcUrl);
        tx.success('Founder tokens minted', hash);
        setReceipt(hash);
        setReview(false);
        await token.mutate();
      });
    } catch (error) {
      if (error instanceof DefinitiveTransactionFailure) localStorage.removeItem(receiptKey);
      tx.fail(error, 'Founder mint needs attention', 'token');
      setMessage(error instanceof Error ? error.message : 'Mint failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageSection
      title="Founder allocation"
      description="Mint the setup allocation as recipient and amount vectors in one Token batch_mint transaction."
    >
      <Stack gap="4">
        <AdminSectionNav daoId={daoId} active="/founders" />
        {token.isLoading ? <Text role="status">Checking setup ownership and supply…</Text> : null}
        {token.error ? (
          <Callout variant="error" title="Token state unavailable" description={token.error.message} />
        ) : null}
        <Card p="5">
          <Stack gap="3">
            <Heading style={{ fontSize: '1.2rem' }}>Founder tokens</Heading>
            <Text>
              Current total supply: {token.data?.supply.toString() ?? 'Unavailable'}. Founder mints are ordinary voting
              NFTs, not a vesting schedule or ongoing founder reward.
            </Text>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void Promise.all([token.mutate(), artwork.mutate()])}
            >
              Refresh setup state
            </Button>
            {token.data?.live ? (
              <>
                <Callout
                  variant="info"
                  title="Setup is complete"
                  description="After launch, mint additional tokens through the current mint authority or a Treasury governance proposal."
                />
                <Link href={`/dao/${daoId}/admin/token`}>Open Token Admin</Link>
              </>
            ) : (
              <>
                {!allowed ? (
                  <Callout
                    variant="info"
                    title="Connect and authenticate the current setup owner"
                    description="Only the current Token owner can mint the setup founder allocation."
                  />
                ) : null}
                <Callout
                  variant="warning"
                  title="Configure artwork before minting"
                  description={
                    artwork.data?.properties.length
                      ? 'Artwork properties exist. Refresh and confirm all planned batches are finished before minting.'
                      : 'No artwork properties are confirmed, or the artwork read is unavailable. Tokens minted now will not receive artwork seeds from this setup.'
                  }
                />
                <Link href={`/dao/${daoId}/admin/artwork`}>Review artwork setup</Link>
                {rows.map((row, index) => (
                  <Stack gap="2" key={index}>
                    <label htmlFor={`founder-${index}`}>
                      Founder {index + 1} account
                      <Input
                        id={`founder-${index}`}
                        name={`founder-${index}`}
                        autoComplete="off"
                        spellCheck={false}
                        value={row.recipient}
                        disabled={busy || review || !allowed}
                        onChange={(event) =>
                          setRows((current) =>
                            current.map((item, id) =>
                              id === index ? { ...item, recipient: event.target.value } : item
                            )
                          )
                        }
                      />
                    </label>
                    <label htmlFor={`founder-amount-${index}`}>
                      Token amount
                      <Input
                        id={`founder-amount-${index}`}
                        name={`founder-amount-${index}`}
                        autoComplete="off"
                        type="number"
                        min={1}
                        max={20}
                        step={1}
                        value={row.amount}
                        disabled={busy || review || !allowed}
                        onChange={(event) =>
                          setRows((current) =>
                            current.map((item, id) => (id === index ? { ...item, amount: event.target.value } : item))
                          )
                        }
                      />
                    </label>
                    <Button
                      type="button"
                      variant="plain"
                      disabled={busy || review || !allowed || rows.length === 1}
                      onClick={() => setRows((current) => current.filter((_, id) => id !== index))}
                    >
                      Remove founder {index + 1}
                    </Button>
                  </Stack>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy || review || !allowed || rows.length >= 20}
                  onClick={() => setRows((current) => [...current, { recipient: '', amount: '1' }])}
                >
                  Add founder recipient
                </Button>
                {review ? (
                  <>
                    <Text style={{ overflowWrap: 'anywhere' }}>
                      Review: {rows.map((row) => `${row.amount} to ${row.recipient}`).join('; ')}. Minting is not
                      reversible.
                    </Text>
                    <Button type="button" disabled={busy || !allowed || !networkReady} onClick={() => void mint()}>
                      {busy ? 'Checking mint…' : 'Sign founder allocation'}
                    </Button>
                    <Button type="button" variant="plain" disabled={busy} onClick={() => setReview(false)}>
                      Edit allocation
                    </Button>
                  </>
                ) : (
                  <Button
                    type="button"
                    disabled={busy || !allowed || !networkReady || Boolean(receipt)}
                    onClick={() => {
                      try {
                        founderMintValues(rows);
                        setReview(true);
                        setMessage('');
                      } catch (error) {
                        setMessage((error as Error).message);
                      }
                    }}
                  >
                    Review allocation
                  </Button>
                )}
                <Button type="button" variant="outline" disabled={busy || !allowed} onClick={() => void mint(true)}>
                  Check saved mint transaction
                </Button>
                {receipt ? (
                  <>
                    <Text style={{ overflowWrap: 'anywhere' }}>Confirmed founder mint: {receipt}</Text>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() => {
                        localStorage.removeItem(receiptKey);
                        setReceipt('');
                        setRows([{ recipient: '', amount: '1' }]);
                        setReview(false);
                      }}
                    >
                      Start a separate allocation
                    </Button>
                  </>
                ) : null}
              </>
            )}
            {message ? (
              <div role="status">
                <Callout variant="warning" title={message} />
              </div>
            ) : null}
          </Stack>
        </Card>
      </Stack>
    </PageSection>
  );
}
