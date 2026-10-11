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
    if (!isValidSlug(slug)) return setMessage('Use 4-63 lowercase letters, numbers or single hyphens.');
    if (slug === currentSlug) return setMessage('This is your link now.');
    setBusy(true);
    setMessage('');
    try {
      const status = await fetch(`/api/slugs/${slug}`, { cache: 'no-store' }).then((response) => response.json());
      if (status?.claimedBy) throw new Error(`/dao/${slug} is taken by another community.`);
      const manager = new ManagerClient({
        contractId: getDeploymentConfig().managerAddress,
        rpcUrl: config.rpcUrl,
        networkPassphrase: config.passphrase,
        publicKey: address,
        allowHttp: config.rpcUrl.startsWith('http://'),
        signTransaction: (xdr, opts) => signWithWallet(xdr, { ...opts, address, networkPassphrase: config.passphrase })
      });
      tx.start('Change the link');
      const assembled = await manager.update_pending_slug({ token_address: daoId, slug });
      assembled.result.unwrap();
      const sent = await assembled.signAndSend();
      const hash = sent.sendTransactionResponse?.hash ?? '';
      await waitForConfirmation(hash, config.rpcUrl);
      tx.success(`Your link is now /dao/${slug}`, hash);
      setSlug('');
      onRenamed();
    } catch (error) {
      tx.fail(error, 'Link change needs attention', 'manager');
      setMessage(error instanceof Error ? error.message : 'Rename failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Callout variant="warning" title={`Another community took /dao/${currentSlug}`}>
      <p>
        It launched first with this link, so your launch would fail. Pick another link, then launch. It becomes yours
        when you launch.
      </p>
      <label htmlFor="rename-slug">
        New link
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
        {busy ? 'Changing…' : 'Change the link'}
      </Button>
      {message ? <p role="alert">{message}</p> : null}
    </Callout>
  );
}
