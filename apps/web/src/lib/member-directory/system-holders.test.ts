import { describe, expect, it } from 'vitest';

import { systemHolderName } from './system-holders';

describe('systemHolderName', () => {
  const config = { treasuryContractId: 'CTREASURY', auctionContractId: '', marketplaceContractId: 'CMARKET' };

  it('names the tribe’s own contracts (BUG-W11-6)', () => {
    expect(systemHolderName(config, 'CTREASURY')).toBe('Treasury');
    expect(systemHolderName(config, 'CMARKET')).toBe('Marketplace');
  });

  it('leaves members and a missing module alone', () => {
    expect(systemHolderName(config, 'GMEMBER')).toBeNull();
    expect(systemHolderName(config, '')).toBeNull();
    expect(systemHolderName(config, null)).toBeNull();
  });
});
