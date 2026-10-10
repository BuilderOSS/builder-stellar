'use client';
import { Client as ManagerClient } from '@builder-stellar/manager-bindings';
import { useState } from 'react';

import { Button, Callout, Input } from '@/components/ui';
import { isValidSlug } from '@/lib/create-dao-schema';
import type { DaoNetworkConfig } from '@/lib/dao-config';
import { getDeploymentConfig } from '@/lib/deployment-config';
import { waitForConfirmation } from '@/lib/transaction-confirmation';
import { useTransactionFeedback } from '@/lib/transaction-feedback';
import { signWithWallet } from '@/lib/wallet-sign';

/**
 * Another DAO launched first with this DAO's requested slug (SlugTaken, 7123).
 * The launch admin renames the pending request with
 * manager.update_pending_slug(token, slug), then retries launch.
 */
export function SlugRename({
  daoId,
  config,
  address,
  currentSlug,
  onRenamed
}: {
  daoId: string;
  config: DaoNetworkConfig;
  address: string | null;
  currentSlug: string;
  onRenamed: () => void;
}) {
  const tx = useTransactionFeedback(config.name);
  const [slug, setSlug] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function rename() {
    if (!address || busy) return;
    if (!isValidSlug(slug)) return setMessage('Use 4-63 characters of a-z, 0-9 and single hyphens.');
    if (slug === currentSlug) return setMessage('Choose a different slug.');
    setBusy(true);
    setMessage('');
    try {
      const status = await fetch(`/api/slugs/${slug}`, { cache: 'no-store' }).then((response) => response.json());
      if (status?.claimedBy) throw new Error(`“${slug}” is already claimed by a launched DAO.`);
      const manager = new ManagerClient({
        contractId: getDeploymentConfig().managerAddress,
        rpcUrl: config.rpcUrl,
        networkPassphrase: config.passphrase,
        publicKey: address,
        allowHttp: config.rpcUrl.startsWith('http://'),
        signTransaction: (xdr, opts) => signWithWallet(xdr, { ...opts, address, networkPassphrase: config.passphrase })
      });
      tx.start('Rename requested slug');
      const assembled = await manager.update_pending_slug({ token_address: daoId, slug });
      assembled.result.unwrap();
      const sent = await assembled.signAndSend();
      const hash = sent.sendTransactionResponse?.hash ?? '';
      await waitForConfirmation(hash, config.rpcUrl);
      tx.success(`Requested slug changed to “${slug}”`, hash);
      setSlug('');
      onRenamed();
    } catch (error) {
      tx.fail(error, 'Slug rename needs attention', 'manager');
      setMessage(error instanceof Error ? error.message : 'Rename failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Callout variant="warning" title={`“${currentSlug}” was claimed by another DAO`}>
      <p>
        Another DAO launched first with this slug, so launch would fail. Request a different slug, then launch. The new
        slug is claimed only when this DAO launches.
      </p>
      <label htmlFor="rename-slug">
        New slug
        <Input
          id="rename-slug"
          autoComplete="off"
          value={slug}
          maxLength={63}
          disabled={busy || !address}
          onChange={(event) => setSlug(event.target.value.toLowerCase())}
        />
      </label>
      <Button type="button" disabled={busy || !address || !slug} onClick={() => void rename()}>
        {busy ? 'Renaming…' : 'Rename requested slug'}
      </Button>
      {message ? <p role="alert">{message}</p> : null}
    </Callout>
  );
}
