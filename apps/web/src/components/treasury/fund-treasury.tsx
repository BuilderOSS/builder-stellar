'use client';

import { Asset } from '@stellar/stellar-sdk';
import { useRef, useState } from 'react';

import { getTreasuryAssets } from '@/lib/assets-config';
import { decimalToStroops, formatStroops } from '@/lib/auction-values';
import { getDeploymentConfig } from '@/lib/deployment-config';
import { getExplorerTxUrl } from '@/lib/explorer-links';
import {
  assertMarketplaceTransaction,
  assertMarketplaceWallet,
  assertUnchangedMarketplaceEnvelope
} from '@/lib/marketplace/transaction';
import { waitForConfirmation } from '@/lib/transaction-confirmation';
import { treasuryFetch, useTreasuryFundingReadiness } from '@/lib/treasury-service/hooks';
import type { TreasuryPrepared, TreasuryScope } from '@/lib/treasury-service/types';
import { assertTreasuryIdentity, fundingSchema } from '@/lib/treasury-service/values';
import { useAuthSessionStore } from '@/stores/auth-session-store';

import styles from './treasury.module.css';

export function FundTreasury({ scope, onConfirmed }: { scope: TreasuryScope; onConfirmed: () => void }) {
  const session = useAuthSessionStore();
  const network = getDeploymentConfig();
  const [code, setCode] = useState('XLM');
  const [amount, setAmount] = useState('');
  const [prepared, setPrepared] = useState<TreasuryPrepared | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Check your balance, review the destination and fee, then explicitly sign.');
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
      const signed = await StellarWalletsKit.signTransaction(terms.xdr, {
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
    <section className={`${styles.panel} ${styles.stack}`} aria-labelledby="fund-treasury-title">
      <div>
        <p className={styles.label}>Contribute</p>
        <h2 id="fund-treasury-title">Fund treasury</h2>
      </div>
      <p className={styles.muted}>
        Transfer supported SAC assets from your wallet. This is a contribution, not a deposit you can withdraw directly.
        No treasury trustline is needed for its contract address.
      </p>
      <p className={styles.label}>{network.label}</p>
      {!allowed ? (
        <p role="status">
          {session.walletNetworkIssue || 'Connect and authenticate using the wallet control to contribute.'}
        </p>
      ) : null}
      <div className={styles.fields}>
        <label>
          Asset
          <select
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
          </select>
        </label>
        <label>
          Amount
          <input
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.0000000"
            maxLength={60}
            value={amount}
            disabled={busy || Boolean(hash)}
            onChange={(event) => {
              setAmount(event.target.value);
              changed();
            }}
          />
        </label>
      </div>
      {readiness.isLoading ? <p role="status">Verifying wallet balance…</p> : null}
      {readiness.error ? (
        <p className={styles.error} role="alert">
          Wallet readiness unavailable: {readiness.error.message}
        </p>
      ) : null}
      {readiness.data && !readiness.error ? (
        <div className={`${styles.notice} ${styles.stack}`}>
          <p className={styles.muted}>
            Wallet balance: {formatStroops(readiness.data.account.balance)} {code}
          </p>
          <p>
            Spendable:{' '}
            <strong>
              {formatStroops(readiness.data.account.available)} {code}
            </strong>
          </p>
          <p className={styles.muted}>
            XLM above reserve and selling liabilities: {formatStroops(readiness.data.account.nativeAvailable)} XLM
          </p>
          <p className={styles.muted}>
            {code === 'XLM'
              ? 'Native XLM needs no trustline.'
              : readiness.data.account.trustline
                ? readiness.data.account.authorized
                  ? 'Your USDC trustline is authorized.'
                  : 'Your USDC trustline is not authorized by the issuer.'
                : 'Add a USDC trustline in your wallet, then refresh.'}
          </p>
          <button
            type="button"
            disabled={busy || readiness.isValidating}
            onClick={() => void readiness.mutate().catch(() => {})}
          >
            Refresh wallet readiness
          </button>
        </div>
      ) : null}
      <p role="status" aria-live="polite">
        {message}
      </p>
      {prepared ? (
        <div className={`${styles.notice} ${styles.stack}`}>
          <h3>Review contribution</h3>
          <p>
            Send{' '}
            <strong>
              {prepared.amount} {prepared.assetCode}
            </strong>{' '}
            on {network.label}
          </p>
          <p>
            Maximum prepared network fee: <strong>{formatStroops(prepared.fee)} XLM</strong>
          </p>
          <p className={styles.address}>From: {prepared.address}</p>
          <p className={styles.address}>Treasury: {prepared.treasuryContractId}</p>
          <p className={styles.address}>Asset SAC: {prepared.assetContractId}</p>
          <p className={styles.muted}>The wallet must sign these exact terms. Review expires after three minutes.</p>
        </div>
      ) : (
        <p className={styles.address}>Destination treasury: {scope.treasuryContractId}</p>
      )}
      {hash ? (
        <div className={`${styles.notice} ${styles.stack}`}>
          <p className={styles.address}>Transaction: {hash}</p>
          {network.name !== 'local' ? (
            <a href={getExplorerTxUrl(network.name, hash)} target="_blank" rel="noreferrer">
              View transaction ↗
            </a>
          ) : null}
          {!confirmed ? (
            <button
              type="button"
              disabled={busy}
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
              Check confirmation (no new transfer)
            </button>
          ) : (
            <p>Contribution confirmed.</p>
          )}
        </div>
      ) : (
        <div className={styles.row}>
          <button
            type="button"
            className={styles.primary}
            disabled={!allowed || busy || !scope.treasuryContractId}
            onClick={prepared ? sign : prepare}
          >
            {busy ? 'Please wait…' : prepared ? 'Sign and submit contribution' : 'Check balances and simulate'}
          </button>
          {prepared ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setPrepared(null);
                setMessage('Review cancelled. Nothing was signed.');
              }}
            >
              Cancel review
            </button>
          ) : null}
        </div>
      )}
    </section>
  );
}
