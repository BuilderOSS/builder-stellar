// lib/use-dao-deployment.ts

'use client';

import { Client as ManagerClient, type DaoAddresses } from '@builder-stellar/manager-bindings';
import { Client as MetadataClient } from '@builder-stellar/metadata-bindings';
import { Client as TokenClient } from '@builder-stellar/token-bindings';
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import { useCallback, useState } from 'react';

import type { CreateDaoFormData } from './dao-creation-params';
import { formDataToCreationParams, generateNonce } from './dao-creation-params';
import { getDeploymentConfig } from './deployment-config';
import { waitForConfirmation } from './transaction-confirmation';

export type DeploymentStep =
  | 'idle'
  | 'predicting'
  | 'creating'
  | 'accepting-ownership'
  | 'adding-properties'
  | 'minting-founders'
  | 'finalizing'
  | 'indexing'
  | 'complete'
  | 'error';

export interface DeploymentState {
  currentStep: DeploymentStep;
  completedSteps: Set<DeploymentStep>;
  predictedAddresses: DaoAddresses | null;
  createdAddresses: DaoAddresses | null;
  transactions: {
    create?: string;
    acceptOwnership?: string;
    addProperties?: string;
    founderMints: string[];
    finalize?: string;
  };
  progress: {
    totalSteps: number;
    currentStepIndex: number;
    currentStepLabel: string;
  };
  error: Error | null;
  nonce: bigint | null;
}

const initialState: DeploymentState = {
  currentStep: 'idle',
  completedSteps: new Set(),
  predictedAddresses: null,
  createdAddresses: null,
  transactions: {
    founderMints: []
  },
  progress: {
    totalSteps: 7,
    currentStepIndex: 0,
    currentStepLabel: 'Ready to deploy'
  },
  error: null,
  nonce: null
};

const STEP_LABELS: Record<DeploymentStep, string> = {
  idle: 'Ready to deploy',
  predicting: 'Predicting contract addresses...',
  creating: 'Creating DAO contracts...',
  'accepting-ownership': 'Accepting token ownership...',
  'adding-properties': 'Configuring artwork metadata...',
  'minting-founders': 'Minting founder allocations...',
  finalizing: 'Finalizing DAO...',
  indexing: 'Waiting for blockchain indexing...',
  complete: 'DAO created successfully!',
  error: 'Deployment failed'
};

const STEP_ORDER: DeploymentStep[] = [
  'predicting',
  'creating',
  'accepting-ownership',
  'adding-properties',
  'minting-founders',
  'finalizing',
  'indexing'
];

export function useDaoDeployment(deployer: string) {
  const [state, setState] = useState<DeploymentState>(initialState);

  const updateState = useCallback((updates: Partial<DeploymentState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  }, []);

  const setStep = useCallback(
    (step: DeploymentStep) => {
      const stepIndex = STEP_ORDER.indexOf(step);
      updateState({
        currentStep: step,
        progress: {
          ...state.progress,
          currentStepIndex: stepIndex >= 0 ? stepIndex + 1 : 0,
          currentStepLabel: STEP_LABELS[step]
        }
      });
    },
    [state.progress, updateState]
  );

  const markStepComplete = useCallback((step: DeploymentStep) => {
    setState((prev) => ({
      ...prev,
      completedSteps: new Set([...prev.completedSteps, step])
    }));
  }, []);

  const setError = useCallback(
    (error: Error) => {
      updateState({
        currentStep: 'error',
        error,
        progress: {
          ...state.progress,
          currentStepLabel: STEP_LABELS.error
        }
      });
    },
    [state.progress, updateState]
  );

  const reset = useCallback(() => {
    setState(initialState);
  }, []);

  // Step 1: Predict contract addresses (no wallet signature)
  const predictAddresses = useCallback(
    async (nonce: bigint) => {
      setStep('predicting');

      try {
        const config = getDeploymentConfig();

        const managerClient = new ManagerClient({
          contractId: config.managerAddress,
          rpcUrl: config.rpcUrl,
          networkPassphrase: config.networkPassphrase,
          publicKey: deployer
          // No signTransaction - read-only
        });

        const result = await managerClient.predict_addresses({
          creator: deployer,
          nonce
        });

        if (!result.result) {
          throw new Error('Failed to predict addresses');
        }

        const addresses = result.result.unwrap();

        updateState({ predictedAddresses: addresses });
        markStepComplete('predicting');

        return addresses;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to predict addresses');
        setError(error);
        throw error;
      }
    },
    [deployer, setStep, updateState, markStepComplete, setError]
  );

  // Step 2: Create DAO
  const createDao = useCallback(
    async (formData: CreateDaoFormData, nonce: bigint) => {
      setStep('creating');

      try {
        const config = getDeploymentConfig();
        const params = formDataToCreationParams(formData, deployer, nonce);

        const managerClient = new ManagerClient({
          contractId: config.managerAddress,
          rpcUrl: config.rpcUrl,
          networkPassphrase: config.networkPassphrase,
          publicKey: deployer,
          signTransaction: async (xdr: string, opts?: { networkPassphrase?: string; address?: string }) =>
            StellarWalletsKit.signTransaction(xdr, {
              networkPassphrase: opts?.networkPassphrase ?? config.networkPassphrase,
              address: opts?.address ?? deployer
            })
        });

        const assembled = await managerClient.create_dao({ params });
        const sent = await assembled.signAndSend();
        const hash = sent.sendTransactionResponse?.hash;

        if (!hash) {
          throw new Error('No transaction hash returned from create_dao');
        }

        await waitForConfirmation(hash, config.rpcUrl);

        if (!assembled.result) {
          throw new Error('No result from create_dao transaction');
        }

        const addresses = assembled.result.unwrap();

        updateState({
          createdAddresses: addresses,
          transactions: { ...state.transactions, create: hash }
        });
        markStepComplete('creating');

        return addresses;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to create DAO');
        setError(error);
        throw error;
      }
    },
    [deployer, state.transactions, setStep, updateState, markStepComplete, setError]
  );

  // Step 3: Accept token ownership
  const acceptOwnership = useCallback(
    async (tokenAddress: string) => {
      setStep('accepting-ownership');

      try {
        const config = getDeploymentConfig();

        const tokenClient = new TokenClient({
          contractId: tokenAddress,
          rpcUrl: config.rpcUrl,
          networkPassphrase: config.networkPassphrase,
          publicKey: deployer,
          signTransaction: async (xdr: string, opts?: { networkPassphrase?: string; address?: string }) =>
            StellarWalletsKit.signTransaction(xdr, {
              networkPassphrase: opts?.networkPassphrase ?? config.networkPassphrase,
              address: opts?.address ?? deployer
            })
        });

        const assembled = await tokenClient.accept_ownership();
        const sent = await assembled.signAndSend();
        const hash = sent.sendTransactionResponse?.hash;

        if (!hash) {
          throw new Error('No transaction hash returned from accept_ownership');
        }

        await waitForConfirmation(hash, config.rpcUrl);

        updateState({
          transactions: { ...state.transactions, acceptOwnership: hash }
        });
        markStepComplete('accepting-ownership');
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to accept ownership');
        setError(error);
        throw error;
      }
    },
    [deployer, state.transactions, setStep, updateState, markStepComplete, setError]
  );

  // Step 4: Add artwork properties
  const addProperties = useCallback(
    async (metadataAddress: string, formData: CreateDaoFormData) => {
      setStep('adding-properties');

      try {
        const config = getDeploymentConfig();
        const params = formDataToCreationParams(formData, deployer, state.nonce!);

        const metadataClient = new MetadataClient({
          contractId: metadataAddress,
          rpcUrl: config.rpcUrl,
          networkPassphrase: config.networkPassphrase,
          publicKey: deployer,
          signTransaction: async (xdr: string, opts?: { networkPassphrase?: string; address?: string }) =>
            StellarWalletsKit.signTransaction(xdr, {
              networkPassphrase: opts?.networkPassphrase ?? config.networkPassphrase,
              address: opts?.address ?? deployer
            })
        });

        const assembled = await metadataClient.add_properties({
          names: params.artwork_property_names,
          items: params.artwork_items,
          ipfs_group: params.artwork_ipfs
        });

        const sent = await assembled.signAndSend();
        const hash = sent.sendTransactionResponse?.hash;

        if (!hash) {
          throw new Error('No transaction hash returned from add_properties');
        }

        await waitForConfirmation(hash, config.rpcUrl);

        updateState({
          transactions: { ...state.transactions, addProperties: hash }
        });
        markStepComplete('adding-properties');
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to add properties');
        setError(error);
        throw error;
      }
    },
    [deployer, state.nonce, state.transactions, setStep, updateState, markStepComplete, setError]
  );

  // Step 5: Mint founder allocations (batched)
  const mintFounders = useCallback(
    async (tokenAddress: string, formData: CreateDaoFormData) => {
      if (formData.founders.length === 0) {
        // Skip if no founders
        markStepComplete('minting-founders');
        return;
      }

      setStep('minting-founders');

      try {
        const config = getDeploymentConfig();
        const hashes: string[] = [];

        const tokenClient = new TokenClient({
          contractId: tokenAddress,
          rpcUrl: config.rpcUrl,
          networkPassphrase: config.networkPassphrase,
          publicKey: deployer,
          signTransaction: async (xdr: string, opts?: { networkPassphrase?: string; address?: string }) =>
            StellarWalletsKit.signTransaction(xdr, {
              networkPassphrase: opts?.networkPassphrase ?? config.networkPassphrase,
              address: opts?.address ?? deployer
            })
        });

        // Process each founder (could be optimized with batching in the future)
        for (const founder of formData.founders) {
          const assembled = await tokenClient.batch_mint({
            minter: formData.launchAdmin,
            to: founder.address,
            amount: founder.amount
          });

          const sent = await assembled.signAndSend();
          const hash = sent.sendTransactionResponse?.hash;

          if (!hash) {
            throw new Error(`No transaction hash returned for founder ${founder.address}`);
          }

          await waitForConfirmation(hash, config.rpcUrl);
          hashes.push(hash);
        }

        updateState({
          transactions: { ...state.transactions, founderMints: hashes }
        });
        markStepComplete('minting-founders');
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to mint founder allocations');
        setError(error);
        throw error;
      }
    },
    [deployer, state.transactions, setStep, updateState, markStepComplete, setError]
  );

  // Step 6: Finalize DAO
  const finalizeDao = useCallback(
    async (tokenAddress: string, launchAuction: boolean) => {
      setStep('finalizing');

      try {
        const config = getDeploymentConfig();

        const managerClient = new ManagerClient({
          contractId: config.managerAddress,
          rpcUrl: config.rpcUrl,
          networkPassphrase: config.networkPassphrase,
          publicKey: deployer,
          signTransaction: async (xdr: string, opts?: { networkPassphrase?: string; address?: string }) =>
            StellarWalletsKit.signTransaction(xdr, {
              networkPassphrase: opts?.networkPassphrase ?? config.networkPassphrase,
              address: opts?.address ?? deployer
            })
        });

        const assembled = await managerClient.finalize_dao({
          token_address: tokenAddress,
          launch_auction: launchAuction
        });

        const sent = await assembled.signAndSend();
        const hash = sent.sendTransactionResponse?.hash;

        if (!hash) {
          throw new Error('No transaction hash returned from finalize_dao');
        }

        await waitForConfirmation(hash, config.rpcUrl);

        updateState({
          transactions: { ...state.transactions, finalize: hash }
        });
        markStepComplete('finalizing');
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to finalize DAO');
        setError(error);
        throw error;
      }
    },
    [deployer, state.transactions, setStep, updateState, markStepComplete, setError]
  );

  // Step 7: Wait for indexing (polling)
  const waitForIndexing = useCallback(
    async (tokenAddress: string) => {
      setStep('indexing');

      try {
        let indexed = false;
        let attempts = 0;
        const maxAttempts = 30; // 1 minute max (2s intervals)

        while (!indexed && attempts < maxAttempts) {
          try {
            const response = await fetch(`/api/dao/${tokenAddress}`);
            if (response.ok) {
              indexed = true;
              break;
            }
          } catch {
            // Not indexed yet
          }

          await new Promise((resolve) => setTimeout(resolve, 2000));
          attempts++;
        }

        if (!indexed) {
          console.warn('DAO not indexed within timeout, but deployment completed successfully');
        }

        markStepComplete('indexing');
        setStep('complete');
      } catch (err) {
        // Don't fail on indexing issues - the DAO is deployed
        console.error('Indexing check failed:', err);
        markStepComplete('indexing');
        setStep('complete');
      }
    },
    [setStep, markStepComplete]
  );

  // Main deployment orchestrator
  const deployDao = useCallback(
    async (formData: CreateDaoFormData) => {
      try {
        // Generate nonce
        const nonce = generateNonce();
        updateState({ nonce });

        // Step 1: Predict addresses
        const predictedAddresses = await predictAddresses(nonce);

        // Step 2: Create DAO
        const createdAddresses = await createDao(formData, nonce);

        // Validate addresses match prediction
        if (predictedAddresses.token !== createdAddresses.token) {
          throw new Error('Created token address does not match prediction');
        }

        // Step 3: Accept ownership
        await acceptOwnership(createdAddresses.token);

        // Step 4: Add properties
        await addProperties(createdAddresses.metadata, formData);

        // Step 5: Mint founders
        await mintFounders(createdAddresses.token, formData);

        // Step 6: Finalize
        await finalizeDao(createdAddresses.token, formData.auction.enabled);

        // Step 7: Wait for indexing
        await waitForIndexing(createdAddresses.token);

        return createdAddresses;
      } catch (err) {
        // Error already set by individual steps
        throw err;
      }
    },
    [
      updateState,
      predictAddresses,
      createDao,
      acceptOwnership,
      addProperties,
      mintFounders,
      finalizeDao,
      waitForIndexing
    ]
  );

  return {
    state,
    deployDao,
    reset
  };
}
