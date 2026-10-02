// lib/use-dao-deployment.ts
'use client';

import { Client as ManagerClient, type DaoAddresses } from '@builder-stellar/manager-bindings';
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import { useCallback, useState } from 'react';

import type { CreateDaoFormData } from './create-dao-schema';
import type { DaoNetworkName } from './dao-config';
import { formDataToCreationParams, generateNonce } from './dao-creation-params';
import { getDeploymentConfig } from './deployment-config';
import { waitForConfirmation } from './transaction-confirmation';
import { useTransactionFeedback } from './transaction-feedback';

/**
 * 2-step DAO deployment process:
 * 1. predict - Predict contract addresses (read-only)
 * 2. create - Create DAO contracts (paused, owned by launch_admin)
 *
 * Launch happens later via admin panel after configuration
 */
export type DeploymentStep = 'idle' | 'predicting' | 'creating' | 'complete' | 'error';

export interface DeploymentState {
  currentStep: DeploymentStep;
  completedSteps: Set<DeploymentStep>;
  predictedAddresses: DaoAddresses | null;
  createdAddresses: DaoAddresses | null;
  transactions: {
    create?: string;
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
  transactions: {},
  progress: {
    totalSteps: 2,
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
  complete: 'DAO created successfully!',
  error: 'Deployment failed'
};

const STEP_ORDER: DeploymentStep[] = ['predicting', 'creating'];

export function useDaoDeployment(deployer: string, network: DaoNetworkName) {
  const [state, setState] = useState<DeploymentState>(initialState);
  const tx = useTransactionFeedback(network);

  const updateState = useCallback((updates: Partial<DeploymentState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  }, []);

  const updateTransactions = useCallback(
    (update: (transactions: DeploymentState['transactions']) => DeploymentState['transactions']) => {
      setState((prev) => ({ ...prev, transactions: update(prev.transactions) }));
    },
    []
  );

  const setStep = useCallback((step: DeploymentStep) => {
    const stepIndex = STEP_ORDER.indexOf(step);
    setState((prev) => ({
      ...prev,
      currentStep: step,
      progress: {
        ...prev.progress,
        currentStepIndex: stepIndex >= 0 ? stepIndex + 1 : step === 'complete' ? prev.progress.totalSteps : 0,
        currentStepLabel: STEP_LABELS[step]
      }
    }));
  }, []);

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
        tx.start('Creating DAO...');
        const sent = await assembled.signAndSend();
        const hash = sent.sendTransactionResponse?.hash;

        if (!hash) {
          throw new Error('No transaction hash returned from create_dao');
        }

        tx.submitted('DAO creation submitted', hash);
        await waitForConfirmation(hash, config.rpcUrl);
        tx.success('DAO created', hash);

        if (!assembled.result) {
          throw new Error('No result from create_dao transaction');
        }

        const addresses = assembled.result.unwrap();

        updateState({ createdAddresses: addresses });
        updateTransactions((transactions) => ({ ...transactions, create: hash }));
        markStepComplete('creating');

        return addresses;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to create DAO');
        tx.fail(error, 'DAO creation failed');
        setError(error);
        throw error;
      }
    },
    [deployer, setStep, updateState, updateTransactions, markStepComplete, setError, tx]
  );

  // Launch DAO - called from admin panel after checklist completion
  // This transitions the DAO from 'pending' to 'operational' state
  const launchDao = useCallback(
    async (tokenAddress: string, launchConfig: { launch_auction: boolean; launch_marketplace: boolean }) => {
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

        const assembled = await managerClient.launch_dao({
          token_address: tokenAddress,
          launch_config: launchConfig
        });

        tx.start('Launching DAO...');
        const sent = await assembled.signAndSend();
        const hash = sent.sendTransactionResponse?.hash;

        if (!hash) {
          throw new Error('No transaction hash returned from launch_dao');
        }

        tx.submitted('DAO launch submitted', hash);
        await waitForConfirmation(hash, config.rpcUrl);
        tx.success('DAO launched', hash);
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to launch DAO');
        tx.fail(error, 'DAO launch failed');
        throw error;
      }
    },
    [deployer, tx]
  );

  // Main deployment orchestrator
  const deployDao = useCallback(
    async (formData: CreateDaoFormData) => {
      try {
        if (formData.launchAdmin !== deployer) {
          throw new Error('Launch admin must match the connected deployer wallet');
        }

        // Generate nonce
        const nonce = generateNonce();
        updateState({ nonce });

        // Step 1: Predict addresses
        const predictedAddresses = await predictAddresses(nonce);

        // Substitute {daoId} placeholder with predicted token address
        const updatedFormData: CreateDaoFormData = {
          ...formData,
          basicInfo: {
            ...formData.basicInfo,
            tokenUri: formData.basicInfo.tokenUri.replace('{daoId}', predictedAddresses.token),
            rendererBase: formData.basicInfo.rendererBase.replace('{daoId}', predictedAddresses.token)
          }
        };

        // Step 2: Create DAO (contracts paused, owned by launch_admin)
        const createdAddresses = await createDao(updatedFormData, nonce);

        // Validate addresses match prediction
        if (predictedAddresses.token !== createdAddresses.token) {
          throw new Error('Created token address does not match prediction');
        }

        // Store launch_admin in localStorage for DAO page to detect admin mode
        const storageKey = `dao_launch_admin_${createdAddresses.token}`;
        localStorage.setItem(storageKey, deployer);

        // Mark complete - user will configure and launch via admin panel
        setStep('complete');

        return createdAddresses;
      } catch (err) {
        // Error already set by individual steps
        throw err;
      }
    },
    [deployer, updateState, predictAddresses, createDao, setStep]
  );

  return {
    state,
    deployDao,
    launchDao,
    reset
  };
}
