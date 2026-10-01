'use client';

import { Client as AuctionClient } from '@builder-stellar/auction-bindings';
import { Client as TokenClient } from '@builder-stellar/token-bindings';
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import { useState } from 'react';
import { Stack } from 'styled-system/jsx';
import useSWR from 'swr';

import { AdminPaymentTokenForm, AdminReservePriceForm } from '@/components/admin/admin-action-forms';
import { AdminProposalDraftDialog } from '@/components/admin/admin-proposal-draft-dialog';
import { AdminSectionNav } from '@/components/admin/admin-section-nav';
import { type AuctionAutoPauseAction, AuctionAutoPauseDialog } from '@/components/admin/auction-auto-pause-dialog';
import {
  type EnableAuctionsErrors,
  EnableAuctionsForm,
  type EnableAuctionsValues
} from '@/components/admin/enable-auctions-form';
import { PageSection } from '@/components/page-section';
import { Badge, Button, Callout, Card, Heading, ShortId, Skeleton, Text } from '@/components/ui';
import { useDaoContext } from '@/contexts/dao-context';
import { treasuryIsOwner } from '@/lib/admin-proposals';
import { useContractOwner } from '@/lib/admin-queries';
import { getTreasuryAssets } from '@/lib/assets-config';
import { decimalToStroops, formatStroops, validateReservePrice } from '@/lib/auction-values';
import { useGoldskyMintAuthorities } from '@/lib/goldsky-queries';
import { getActionHandler } from '@/lib/proposal-actions/registry';
import { waitForConfirmation } from '@/lib/transaction-confirmation';
import { useTransactionFeedback } from '@/lib/transaction-feedback';
import { useAdminDraftStatus } from '@/lib/use-admin-draft-status';
import { useAdminProposalDraft } from '@/lib/use-admin-proposal-draft';
import { getStellarAddressError, isValidStellarAddress, validateDuration } from '@/lib/validation';
import { useAuthSessionStore } from '@/stores/auth-session-store';

type AuctionStatus = {
  status: 'not-launched' | 'paused' | 'active';
  paused: boolean;
  config: {
    duration: string | number;
    reserve_price: string;
    time_buffer: string | number;
    payment_token: string | null;
  };
};

const fetcher = async (url: string): Promise<AuctionStatus> => {
  const response = await fetch(url, { cache: 'no-store' });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || 'Auction status unavailable');
  return {
    status: payload.status || (payload.paused ? 'paused' : 'active'),
    paused: Boolean(payload.paused),
    config: payload.config
  };
};

function nonZeroValue(value: string | number | null | undefined) {
  if (value === null || typeof value === 'undefined' || value === '' || Number(value) <= 0) return '';
  return String(value);
}

function nonZeroReserve(value: string | null | undefined) {
  try {
    return value && BigInt(value) > 0n ? formatStroops(value) : '';
  } catch {
    return '';
  }
}

export default function AuctionAdminPage() {
  const { daoId, daoConfig: config } = useDaoContext();
  const session = useAuthSessionStore();
  const tx = useTransactionFeedback(config.name);
  const [busy, setBusy] = useState(false);
  const [formMessage, setFormMessage] = useState('');
  const [reservePrice, setReservePrice] = useState('');
  const [paymentToken, setPaymentToken] = useState('');
  const [enableValues, setEnableValues] = useState<EnableAuctionsValues>({
    duration: '',
    reservePrice: '',
    timeBuffer: '',
    paymentToken: ''
  });
  const [enableErrors, setEnableErrors] = useState<EnableAuctionsErrors>({});
  const [autoPauseDialogOpen, setAutoPauseDialogOpen] = useState(false);
  const [autoPauseAction, setAutoPauseAction] = useState<AuctionAutoPauseAction | null>(null);
  const proposalDraft = useAdminProposalDraft();
  const draftStatus = useAdminDraftStatus(daoId, [
    'set-mint-authority',
    'set-auction-duration',
    'set-auction-time-buffer',
    'set-auction-reserve-price',
    'set-auction-payment-token',
    'pause-auction',
    'unpause-auction'
  ]);
  const { data, error, mutate, isLoading } = useSWR<AuctionStatus>(
    `/api/dao/${encodeURIComponent(daoId)}/auctions`,
    fetcher
  );
  const { data: mintAuthorities, error: mintAuthorityError } = useGoldskyMintAuthorities(config.tokenContractId);
  const { data: auctionOwner } = useContractOwner(config, 'auction', session.address || undefined);
  const isOwner = Boolean(session.address && session.address === config.adminAddress);
  const canProposeAuction = Boolean(session.address && treasuryIsOwner(config, auctionOwner));
  const auctionCanMint = Boolean(
    mintAuthorities?.items.some((item) => item.authority === config.auctionContractId && item.enabled)
  );
  const auctionMintAuthorityQueued = draftStatus.actionsInDraft.some(
    (action) =>
      action.type === 'set-mint-authority' && action.authority === config.auctionContractId && action.enabled !== false
  );

  const populatedEnableValues: EnableAuctionsValues = {
    duration: enableValues.duration || nonZeroValue(data?.config.duration),
    reservePrice: enableValues.reservePrice || nonZeroReserve(data?.config.reserve_price),
    timeBuffer: enableValues.timeBuffer || nonZeroValue(data?.config.time_buffer),
    paymentToken: enableValues.paymentToken || data?.config.payment_token || ''
  };

  function validateEnableValues() {
    const nextErrors: EnableAuctionsErrors = {};
    const duration = Number(populatedEnableValues.duration);
    const timeBuffer = Number(populatedEnableValues.timeBuffer);
    const reservePrice = decimalToStroops(populatedEnableValues.reservePrice);

    const durationError = validateDuration(duration, 300);
    if (!populatedEnableValues.duration || durationError)
      nextErrors.duration = durationError || 'Auction duration is required.';

    const reserveError = validateReservePrice(populatedEnableValues.reservePrice);
    if (!populatedEnableValues.reservePrice || reserveError)
      nextErrors.reservePrice = reserveError || 'Reserve price is required.';

    const timeBufferError = validateDuration(timeBuffer, 60);
    if (!populatedEnableValues.timeBuffer || timeBufferError) {
      nextErrors.timeBuffer = timeBufferError || 'Time buffer is required.';
    }

    if (!populatedEnableValues.paymentToken) {
      nextErrors.paymentToken = 'Payment token is required.';
    } else if (!isValidStellarAddress(populatedEnableValues.paymentToken)) {
      nextErrors.paymentToken =
        getStellarAddressError(populatedEnableValues.paymentToken) || 'Invalid payment token address.';
    }

    setEnableErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0 || reservePrice === null) return null;
    return { duration, reservePrice, timeBuffer, paymentToken: populatedEnableValues.paymentToken.trim() };
  }

  function proposalContext() {
    return { config, session: { address: session.address, kit: StellarWalletsKit } };
  }

  function buildEnableProposalRequests(values: {
    duration: number;
    reservePrice: bigint;
    timeBuffer: number;
    paymentToken: string;
  }) {
    const context = proposalContext();
    const durationAction = getActionHandler('set-auction-duration').serialize(
      { value: String(values.duration) },
      context
    );
    const reserveAction = getActionHandler('set-auction-reserve-price').serialize(
      { reservePrice: formatStroops(values.reservePrice) },
      context
    );
    const timeBufferAction = getActionHandler('set-auction-time-buffer').serialize(
      { value: String(values.timeBuffer) },
      context
    );
    const paymentAction = getActionHandler('set-auction-payment-token').serialize(
      { paymentToken: values.paymentToken },
      context
    );
    const unpauseAction = getActionHandler('unpause-auction').serialize({}, context);
    const requests = [
      {
        daoId,
        action: durationAction,
        source: 'admin/auction/set-auction-duration',
        metadata: {
          title: 'Set auction duration',
          description: `Set each auction duration to ${values.duration} seconds.`,
          url: ''
        }
      },
      {
        daoId,
        action: reserveAction,
        source: 'admin/auction/set-auction-reserve-price',
        metadata: {
          title: 'Set auction reserve price',
          description: `Set the first auction reserve price to ${formatStroops(values.reservePrice)}.`,
          url: ''
        }
      },
      {
        daoId,
        action: timeBufferAction,
        source: 'admin/auction/set-auction-time-buffer',
        metadata: {
          title: 'Set auction time buffer',
          description: `Set the auction time buffer to ${values.timeBuffer} seconds.`,
          url: ''
        }
      },
      {
        daoId,
        action: paymentAction,
        source: 'admin/auction/set-auction-payment-token',
        metadata: {
          title: 'Set auction payment token',
          description: `Set the auction payment token to ${values.paymentToken}.`,
          url: ''
        }
      }
    ];

    if (!auctionCanMint && !auctionMintAuthorityQueued) {
      requests.push({
        daoId,
        action: getActionHandler('set-mint-authority').serialize(
          { authority: config.auctionContractId, enabled: true },
          context
        ),
        source: 'admin/auction/set-mint-authority',
        metadata: {
          title: 'Enable auction mint authority',
          description: `Allow ${config.auctionContractId} to mint auction tokens.`,
          url: ''
        }
      });
    }

    requests.push({
      daoId,
      action: unpauseAction,
      source: 'admin/auction/unpause-auction',
      metadata: {
        title: 'Enable auctions',
        description: 'Enable auction activity and create the first auction.',
        url: ''
      }
    });
    return requests;
  }

  async function handleEnableAuctions() {
    if (!session.address) return;
    const values = validateEnableValues();
    if (!values) return;

    if (!isOwner && canProposeAuction) {
      proposalDraft.requestAddBatch({
        daoId,
        requests: buildEnableProposalRequests(values),
        onAdded: () => setFormMessage('Auction setup and enable actions added to the proposal draft.')
      });
      return;
    }

    setBusy(true);
    setFormMessage('');
    tx.start('Configuring auctions...');
    try {
      const signTransaction = async (xdr: string, opts?: { networkPassphrase?: string; address?: string }) =>
        StellarWalletsKit.signTransaction(xdr, {
          networkPassphrase: opts?.networkPassphrase ?? config.passphrase,
          address: opts?.address ?? session.address
        });
      const auctionClient = new AuctionClient({
        contractId: config.auctionContractId,
        rpcUrl: config.rpcUrl,
        networkPassphrase: config.passphrase,
        publicKey: session.address,
        signTransaction
      });
      const submitAuctionUpdate = async (label: string, assembled: { signAndSend: () => Promise<any> }) => {
        const sent = await assembled.signAndSend();
        const hash = sent.sendTransactionResponse?.hash ?? '';
        tx.submitted(label, hash);
        await waitForConfirmation(hash, config.rpcUrl);
        return hash;
      };

      await submitAuctionUpdate(
        'Auction duration update submitted',
        await auctionClient.set_duration({ duration: BigInt(values.duration) })
      );
      await submitAuctionUpdate(
        'Auction reserve price update submitted',
        await auctionClient.set_reserve_price({ reserve_price: values.reservePrice })
      );
      await submitAuctionUpdate(
        'Auction time buffer update submitted',
        await auctionClient.set_time_buffer({ time_buffer: BigInt(values.timeBuffer) })
      );
      await submitAuctionUpdate(
        'Auction payment token update submitted',
        await auctionClient.set_payment_token({ payment_token: values.paymentToken })
      );

      if (!auctionCanMint) {
        const tokenClient = new TokenClient({
          contractId: config.tokenContractId,
          rpcUrl: config.rpcUrl,
          networkPassphrase: config.passphrase,
          publicKey: session.address,
          signTransaction
        });
        await submitAuctionUpdate(
          'Auction mint authority update submitted',
          await tokenClient.set_mint_authority({ authority: config.auctionContractId, enabled: true })
        );
      }

      const hash = await submitAuctionUpdate(
        'Auction enable submitted',
        await auctionClient.unpause({ caller: session.address })
      );
      tx.success('Auctions enabled', hash);
      await mutate();
      setEnableErrors({});
    } catch (enableError) {
      tx.fail(enableError, 'Auction enable failed');
    } finally {
      setBusy(false);
    }
  }

  async function updatePaused(nextPaused: boolean) {
    if (!session.address || (!isOwner && !canProposeAuction)) return;

    // Determine action type and messaging based on auction status
    const isLaunching = data?.status === 'not-launched' && !nextPaused;
    const isEnabling = config.auctionEnabled === false && !nextPaused;
    const actionType = nextPaused ? 'pause-auction' : 'unpause-auction';
    const actionTitle = isEnabling
      ? 'Enable auctions'
      : isLaunching
        ? 'Launch auctions'
        : nextPaused
          ? 'Pause auctions'
          : 'Resume auctions';
    const actionDescription = isEnabling
      ? 'Enable auction activity and create the first token.'
      : isLaunching
        ? 'Launch auctions and create the first token.'
        : nextPaused
          ? 'Pause auction activity.'
          : 'Resume auction activity.';

    if (!isOwner && canProposeAuction) {
      if (!nextPaused && !auctionCanMint && !auctionMintAuthorityQueued) {
        const mintAuthorityHandler = getActionHandler('set-mint-authority');
        const mintAuthorityAction = mintAuthorityHandler.serialize(
          { authority: config.auctionContractId, enabled: true },
          { config, session: { address: session.address, kit: StellarWalletsKit } }
        );
        const unpauseHandler = getActionHandler('unpause-auction');
        const unpauseAction = unpauseHandler.serialize(
          {},
          { config, session: { address: session.address, kit: StellarWalletsKit } }
        );

        proposalDraft.requestAdd({
          daoId,
          action: mintAuthorityAction,
          source: 'admin/auction/set-mint-authority',
          metadata: {
            title: 'Enable auction mint authority',
            description: `Allow ${config.auctionContractId} to mint auction tokens.`,
            url: ''
          },
          onAdded: () => {
            proposalDraft.requestAdd({
              daoId,
              action: unpauseAction,
              source: 'admin/auction/unpause-auction',
              metadata: {
                title: isEnabling ? 'Enable auctions' : 'Resume auctions',
                description: actionDescription,
                url: ''
              },
              onAdded: () => setFormMessage(`${isEnabling ? 'Enable' : 'Resume'} auctions added to the proposal draft.`)
            });
          }
        });
        return;
      }

      const handler = getActionHandler(actionType);
      const action = handler.serialize({}, { config, session: { address: session.address, kit: StellarWalletsKit } });
      proposalDraft.requestAdd({
        daoId,
        action,
        source: `admin/auction/${actionType}`,
        metadata: {
          title: actionTitle,
          description: actionDescription,
          url: ''
        },
        onAdded: () => setFormMessage(`${actionTitle} added to the proposal draft.`)
      });
      return;
    }
    setBusy(true);
    tx.start(
      isEnabling
        ? 'Enabling auctions...'
        : isLaunching
          ? 'Launching auctions...'
          : nextPaused
            ? 'Pausing auctions...'
            : 'Resuming auctions...'
    );
    try {
      const client = new AuctionClient({
        contractId: config.auctionContractId,
        rpcUrl: config.rpcUrl,
        networkPassphrase: config.passphrase,
        publicKey: session.address,
        signTransaction: async (xdr: string, opts?: { networkPassphrase?: string; address?: string }) =>
          StellarWalletsKit.signTransaction(xdr, {
            networkPassphrase: opts?.networkPassphrase ?? config.passphrase,
            address: opts?.address ?? session.address
          })
      });
      const assembled = nextPaused
        ? await client.pause({ caller: session.address })
        : await client.unpause({ caller: session.address });
      const sent = await assembled.signAndSend();
      const hash = sent.sendTransactionResponse?.hash ?? '';
      const submittedMessage = nextPaused
        ? 'Auction pause submitted'
        : isEnabling
          ? 'Auction enable submitted'
          : isLaunching
            ? 'Auction launch submitted'
            : 'Auction resume submitted';
      const successMessage = nextPaused
        ? 'Auctions paused'
        : isEnabling
          ? 'Auctions enabled'
          : isLaunching
            ? 'Auctions launched'
            : 'Auctions resumed';
      tx.submitted(submittedMessage, hash);
      await waitForConfirmation(hash, config.rpcUrl);
      tx.success(successMessage, hash);
      await mutate();
    } catch (updateError) {
      tx.fail(updateError, 'Auction control failed');
    } finally {
      setBusy(false);
    }
  }

  async function updateReservePrice(skipPauseCheck = false) {
    if (!session.address || (!isOwner && !canProposeAuction) || !data) return;

    // If auctions are active and not skipping pause check, show confirmation dialog
    if (!skipPauseCheck && data.paused === false) {
      setAutoPauseAction('reserve-price');
      setAutoPauseDialogOpen(true);
      return;
    }

    const match = reservePrice.trim().match(/^(\d+)(?:\.(\d{1,7}))?$/);
    if (!match)
      return tx.fail(new Error('Enter a valid reserve price with up to 7 decimal places.'), 'Invalid reserve price');
    const amount = BigInt(match[1]) * 10_000_000n + BigInt((match[2] || '').padEnd(7, '0') || '0');
    if (amount < 1000n)
      return tx.fail(new Error('Reserve price must be at least 0.0001 payment tokens.'), 'Invalid reserve price');
    if (!isOwner && canProposeAuction) {
      const actions = [];
      // Add pause action if auctions are active
      if (data.paused === false) {
        const pauseHandler = getActionHandler('pause-auction');
        const pauseAction = pauseHandler.serialize(
          {},
          { config, session: { address: session.address, kit: StellarWalletsKit } }
        );
        actions.push(pauseAction);
      }
      const handler = getActionHandler('set-auction-reserve-price');
      const action = handler.serialize(
        { reservePrice: reservePrice.trim() },
        { config, session: { address: session.address, kit: StellarWalletsKit } }
      );
      actions.push(action);

      // Add all actions to draft
      for (let i = 0; i < actions.length; i++) {
        proposalDraft.requestAdd({
          daoId,
          action: actions[i],
          source: `admin/auction/${i === 0 && data.paused === false ? 'pause-auction' : 'set-auction-reserve-price'}`,
          metadata: {
            title: i === 0 && data.paused === false ? 'Pause auctions' : 'Update auction reserve price',
            description:
              i === 0 && data.paused === false
                ? 'Pause auction activity.'
                : `Set the next auction reserve price to ${reservePrice.trim()}.`,
            url: ''
          },
          onAdded: () => {
            if (i === actions.length - 1) {
              setFormMessage(
                `${data.paused === false ? 'Pause and update' : 'Update'} reserve price added to the proposal draft.`
              );
              setReservePrice('');
            }
          }
        });
      }
      return;
    }
    setBusy(true);
    tx.start('Updating reserve price...');
    try {
      // If auctions are active, pause them first
      if (data.paused === false) {
        const pauseClient = new AuctionClient({
          contractId: config.auctionContractId,
          rpcUrl: config.rpcUrl,
          networkPassphrase: config.passphrase,
          publicKey: session.address,
          signTransaction: async (xdr: string, opts?: { networkPassphrase?: string; address?: string }) =>
            StellarWalletsKit.signTransaction(xdr, {
              networkPassphrase: opts?.networkPassphrase ?? config.passphrase,
              address: opts?.address ?? session.address
            })
        });
        tx.start('Pausing auctions...');
        const pauseAssembled = await pauseClient.pause({ caller: session.address });
        const pauseSent = await pauseAssembled.signAndSend();
        const pauseHash = pauseSent.sendTransactionResponse?.hash ?? '';
        tx.submitted('Auction pause submitted', pauseHash);
        await waitForConfirmation(pauseHash, config.rpcUrl);
        tx.submitted('Auctions paused, updating reserve price...', pauseHash);
      }

      const client = new AuctionClient({
        contractId: config.auctionContractId,
        rpcUrl: config.rpcUrl,
        networkPassphrase: config.passphrase,
        publicKey: session.address,
        signTransaction: async (xdr: string, opts?: { networkPassphrase?: string; address?: string }) =>
          StellarWalletsKit.signTransaction(xdr, {
            networkPassphrase: opts?.networkPassphrase ?? config.passphrase,
            address: opts?.address ?? session.address
          })
      });
      const sent = await (await client.set_reserve_price({ reserve_price: amount })).signAndSend();
      const hash = sent.sendTransactionResponse?.hash ?? '';
      tx.submitted('Reserve price update submitted', hash);
      await waitForConfirmation(hash, config.rpcUrl);
      tx.success('Reserve price updated', hash);
      setReservePrice('');
      await mutate();
    } catch (updateError) {
      tx.fail(updateError, 'Reserve price update failed');
    } finally {
      setBusy(false);
    }
  }

  async function updatePaymentToken(skipPauseCheck = false) {
    if (!session.address || (!isOwner && !canProposeAuction) || !data) return;

    // If auctions are active and not skipping pause check, show confirmation dialog
    if (!skipPauseCheck && data.paused === false) {
      setAutoPauseAction('payment-token');
      setAutoPauseDialogOpen(true);
      return;
    }

    const value = paymentToken.trim();
    if (!value) return tx.fail(new Error('Payment token contract address is required.'), 'Invalid payment token');
    if (!isValidStellarAddress(value)) {
      return tx.fail(
        new Error(getStellarAddressError(value) ?? 'Invalid payment token contract address.'),
        'Invalid payment token'
      );
    }
    if (!isOwner && canProposeAuction) {
      const actions = [];
      // Add pause action if auctions are active
      if (data.paused === false) {
        const pauseHandler = getActionHandler('pause-auction');
        const pauseAction = pauseHandler.serialize(
          {},
          { config, session: { address: session.address, kit: StellarWalletsKit } }
        );
        actions.push(pauseAction);
      }
      const handler = getActionHandler('set-auction-payment-token');
      const action = handler.serialize(
        { paymentToken: value },
        { config, session: { address: session.address, kit: StellarWalletsKit } }
      );
      actions.push(action);

      // Add all actions to draft
      for (let i = 0; i < actions.length; i++) {
        proposalDraft.requestAdd({
          daoId,
          action: actions[i],
          source: `admin/auction/${i === 0 && data.paused === false ? 'pause-auction' : 'set-auction-payment-token'}`,
          metadata: {
            title: i === 0 && data.paused === false ? 'Pause auctions' : 'Update auction payment token',
            description:
              i === 0 && data.paused === false
                ? 'Pause auction activity.'
                : `Set the auction payment token to ${value}.`,
            url: ''
          },
          onAdded: () => {
            if (i === actions.length - 1) {
              setFormMessage(
                `${data.paused === false ? 'Pause and update' : 'Update'} payment token added to the proposal draft.`
              );
              setPaymentToken('');
            }
          }
        });
      }
      return;
    }
    setBusy(true);
    tx.start('Updating payment token...');
    try {
      // If auctions are active, pause them first
      if (data.paused === false) {
        const pauseClient = new AuctionClient({
          contractId: config.auctionContractId,
          rpcUrl: config.rpcUrl,
          networkPassphrase: config.passphrase,
          publicKey: session.address,
          signTransaction: async (xdr: string, opts?: { networkPassphrase?: string; address?: string }) =>
            StellarWalletsKit.signTransaction(xdr, {
              networkPassphrase: opts?.networkPassphrase ?? config.passphrase,
              address: opts?.address ?? session.address
            })
        });
        tx.start('Pausing auctions...');
        const pauseAssembled = await pauseClient.pause({ caller: session.address });
        const pauseSent = await pauseAssembled.signAndSend();
        const pauseHash = pauseSent.sendTransactionResponse?.hash ?? '';
        tx.submitted('Auction pause submitted', pauseHash);
        await waitForConfirmation(pauseHash, config.rpcUrl);
        tx.submitted('Auctions paused, updating payment token...', pauseHash);
      }

      const client = new AuctionClient({
        contractId: config.auctionContractId,
        rpcUrl: config.rpcUrl,
        networkPassphrase: config.passphrase,
        publicKey: session.address,
        signTransaction: async (xdr: string, opts?: { networkPassphrase?: string; address?: string }) =>
          StellarWalletsKit.signTransaction(xdr, {
            networkPassphrase: opts?.networkPassphrase ?? config.passphrase,
            address: opts?.address ?? session.address
          })
      });
      const sent = await (await client.set_payment_token({ payment_token: value })).signAndSend();
      const hash = sent.sendTransactionResponse?.hash ?? '';
      tx.submitted('Payment token update submitted', hash);
      await waitForConfirmation(hash, config.rpcUrl);
      tx.success('Payment token updated', hash);
      setPaymentToken('');
      await mutate();
    } catch (updateError) {
      tx.fail(updateError, 'Payment token update failed');
    } finally {
      setBusy(false);
    }
  }

  if (!isOwner && !canProposeAuction) {
    return (
      <PageSection title="Auction controls" description="Owner-only auction operations.">
        <Callout variant="warning" badge="Access restricted" title="Connect the configured owner wallet to continue">
          <ShortId value={config.adminAddress} label="Owner address" />
        </Callout>
      </PageSection>
    );
  }

  return (
    <>
      <AdminProposalDraftDialog
        pending={proposalDraft.pending}
        onCancel={proposalDraft.cancel}
        onResolve={proposalDraft.resolve}
      />
      <AuctionAutoPauseDialog
        open={autoPauseDialogOpen}
        action={autoPauseAction ?? 'payment-token'}
        isLoading={busy}
        onCancel={() => setAutoPauseDialogOpen(false)}
        onConfirm={() => {
          setAutoPauseDialogOpen(false);
          if (autoPauseAction === 'payment-token') {
            void updatePaymentToken(true);
          } else {
            void updateReservePrice(true);
          }
        }}
      />
      <PageSection
        title="Auction controls"
        description="Pause or resume auction activity for maintenance and emergency operations."
      >
        <Stack gap="4">
          <AdminSectionNav daoId={daoId} active="/auction" />
          {error ? <Callout variant="error" title={error.message} /> : null}
          {formMessage ? <Callout variant="warning" title={formMessage} /> : null}
          <Card p="5">
            <Stack gap="4">
              <div>
                <Badge>Owner</Badge>
              </div>
              <Heading style={{ fontSize: '1.2rem' }}>Auction status</Heading>
              {isLoading && !data ? (
                <div role="status" aria-busy="true" className="skeleton-list">
                  <span className="sr-only">Loading auction controls</span>
                  <Skeleton style={{ width: '260px', height: '1em' }} />
                  <Skeleton style={{ width: '100%', height: '1em' }} />
                  <Skeleton style={{ width: '100%', height: '2.5em' }} />
                  <Skeleton style={{ width: '100%', height: '1em' }} />
                  <Skeleton style={{ width: '100%', height: '2.5em' }} />
                </div>
              ) : (
                <Text className="lede" style={{ margin: 0 }}>
                  {config.auctionEnabled === false
                    ? 'Auctions are currently disabled. Configure the auction and enable it to create the first auction.'
                    : data?.status === 'not-launched'
                      ? 'Auctions have not yet been launched. Click launch to create the first auction.'
                      : data?.paused
                        ? 'Bidding and automatic settlement are paused.'
                        : 'Auctions are active and accepting bids.'}
                </Text>
              )}
              {data ? (
                <>
                  {(data.status === 'not-launched' || data.paused) && !auctionCanMint ? (
                    <Callout
                      variant="warning"
                      title="Auction mint authority is missing."
                      description={
                        mintAuthorityError?.message ||
                        `Grant ${config.auctionContractId} mint authority in Token Admin before ${data.status === 'not-launched' ? 'launching' : 'resuming'}. ${data.status === 'not-launched' ? 'Launching' : 'Resuming'} creates the first auction and mints its token.`
                      }
                    />
                  ) : null}
                </>
              ) : null}
              {config.auctionEnabled === false ? (
                <>
                  <Callout
                    variant="info"
                    title="Auctions are currently disabled"
                    description="Configure auction parameters below and enable them. Once enabled, you can pause and resume auctions as needed."
                  />
                  <EnableAuctionsForm
                    value={populatedEnableValues}
                    onChange={setEnableValues}
                    onSubmit={() => void handleEnableAuctions()}
                    network={config.name}
                    errors={enableErrors}
                    disabled={busy || !data}
                    submitLabel={isOwner ? 'Enable auctions' : 'Add setup to proposal'}
                  />
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    {data?.status === 'not-launched' ? (
                      <Button onClick={() => void updatePaused(false)} disabled={busy || (isOwner && !auctionCanMint)}>
                        {isOwner ? 'Launch auctions' : 'Create launch proposal'}
                      </Button>
                    ) : (
                      <>
                        <Button onClick={() => void updatePaused(true)} disabled={busy || data?.paused !== false}>
                          {isOwner ? 'Pause auctions' : 'Add pause proposal'}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => void updatePaused(false)}
                          disabled={busy || data?.paused !== true || (isOwner && !auctionCanMint)}
                        >
                          {isOwner ? 'Resume auctions' : 'Add resume proposal'}
                        </Button>
                      </>
                    )}
                  </div>
                  <Text className="label">Auction payment token</Text>
                  <Text className="lede" style={{ margin: 0 }}>
                    {data?.config.payment_token
                      ? `${getTreasuryAssets(config.name).find((asset) => asset.contractId === data.config.payment_token)?.code ?? 'Unknown SAC'} · ${data.config.payment_token}`
                      : 'Not configured'}
                    . Changes apply after the next auction is created. If auctions are active, they will be paused
                    automatically.
                  </Text>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <AdminPaymentTokenForm
                      value={{ paymentToken }}
                      onChange={(value) => setPaymentToken(value.paymentToken)}
                      network={config.name}
                      disabled={busy}
                      draftPreview={draftStatus.actionsInDraft.find((a) => a.type === 'set-auction-payment-token')}
                    />
                    <Button
                      variant="outline"
                      onClick={() => void updatePaymentToken()}
                      disabled={busy || !paymentToken}
                    >
                      {isOwner ? 'Update payment token' : 'Add payment token proposal'}
                    </Button>
                  </div>
                  <Text className="label">Reserve price for the next auction</Text>
                  <Text className="lede" style={{ margin: 0 }}>
                    Current reserve: {data ? formatStroops(data.config.reserve_price) : '—'}{' '}
                    {data?.config.payment_token
                      ? (getTreasuryAssets(config.name).find((asset) => asset.contractId === data.config.payment_token)
                          ?.code ?? 'SAC')
                      : 'SAC'}{' '}
                    units. Changes apply after the next auction is created. If auctions are active, they will be paused
                    automatically.
                  </Text>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <AdminReservePriceForm
                      value={{ reservePrice }}
                      onChange={(value) => setReservePrice(value.reservePrice)}
                      disabled={busy}
                      draftPreview={draftStatus.actionsInDraft.find((a) => a.type === 'set-auction-reserve-price')}
                    />
                    <Button
                      variant="outline"
                      onClick={() => void updateReservePrice()}
                      disabled={busy || !reservePrice}
                    >
                      {isOwner ? 'Update reserve' : 'Add reserve proposal'}
                    </Button>
                  </div>
                </>
              )}
            </Stack>
          </Card>
        </Stack>
      </PageSection>
    </>
  );
}
