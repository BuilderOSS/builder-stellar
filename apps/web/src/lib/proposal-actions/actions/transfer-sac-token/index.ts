// src/lib/proposal-actions/actions/transfer-sac-token/index.ts

import { getTreasuryAssets } from '@/lib/assets-config';

import type { ActionHandler } from '../../types';
import { TransferSacTokenForm } from './component';
import type { TransferSacTokenData } from './types';
import { validateTransferSacToken } from './validator';

export const transferSacTokenHandler: ActionHandler<TransferSacTokenData> = {
  type: 'transfer-sac-token',
  label: 'Transfer SAC Token',
  description: 'Transfer tokens from the treasury to a recipient',
  order: 3,
  group: 'Treasury',

  FormComponent: TransferSacTokenForm,

  getDefaultValues: () => ({
    recipient: '',
    amount: '',
    assetCode: ''
  }),

  validate: validateTransferSacToken,

  serialize: (data, context) => {
    // Get treasury assets for the current network
    const assets = getTreasuryAssets(context.config.name);
    const asset = assets.find((a) => a.code === data.assetCode);

    return {
      id: crypto.randomUUID(),
      type: 'transfer-sac-token',
      recipient: data.recipient.trim(),
      amount: data.amount.trim(),
      assetCode: data.assetCode,
      assetContractId: asset?.contractId
    };
  },

  deserialize: (action) => ({
    recipient: action.recipient || '',
    amount: action.amount || '',
    assetCode: action.assetCode || ''
  }),

  buildCallVector: (data, context) => {
    // Get treasury assets for building the call
    const assets = getTreasuryAssets(context.config.name);
    const asset = assets.find((a) => a.code === data.assetCode);

    if (!asset?.contractId) {
      throw new Error(`No contract ID for asset: ${data.assetCode}`);
    }

    // Convert decimal to stroops (multiply by 10^7)
    const stroops = BigInt(Math.round(parseFloat(data.amount) * 10_000_000));

    return {
      target: asset.contractId,
      function: 'transfer',
      args: [context.treasuryAddress, data.recipient.trim(), stroops.toString()]
    };
  },

  requiresMintAuthority: false
};
