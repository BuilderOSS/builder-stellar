'use client';
import { Client as MetadataClient } from '@builder-stellar/metadata-bindings';
import { TransactionBuilder } from '@stellar/stellar-sdk';
import { useEffect, useMemo, useState } from 'react';

import { Button, Callout } from '@/components/ui';
import type { DaoNetworkConfig } from '@/lib/dao-config';
import { getDeploymentConfig } from '@/lib/deployment-config';
import { STARTER_COLLECTIONS } from '@/lib/starter-collections';
import { useTransactionFeedback } from '@/lib/transaction-feedback';
import { confirmCreationTransaction, DefinitiveTransactionFailure } from '@/lib/use-dao-deployment';
import { signWithWallet } from '@/lib/wallet-sign';
import { useAuthSessionStore } from '@/stores/auth-session-store';
import { assertArtworkSaved, useLocalArtworkStore } from '@/stores/local-artwork-store';
import { preferenceScopeKey } from '@/stores/local-preferences-store';

import { artworkBatches, type ArtworkPlan } from './artwork-configuration';
import { ArtworkDirectoryUpload } from './ArtworkDirectoryUpload';
import { ArtworkPreviewCanvas } from './ArtworkPreviewCanvas';
import styles from './workspace-styles';

export function ArtworkSetup({ daoId, config }: { daoId: string; config: DaoNetworkConfig }) {
  const session = useAuthSessionStore();
  const [hydrated, setHydrated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const plans = useLocalArtworkStore((s) => s.plans);
  const key = `${preferenceScopeKey({ network: config.name, deployment: getDeploymentConfig().managerAddress, wallet: session.address || null })}:${daoId}`;
  const plan = plans[key];
  const batches = useMemo(() => (plan ? artworkBatches(plan.properties) : []), [plan]);
  const source = useMemo(
    () =>
      plan
        ? { kind: 'uploaded' as const, baseUri: plan.baseUri, extension: plan.extension, properties: plan.properties }
        : null,
    [plan]
  );
  const tx = useTransactionFeedback(config.name);
  const auth = session.address === config.launchAdmin && session.authStatus === 'authenticated';
  const started = Boolean(plan?.hash || plan?.confirmedBatches);
  useEffect(() => {
    void Promise.resolve(useLocalArtworkStore.persist.rehydrate()).then(() => setHydrated(true));
  }, []);
  const save = (next: ArtworkPlan) => {
    useLocalArtworkStore.getState().setPlan(key, next);
    assertArtworkSaved();
  };
  const choose = (next: ArtworkPlan) => {
    try {
      save(next);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const submit = async () => {
    if (!auth || busy || !plan) return;
    if (!navigator.locks) {
      setError('Use a browser with Web Locks support to keep artwork recovery safe across tabs.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await navigator.locks.request(`dao-artwork:${key}`, { ifAvailable: true }, async (lock) => {
        if (!lock) throw new Error('Artwork is being configured in another tab');
        await useLocalArtworkStore.persist.rehydrate();
        let current = useLocalArtworkStore.getState().plans[key];
        const checkWallet = () => {
          const wallet = useAuthSessionStore.getState();
          if (
            wallet.address !== config.launchAdmin ||
            wallet.authStatus !== 'authenticated' ||
            wallet.walletNetworkIssue ||
            (wallet.walletNetworkPassphrase && wallet.walletNetworkPassphrase !== config.passphrase)
          )
            throw new Error('Connect the launch admin wallet on the DAO network');
        };
        checkWallet();
        const complete = () => {
          save({ ...current, confirmedBatches: current.confirmedBatches + 1, hash: undefined, status: 'confirmed' });
        };
        if (current.hash && current.status !== 'failed') {
          await confirmCreationTransaction(current.hash, config.rpcUrl);
          tx.success('Artwork batch confirmed', current.hash);
          complete();
          return;
        }
        const client = new MetadataClient({
          contractId: config.metadataContractId,
          rpcUrl: config.rpcUrl,
          networkPassphrase: config.passphrase,
          publicKey: session.address,
          allowHttp: config.rpcUrl.startsWith('http://'),
          signTransaction: async (xdr, opts) => {
            checkWallet();
            assertArtworkSaved();
            const signed = await signWithWallet(xdr, {
              ...opts,
              address: session.address,
              networkPassphrase: config.passphrase
            });
            checkWallet();
            const hash = Array.from(TransactionBuilder.fromXDR(signed.signedTxXdr, config.passphrase).hash(), (b) =>
              b.toString(16).padStart(2, '0')
            ).join('');
            current = { ...current, hash, status: 'submitted' };
            save(current);
            return signed;
          }
        });
        const count = (await client.properties_count()).result;
        if (!current.confirmedBatches && count)
          throw new Error(
            'This metadata contract already has artwork. This Setup panel installs new collections; editing existing artwork is not supported here.'
          );
        if (current.confirmedBatches && count !== current.properties.length)
          throw new Error('On-chain layer count changed. Review artwork before continuing.');
        if (current.confirmedBatches) {
          const expectedItems = artworkBatches(current.properties)
            .slice(0, current.confirmedBatches)
            .flatMap((batch) => batch.items);
          const properties = await Promise.all(
            current.properties.map((_, property_id) => client.get_property({ property_id }))
          );
          if (
            properties.some(
              (property, id) =>
                property.result?.name !== current.properties[id].name ||
                property.result.items.length !== expectedItems.filter((item) => item.property_id === id).length
            )
          )
            throw new Error(
              'On-chain artwork changed since the last confirmed batch. Review it before appending items.'
            );
        }
        const batch = artworkBatches(current.properties)[current.confirmedBatches];
        if (!batch) return;
        save(current); // Persist the exact plan before wallet signing.
        const assembled = await client.add_properties({
          ...batch,
          ipfs_group: { base_uri: current.baseUri, extension: current.extension }
        });
        assembled.result.unwrap();
        tx.start('Add artwork batch');
        const sent = await assembled.signAndSend();
        const hash = sent.sendTransactionResponse?.hash ?? current.hash;
        if (!hash || hash !== current.hash) throw new Error('Artwork transaction hash could not be verified');
        tx.submitted('Artwork submitted', hash);
        await confirmCreationTransaction(hash, config.rpcUrl);
        tx.success('Artwork batch confirmed', hash);
        complete();
      });
    } catch (e) {
      const current = useLocalArtworkStore.getState().plans[key];
      if (current && e instanceof DefinitiveTransactionFailure) save({ ...current, status: 'failed' });
      setError(e instanceof Error ? e.message : 'Artwork setup failed');
      tx.fail(e, 'Artwork setup needs attention', 'metadata');
    } finally {
      setBusy(false);
    }
  };
  if (!hydrated) return <p role="status">Loading the local artwork plan…</p>;
  return (
    <div className={styles.stack} id="artwork-setup">
      <p className={styles.muted}>
        Configure artwork before minting founders to seed their attributes. Directory upload, preview, and layer order
        are local planning until you sign each batch.
      </p>
      <div className={styles.links}>
        {STARTER_COLLECTIONS.map((collection) => (
          <Button
            key={collection.id}
            type="button"
            variant="secondary"
            disabled={started || busy}
            onClick={() =>
              choose({
                baseUri: collection.baseUri,
                extension: collection.extension,
                properties: structuredClone(collection.properties),
                confirmedBatches: 0
              })
            }
          >
            Use {collection.name} ({collection.license})
          </Button>
        ))}
      </div>
      <ArtworkDirectoryUpload disabled={started || busy} onComplete={choose} />
      {plan && source ? (
        <>
          <div className={styles.columns}>
            <ol>
              {plan.properties.map((property, index) => (
                <li key={property.name}>
                  {property.name} · {property.items.length} items
                  <div className={styles.links}>
                    <Button
                      size="sm"
                      type="button"
                      variant="ghost"
                      disabled={started || busy || !index}
                      aria-label={`Move ${property.name} earlier`}
                      onClick={() => {
                        const properties = [...plan.properties];
                        [properties[index - 1], properties[index]] = [properties[index], properties[index - 1]];
                        choose({ ...plan, properties });
                      }}
                    >
                      Move up
                    </Button>
                    <Button
                      size="sm"
                      type="button"
                      variant="ghost"
                      disabled={started || busy || index === plan.properties.length - 1}
                      aria-label={`Move ${property.name} later`}
                      onClick={() => {
                        const properties = [...plan.properties];
                        [properties[index + 1], properties[index]] = [properties[index], properties[index + 1]];
                        choose({ ...plan, properties });
                      }}
                    >
                      Move down
                    </Button>
                  </div>
                </li>
              ))}
            </ol>
            <ArtworkPreviewCanvas source={source} orderedLayers={plan.properties} />
          </div>
          <p className={styles.muted}>
            {plan.confirmedBatches} of {batches.length} signed artwork batches confirmed · 30 items per transaction
            maximum
          </p>
          {plan.hash ? <p className={styles.code}>Saved transaction: {plan.hash}</p> : null}
          {plan.confirmedBatches < batches.length ? (
            <Button
              type="button"
              disabled={busy || !auth || Boolean(session.walletNetworkIssue)}
              onClick={() => void submit()}
            >
              {busy
                ? 'Checking artwork…'
                : plan.hash && plan.status !== 'failed'
                  ? 'Check saved artwork transaction'
                  : `Sign artwork batch ${plan.confirmedBatches + 1}`}
            </Button>
          ) : (
            <p role="status">All planned artwork batches are confirmed.</p>
          )}
        </>
      ) : null}
      {error ? <Callout variant="error" title="Artwork setup needs attention" description={error} /> : null}
    </div>
  );
}
