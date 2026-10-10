'use client';

import { Asset } from '@stellar/stellar-sdk';
import { useRef, useState } from 'react';
import { css } from 'styled-system/css';

import { Address, Amount, AmountInput, Button, Callout, Disclosure, Field, FieldLabel, Select } from '@/components/ui';
import { card, fact, facts, fields, muted, review, reviewTitle, title } from '@/components/ui/panel-styles';
import { getTreasuryAssets } from '@/lib/assets-config';
import { decimalToStroops, formatStroops } from '@/lib/auction-values';
import { getDeploymentConfig } from '@/lib/deployment-config';
import {
  assertMarketplaceTransaction,
  assertMarketplaceWallet,
  assertUnchangedMarketplaceEnvelope
} from '@/lib/marketplace/transaction';
import { waitForConfirmation } from '@/lib/transaction-confirmation';
import { treasuryFetch, useTreasuryFundingReadiness } from '@/lib/treasury-service/hooks';
import type { TreasuryPrepared, TreasuryScope } from '@/lib/treasury-service/types';
import { assertTreasuryIdentity, fundingSchema } from '@/lib/treasury-service/values';
import { signWithWallet } from '@/lib/wallet-sign';
import { useAuthSessionStore } from '@/stores/auth-session-store';

const buttons = css({ display: 'flex', gap: '2' });

export function FundTreasury({ scope, onConfirmed }: { scope: TreasuryScope; onConfirmed: () => void }) {
  const session = useAuthSessionStore();
  const network = getDeploymentConfig();
  const [code, setCode] = useState('XLM');
  const [amount, setAmount] = useState('');
  const [prepared, setPrepared] = useState<TreasuryPrepared | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Enter an amount and check it. Nothing is sent until you sign.');
  const [hash, setHash] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const inFlight = useRef(false);
  const readiness = useTreasuryFundingReadiness(scope, code);
  const allowed = session.authStatus === 'authenticated' && Boolean(session.address) && !session.walletNetworkIssue;
  const supported = getTreasuryAssets(network.name).filter((asset) => ['XLM', 'USDC'].includes(asset.code));
  function changed() {
    setPrepared(null);
    setMessage('Terms changed. Check balances and simulate again.');
  }

  async function prepare() {
    if (inFlight.current || !allowed || hash) return;
    inFlight.current = true;
    setBusy(true);
    setPrepared(null);
    setMessage('Checking balances, reserve, trustline and simulated network fee…');
    try {
      const input = fundingSchema.parse({ assetCode: code, amount });
      const result = await treasuryFetch<TreasuryPrepared>(
        `/api/dao/${encodeURIComponent(scope.daoId)}/treasury/prepare`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input)
        }
      );
      assertTreasuryIdentity(result, scope);
      const asset = supported.find((asset) => asset.code === code);
      const assetId = asset?.isNative ? Asset.native().contractId(network.networkPassphrase) : asset?.contractId;
      if (
        result.address !== useAuthSessionStore.getState().address ||
        result.address !== session.address ||
        result.network !== network.name ||
        result.networkPassphrase !== network.networkPassphrase ||
        result.rpcUrl !== network.rpcUrl ||
        result.assetCode !== code ||
        result.assetContractId !== assetId ||
        decimalToStroops(result.amount) !== decimalToStroops(amount)
      )
        throw new Error('Prepared funding terms do not match this wallet and network.');
      setPrepared(result);
      setMessage('Simulation passed. Review the exact transfer below. Nothing has been signed.');
    } catch (error) {
      setMessage(
        error instanceof Error && error.name !== 'ZodError'
          ? error.message
          : 'Enter a positive decimal amount with at most seven decimal places.'
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function checkConfirmation(txHash: string) {
    setMessage('Waiting for on-chain confirmation. Do not submit another transfer.');
    await waitForConfirmation(txHash, network.rpcUrl);
    setConfirmed(true);
    setMessage('Confirmed on-chain. Your contribution is held by the treasury and governed by proposals.');
    // A read failure cannot undo a confirmed transfer.
    void readiness.mutate().catch(() => {});
    onConfirmed();
  }

  async function sign() {
    if (inFlight.current || !allowed || !prepared || hash) return;
    const terms = prepared;
    inFlight.current = true;
    setBusy(true);
    try {
      const [{ StellarWalletsKit }, { TransactionBuilder, rpc }] = await Promise.all([
        import('@creit.tech/stellar-wallets-kit/sdk'),
        import('@stellar/stellar-sdk')
      ]);
      const [wallet, walletNetwork] = await Promise.all([
        StellarWalletsKit.getAddress(),
        StellarWalletsKit.getNetwork()
      ]);
      const current = useAuthSessionStore.getState();
      if (current.authStatus !== 'authenticated' || current.address !== terms.address || current.walletNetworkIssue)
        throw new Error('Wallet session changed. Authenticate again before signing.');
      assertMarketplaceWallet(
        wallet.address,
        walletNetwork.networkPassphrase,
        terms.address,
        terms.networkPassphrase,
        network.label
      );
      const unsigned = TransactionBuilder.fromXDR(terms.xdr, terms.networkPassphrase);
      assertMarketplaceTransaction(unsigned, terms.address);
      setMessage('Waiting for your wallet signature…');
      const signed = await signWithWallet(terms.xdr, {
        address: terms.address,
        networkPassphrase: terms.networkPassphrase
      });
      if (signed.signerAddress && signed.signerAddress !== terms.address)
        throw new Error('Wallet signed with a different account.');
      const tx = TransactionBuilder.fromXDR(signed.signedTxXdr, terms.networkPassphrase);
      const txHash = assertUnchangedMarketplaceEnvelope(unsigned, tx);
      const afterSigning = useAuthSessionStore.getState();
      if (
        afterSigning.authStatus !== 'authenticated' ||
        afterSigning.address !== terms.address ||
        afterSigning.walletNetworkIssue
      )
        throw new Error('Wallet session changed during signing. Nothing was submitted.');
      // Check expiry again after the wallet prompt. Never rebuild or auto-sign new terms.
      assertMarketplaceTransaction(tx, terms.address);
      setHash(txHash);
      setPrepared(null);
      setMessage('Submitting your signed treasury contribution…');
      const response = await new rpc.Server(network.rpcUrl, { allowHttp: network.name === 'local' }).sendTransaction(
        tx
      );
      if (response.status === 'ERROR' || response.status === 'TRY_AGAIN_LATER')
        throw new Error('The network did not accept this transfer. Check the transaction hash before trying again.');
      await checkConfirmation(txHash);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? `${error.message} Nothing else will be signed automatically.`
          : 'Funding failed. Check your transaction before retrying.'
      );
      setPrepared(null);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <section className={card} aria-labelledby="fund-treasury-title">
      <div>
        <h2 id="fund-treasury-title" className={title}>
          Add funds
        </h2>
        <p className={muted}>
          Send XLM or USDC from your wallet to the treasury. It becomes the community&apos;s, spent only by vote.
        </p>
      </div>
      {!allowed ? (
        <p className={muted} role="status">
          {session.walletNetworkIssue || 'Connect your wallet to add funds.'}
        </p>
      ) : null}
      <div className={fields}>
        <Field>
          <FieldLabel htmlFor="fund-asset">Asset</FieldLabel>
          <Select
            id="fund-asset"
            value={code}
            disabled={busy || Boolean(hash)}
            onChange={(event) => {
              setCode(event.target.value);
              changed();
            }}
          >
            {supported.map((asset) => (
              <option key={asset.code}>{asset.code}</option>
            ))}
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="fund-amount">Amount</FieldLabel>
          <AmountInput
            id="fund-amount"
            unit={code}
            placeholder="0.00"
            maxLength={60}
            value={amount}
            disabled={busy || Boolean(hash)}
            onChange={(event) => {
              setAmount(event.target.value);
              changed();
            }}
          />
        </Field>
      </div>
      {readiness.isLoading ? (
        <p className={muted} role="status">
          Checking your wallet balance…
        </p>
      ) : null}
      {readiness.error ? (
        <Callout variant="error" title="We couldn't check your wallet" description={readiness.error.message} />
      ) : null}
      {readiness.data && !readiness.error ? (
        <div className={facts}>
          <div className={fact}>
            <span className={muted}>You can send</span>
            <Amount value={formatStroops(readiness.data.account.available)} unit={code} />
          </div>
          <div className={fact}>
            <span className={muted}>In your wallet</span>
            <Amount value={formatStroops(readiness.data.account.balance)} unit={code} />
          </div>
          <div className={fact}>
            <span className={muted}>XLM free for fees</span>
            <Amount value={formatStroops(readiness.data.account.nativeAvailable)} unit="XLM" />
          </div>
          <p className={muted}>
            {code === 'XLM'
              ? 'XLM needs no trustline.'
              : readiness.data.account.trustline
                ? readiness.data.account.authorized
                  ? 'Your USDC trustline is ready.'
                  : "Your USDC trustline isn't authorized by the issuer yet."
                : 'Add a USDC trustline in your wallet, then refresh.'}
          </p>
          <div>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy || readiness.isValidating}
              onClick={() => void readiness.mutate().catch(() => {})}
            >
              Refresh balance
            </Button>
          </div>
        </div>
      ) : null}
      <p className={muted} role="status" aria-live="polite">
        {message}
      </p>
      {prepared ? (
        <div className={review}>
          <h3 className={reviewTitle}>
            Send {prepared.amount} {prepared.assetCode} to the treasury
          </h3>
          <div className={fact}>
            <span className={muted}>Network fee, at most</span>
            <Amount value={formatStroops(prepared.fee)} unit="XLM" />
          </div>
          <Disclosure title="Technical details">
            <Address value={prepared.address} label="From" />
            <Address value={prepared.treasuryContractId} label="Treasury" />
            <Address value={prepared.assetContractId} label="Asset contract" />
          </Disclosure>
          <p className={muted}>Your wallet must sign exactly this. The review expires after three minutes.</p>
        </div>
      ) : null}
      {hash ? (
        <div className={review}>
          <Address value={hash} label="Transaction" />
          {!confirmed ? (
            <Button
              variant="secondary"
              loading={busy}
              onClick={async () => {
                if (inFlight.current) return;
                inFlight.current = true;
                setBusy(true);
                try {
                  await checkConfirmation(hash);
                } catch (error) {
                  setMessage(
                    error instanceof Error ? error.message : 'Confirmation unavailable. Check the hash before retrying.'
                  );
                } finally {
                  inFlight.current = false;
                  setBusy(false);
                }
              }}
            >
              Check confirmation (sends nothing new)
            </Button>
          ) : (
            <Callout variant="success" title="Thank you. Your contribution is in the treasury." />
          )}
        </div>
      ) : (
        <div className={buttons}>
          <Button
            block
            disabled={!allowed || !scope.treasuryContractId}
            loading={busy}
            onClick={prepared ? sign : prepare}
          >
            {busy ? 'One moment' : prepared ? 'Sign and send' : 'Check amount'}
          </Button>
          {prepared ? (
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setPrepared(null);
                setMessage('Review cancelled. Nothing was signed.');
              }}
            >
              Cancel
            </Button>
          ) : null}
        </div>
      )}
    </section>
  );
}
