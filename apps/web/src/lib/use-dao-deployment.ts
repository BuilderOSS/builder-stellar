'use client';
import { Client as ManagerClient, type DaoAddresses, type LaunchConfig } from '@builder-stellar/manager-bindings';
import type { AssembledTransaction } from '@stellar/stellar-sdk/contract';
import { Server } from '@stellar/stellar-sdk/rpc';
import { useRef, useState } from 'react';

import {
  bindSignedCreationEnvelope,
  broadcastCreationEnvelope,
  creationConfigurationFingerprint,
  inspectCreationSubmission,
  normalizedCreationConfiguration,
  preparedCreationXdr,
  type RecoveryOptions,
  type Submission,
  SubmissionExpired,
  SubmissionFailed
} from '@/components/create-dao/deployment-transaction';
import { signWithWallet } from '@/lib/wallet-sign';
import { useAuthSessionStore } from '@/stores/auth-session-store';
import { assertCreationSaved, type DeploymentRecord, useCreateDaoStore } from '@/stores/create-dao-store';
import {
  assertPreferencesSaved,
  type LocalLaunch,
  preferenceScopeKey,
  useLocalPreferencesStore
} from '@/stores/local-preferences-store';

import type { CreateDaoFormData } from './create-dao-schema';
import type { DaoNetworkName } from './dao-config';
import { formDataToCreationParams, generateNonce } from './dao-creation-params';
import { getDeploymentConfig } from './deployment-config';
import { useTransactionFeedback } from './transaction-feedback';

export type DeploymentStep = 'idle' | 'predicting' | 'creating' | 'confirming' | 'complete' | 'error';
export type DeploymentState = {
  currentStep: DeploymentStep;
  predictedAddresses: DaoAddresses | null;
  createdAddresses: DaoAddresses | null;
  transactions: { create?: string };
  error: Error | null;
};
const initialState: DeploymentState = {
  currentStep: 'idle',
  predictedAddresses: null,
  createdAddresses: null,
  transactions: {},
  error: null
};
export class DefinitiveTransactionFailure extends Error {}
// Unlike the shared legacy helper, FAILED is never swallowed as a polling/network error.
export async function confirmCreationTransaction(hash: string, rpcUrl: string, timeout = 60_000) {
  const server = new Server(rpcUrl, { allowHttp: rpcUrl.startsWith('http://') });
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const result = await server.getTransaction(hash);
    if (result.status === 'SUCCESS') return;
    if (result.status === 'FAILED')
      throw new DefinitiveTransactionFailure('Transaction failed on-chain. This action was not confirmed.');
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error('Confirmation is still unknown. Check the saved transaction again; do not create another DAO.');
}
// Existing endpoint is deployment-scoped on the server. A timeout is indexing delay, not deployment failure.
export async function pollCreatedDao(daoId: string, signal?: AbortSignal, timeout = 30_000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (signal?.aborted) return false;
    const response = await fetch(`/api/dao/${encodeURIComponent(daoId)}`, {
      cache: 'no-store',
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10_000)]) : AbortSignal.timeout(10_000)
    });
    if (response.ok) {
      const body = await response.json();
      if (body.daoId !== daoId || !['pending', 'operational'].includes(body.status))
        throw new Error('Invalid DAO lookup response');
      return true;
    }
    if (response.status !== 404)
      throw new Error('DAO indexing lookup is unavailable. Your confirmed deployment is saved.');
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  return false;
}
export function useDaoDeployment(deployer: string, network: DaoNetworkName) {
  const [state, setState] = useState<DeploymentState>(initialState);
  const locked = useRef(false);
  const tx = useTransactionFeedback(network);
  const patch = (update: Partial<DeploymentState>) => setState((s) => ({ ...s, ...update }));
  const checkWallet = () => {
    const config = getDeploymentConfig();
    const session = useAuthSessionStore.getState();
    if (config.name !== network) throw new Error('This DAO is not on the configured deployment network');
    if (!deployer || session.address !== deployer || session.authStatus !== 'authenticated')
      throw new Error('Connect and sign in with the launch administrator wallet');
    if (
      session.walletNetworkIssue ||
      (session.walletNetworkPassphrase && session.walletNetworkPassphrase !== config.networkPassphrase)
    )
      throw new Error(session.walletNetworkIssue || 'Switch your wallet to the DAO network');
    return config;
  };
  const signPrepared = async <T>(assembled: AssembledTransaction<T>) => {
    const config = checkWallet();
    const requestedXdr = preparedCreationXdr(assembled);
    // Validate source and lifetime before opening the wallet as well as after it.
    bindSignedCreationEnvelope(requestedXdr, requestedXdr, config.networkPassphrase, deployer);
    const signed = await signWithWallet(requestedXdr, {
      address: deployer,
      networkPassphrase: config.networkPassphrase
    });
    checkWallet();
    return bindSignedCreationEnvelope(requestedXdr, signed.signedTxXdr, config.networkPassphrase, deployer);
  };
  const retryable = (status?: string) => ['failed', 'rejected', 'expired'].includes(status ?? '');
  const deployDaoOperation = async (input: CreateDaoFormData, draftId?: string, recovery: RecoveryOptions = {}) => {
    if (locked.current) throw new Error('A deployment operation is already running');
    locked.current = true;
    const id = draftId ?? useCreateDaoStore.getState().activeDraftId;
    let record: DeploymentRecord | undefined;
    try {
      const config = checkWallet();
      const store = useCreateDaoStore.getState();
      const draft = store.drafts.find((d) => d.id === id);
      if (!draft || !id) throw new Error('Save a local draft before deploying');
      if (
        draft.scope.network !== network ||
        draft.scope.deployment !== config.managerAddress ||
        (draft.scope.wallet && draft.scope.wallet !== deployer)
      )
        throw new Error('The draft belongs to a different deployment or wallet');
      if (draft.imagePreview) throw new Error('Upload the local image or choose the saved image first');
      // The reviewed input is captured before the lock/rehydration. Durable state
      // cannot silently replace it, even if another tab edited while we waited.
      const reviewed = normalizedCreationConfiguration(input);
      const fingerprint = creationConfigurationFingerprint(reviewed);
      if (
        fingerprint !== creationConfigurationFingerprint(draft.configuration) ||
        (draft.deployment?.configurationFingerprint && fingerprint !== draft.deployment.configurationFingerprint)
      )
        throw new Error('The draft changed. Refresh and review its configuration again before signing.');
      const frozen = draft.deployment?.configuration ?? reviewed;
      if (fingerprint !== creationConfigurationFingerprint(frozen))
        throw new Error('The frozen configuration changed. Refresh review before signing.');
      const data = { ...frozen, launchAdmin: input.launchAdmin };
      if (data.launchAdmin !== deployer) throw new Error('Launch admin must match the connected wallet');
      record = draft.deployment;
      if (record?.status === 'confirmed' && record.addresses) {
        patch({
          currentStep: 'complete',
          createdAddresses: record.addresses,
          transactions: { create: record.hash },
          error: null
        });
        return record.addresses;
      }
      const manager = new ManagerClient({
        contractId: config.managerAddress,
        rpcUrl: config.rpcUrl,
        networkPassphrase: config.networkPassphrase,
        publicKey: deployer,
        allowHttp: config.rpcUrl.startsWith('http://')
      });
      const server = new Server(config.rpcUrl, { allowHttp: config.rpcUrl.startsWith('http://') });
      const save = (next: DeploymentRecord) => {
        record = next;
        useCreateDaoStore.getState().recordDeployment(id, next);
        assertCreationSaved();
        patch({ predictedAddresses: next.addresses ?? null, transactions: { create: next.hash } });
      };
      const finish = (confirmed: DeploymentRecord, confirmedBy: 'transaction' | 'manager-state' = 'transaction') => {
        if (!confirmed.addresses) throw new Error('Saved predicted addresses are missing');
        save({ ...confirmed, status: 'confirmed', confirmedBy, error: undefined });
        patch({ currentStep: 'complete', createdAddresses: confirmed.addresses, error: null });
        if (confirmed.hash && confirmedBy === 'transaction') tx.success('DAO created in Setup', confirmed.hash);
        return confirmed.addresses;
      };
      const reconcilePending = async () => {
        if (!record?.addresses) return null;
        // This read must succeed before rebuilding or rebroadcasting anything.
        const pending = (await manager.get_pending_dao({ token_address: record.addresses.token })).result;
        if (pending) {
          if (pending.launch_admin !== deployer) throw new Error('Recovered DAO launch admin does not match');
          if (
            Object.entries(record.addresses).some(
              ([key, value]) => pending.addresses[key as keyof DaoAddresses] !== value
            )
          )
            throw new Error('Recovered DAO addresses do not match the saved prediction');
          return finish({ ...record, addresses: pending.addresses }, 'manager-state');
        }
        return null;
      };
      const pendingCreation = await reconcilePending();
      if (pendingCreation) return pendingCreation;
      if (record?.hash) {
        patch({ currentStep: 'confirming', error: null });
        const outcome = await inspectCreationSubmission(server, record, config.networkPassphrase, deployer);
        if (outcome === 'confirmed') return finish(record);
        if (outcome === 'failed' && record.status !== 'failed') {
          save({ ...record, status: 'failed' });
          throw new DefinitiveTransactionFailure(
            'Transaction failed on-chain. Explicitly retry the saved nonce after checking Setup.'
          );
        }
        if (outcome === 'expired' && !retryable(record.status)) {
          const created = await reconcilePending();
          if (created) return created;
          save({ ...record, status: 'expired' });
          throw new SubmissionExpired(
            'The saved envelope expired without a pending DAO. Explicitly retry this same nonce; no new nonce was generated.'
          );
        }
        if (!retryable(record.status)) {
          if (!recovery.rebroadcast && record.status === 'submitted') {
            await confirmCreationTransaction(record.hash, config.rpcUrl);
            return finish(record);
          }
          if (!recovery.rebroadcast)
            throw new Error(
              'Confirmation is unknown. Check again or explicitly rebroadcast the saved envelope while valid. No new transaction was signed.'
            );
          const created = await reconcilePending();
          if (created) return created;
          const saved = record;
          await broadcastCreationEnvelope(server, saved, config.networkPassphrase, deployer, (changes) =>
            save({ ...record!, ...changes })
          );
          tx.submitted('Saved DAO creation envelope accepted', saved.hash!);
          await confirmCreationTransaction(saved.hash!, config.rpcUrl);
          return finish(record!);
        }
        // A fresh PendingDao read also gates retries after definitive rejection,
        // expiry or chain failure. Always rebuild with the original frozen nonce.
        const created = await reconcilePending();
        if (created) return created;
      }
      const nonce = record ? BigInt(record.nonce) : generateNonce();
      formDataToCreationParams(data, deployer, nonce, network);
      save({
        nonce: nonce.toString(),
        deployer,
        status: 'prepared',
        addresses: record?.addresses,
        configuration: frozen,
        configurationFingerprint: fingerprint
      });
      patch({ currentStep: 'predicting', error: null });
      const addresses = (await manager.predict_addresses({ creator: deployer, nonce })).result.unwrap();
      save({ ...record!, addresses });
      const resolved = {
        ...data,
        basicInfo: {
          ...data.basicInfo,
          tokenUri: data.basicInfo.tokenUri.replaceAll('{daoId}', addresses.token),
          rendererBase: data.basicInfo.rendererBase.replaceAll('{daoId}', addresses.token)
        }
      };
      const params = formDataToCreationParams(resolved, deployer, nonce, network);
      patch({ currentStep: 'creating' });
      const assembled = await manager.create_dao({ params }, { timeoutInSeconds: 180, restore: false });
      // Simulation is only a preflight error check, never evidence of deployment.
      assembled.result.unwrap();
      assertCreationSaved();
      tx.start('Create DAO in Setup');
      const signed = await signPrepared(assembled);
      save({ ...record!, ...signed, status: 'signed', acceptedAt: undefined });
      await broadcastCreationEnvelope(server, record!, config.networkPassphrase, deployer, (changes) =>
        save({ ...record!, ...changes })
      );
      patch({ currentStep: 'confirming' });
      tx.submitted('DAO creation envelope accepted', signed.hash);
      await confirmCreationTransaction(signed.hash, config.rpcUrl);
      return finish(record!);
    } catch (error) {
      const e = error instanceof Error ? error : new Error('DAO creation failed');
      if (id && record)
        useCreateDaoStore.getState().recordDeployment(id, {
          ...record,
          status: e instanceof DefinitiveTransactionFailure ? 'failed' : record.status,
          error: e.message
        });
      patch({ currentStep: 'error', error: e });
      tx.fail(e, 'DAO creation needs attention', 'manager');
      throw e;
    } finally {
      locked.current = false;
    }
  };
  const launchDaoOperation = async (
    tokenAddress: string,
    choice: Omit<LaunchConfig, 'expected_minter'> & { expected_minter?: string | null },
    recovery: RecoveryOptions = {}
  ) => {
    if (locked.current) throw new Error('A launch operation is already running');
    locked.current = true;
    let key = '';
    try {
      const config = checkWallet();
      await useLocalPreferencesStore.persist.rehydrate();
      key = `${preferenceScopeKey({ network, deployment: config.managerAddress, wallet: deployer })}:${tokenAddress}`;
      const store = useLocalPreferencesStore.getState();
      const previous = store.launches[key];
      if (previous?.status === 'confirmed') return;
      if (
        previous &&
        (previous.auction !== choice.launch_auction ||
          previous.marketplace !== choice.launch_marketplace ||
          previous.minter !== choice.enable_minter)
      )
        throw new Error('Launch choices changed. Refresh and review them again before signing.');
      if (
        recovery.rebroadcast &&
        previous?.reviewedConfig &&
        JSON.stringify(previous.reviewedConfig) !==
          JSON.stringify({
            launch_auction: choice.launch_auction,
            launch_marketplace: choice.launch_marketplace,
            enable_minter: choice.enable_minter,
            expected_minter: choice.enable_minter ? (choice.expected_minter ?? null) : null
          })
      )
        throw new Error('The saved launch review differs from the current choices or minter. Nothing was rebroadcast.');
      let record: LocalLaunch = previous ?? {
        auction: choice.launch_auction,
        marketplace: choice.launch_marketplace,
        minter: choice.enable_minter
      };
      const save = (changes: Partial<LocalLaunch & Submission>) => {
        record = { ...record, ...changes };
        store.setLaunch(key, record);
        assertPreferencesSaved();
      };
      const manager = new ManagerClient({
        contractId: config.managerAddress,
        rpcUrl: config.rpcUrl,
        networkPassphrase: config.networkPassphrase,
        publicKey: deployer,
        allowHttp: config.rpcUrl.startsWith('http://')
      });
      const server = new Server(config.rpcUrl, { allowHttp: config.rpcUrl.startsWith('http://') });
      const requirePending = async () => {
        const pending = (await manager.get_pending_dao({ token_address: tokenAddress })).result;
        if (!pending || pending.launch_admin !== deployer || pending.addresses.token !== tokenAddress)
          throw new Error(
            'This wallet does not own a pending DAO on this Manager. Refresh its current state before signing.'
          );
      };
      if (record.hash) {
        const outcome = await inspectCreationSubmission(server, record, config.networkPassphrase, deployer);
        if (outcome === 'confirmed') {
          save({ status: 'confirmed' });
          tx.success('DAO launched', record.hash);
          return;
        }
        if (outcome === 'failed' && record.status !== 'failed') {
          save({ status: 'failed' });
          throw new SubmissionFailed('Launch failed on-chain. Review Setup before explicitly retrying.');
        }
        if (outcome === 'expired' && !retryable(record.status)) {
          await requirePending();
          save({ status: 'expired' });
          throw new SubmissionExpired(
            'The saved launch envelope expired. Explicitly retry after reviewing this pending DAO.'
          );
        }
        if (!retryable(record.status)) {
          if (!recovery.rebroadcast && record.status === 'submitted') {
            await confirmCreationTransaction(record.hash!, config.rpcUrl);
            save({ status: 'confirmed' });
            tx.success('DAO launched', record.hash!);
            return;
          }
          if (!recovery.rebroadcast)
            throw new Error(
              'Launch confirmation is unknown. Explicitly rebroadcast the saved envelope while valid, or check again.'
            );
          await requirePending();
          await broadcastCreationEnvelope(server, record, config.networkPassphrase, deployer, save);
          tx.submitted('Saved launch envelope accepted', record.hash!);
          await confirmCreationTransaction(record.hash!, config.rpcUrl);
          save({ status: 'confirmed' });
          tx.success('DAO launched', record.hash!);
          return;
        }
      }
      await requirePending();
      const expectedMinter = choice.enable_minter ? choice.expected_minter : null;
      if (choice.enable_minter && !expectedMinter)
        throw new Error('Review the registered platform minter before launch');
      const assembled = await manager.launch_dao(
        {
          token_address: tokenAddress,
          launch_config: { ...choice, expected_minter: expectedMinter ?? null }
        },
        { timeoutInSeconds: 180, restore: false }
      );
      assembled.result.unwrap();
      save({
        hash: undefined,
        signedTxXdr: undefined,
        expiresAt: undefined,
        acceptedAt: undefined,
        status: undefined,
        reviewedConfig: {
          launch_auction: choice.launch_auction,
          launch_marketplace: choice.launch_marketplace,
          enable_minter: choice.enable_minter,
          expected_minter: expectedMinter ?? null
        }
      });
      tx.start('Launch DAO');
      const signed = await signPrepared(assembled);
      save({ ...signed, status: 'signed' });
      await broadcastCreationEnvelope(server, record, config.networkPassphrase, deployer, save);
      tx.submitted('DAO launch envelope accepted', signed.hash);
      await confirmCreationTransaction(signed.hash, config.rpcUrl);
      save({ status: 'confirmed' });
      tx.success('DAO launched', signed.hash);
    } catch (error) {
      if (key && (error instanceof DefinitiveTransactionFailure || error instanceof SubmissionFailed)) {
        const record = useLocalPreferencesStore.getState().launches[key];
        if (record) useLocalPreferencesStore.getState().setLaunch(key, { ...record, status: 'failed' });
      }
      tx.fail(error, 'DAO launch needs attention', 'manager');
      throw error;
    } finally {
      locked.current = false;
    }
  };
  const deployDao = async (input: CreateDaoFormData, draftId?: string, recovery: RecoveryOptions = {}) => {
    const reviewed = { ...normalizedCreationConfiguration(input), launchAdmin: input.launchAdmin };
    const id = draftId ?? useCreateDaoStore.getState().activeDraftId;
    if (!navigator.locks)
      throw new Error('Use a browser with Web Locks support to keep deployment recovery safe across tabs.');
    return navigator.locks.request(
      `dao-create:${network}:${getDeploymentConfig().managerAddress}:${id}`,
      { ifAvailable: true },
      async (lock) => {
        if (!lock)
          throw new Error(
            'This draft is being deployed in another tab. Return there or check the saved transaction later.'
          );
        await useCreateDaoStore.persist.rehydrate();
        return deployDaoOperation(reviewed, id ?? undefined, recovery);
      }
    );
  };
  const launchDao = async (
    tokenAddress: string,
    choice: Omit<LaunchConfig, 'expected_minter'> & { expected_minter?: string | null },
    recovery: RecoveryOptions = {}
  ) => {
    const reviewed = { ...choice };
    if (!navigator.locks)
      throw new Error('Use a browser with Web Locks support to keep launch recovery safe across tabs.');
    return navigator.locks.request(
      `dao-launch:${network}:${getDeploymentConfig().managerAddress}:${tokenAddress}`,
      { ifAvailable: true },
      async (lock) => {
        if (!lock) throw new Error('This DAO is being launched in another tab. Check the saved transaction later.');
        return launchDaoOperation(tokenAddress, reviewed, recovery);
      }
    );
  };
  return {
    state,
    deployDao,
    launchDao,
    reset: () => {
      if (!locked.current) setState(initialState);
    }
  };
}
