import { Account, Keypair, Operation, TransactionBuilder } from '@stellar/stellar-sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  confirmCreationTransaction,
  DefinitiveTransactionFailure,
  pollCreatedDao,
  useDaoDeployment
} from '@/lib/use-dao-deployment';
import { useAuthSessionStore } from '@/stores/auth-session-store';
import { defaultConfiguration, useCreateDaoStore } from '@/stores/create-dao-store';
import { preferenceScopeKey, useLocalPreferencesStore } from '@/stores/local-preferences-store';

import { creationConfigurationFingerprint } from './deployment-transaction';

const mocks = vi.hoisted(() => ({
  predict: vi.fn(),
  create: vi.fn(),
  pending: vi.fn(),
  launch: vi.fn(),
  sign: vi.fn(),
  send: vi.fn(),
  getTransaction: vi.fn(),
  preflight: vi.fn(),
  preparedXdr: vi.fn(),
  tx: { start: vi.fn(), submitted: vi.fn(), success: vi.fn(), fail: vi.fn() }
}));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useRef: (value: unknown) => ({ current: value }),
  useState: (value: unknown) => [value, vi.fn()]
}));
vi.mock('@/lib/transaction-feedback', () => ({ useTransactionFeedback: () => mocks.tx }));
vi.mock('@creit.tech/stellar-wallets-kit/sdk', () => ({ StellarWalletsKit: { signTransaction: mocks.sign } }));
vi.mock('@stellar/stellar-sdk/rpc', () => ({
  Server: class {
    getTransaction = mocks.getTransaction;
    sendTransaction = mocks.send;
  }
}));
vi.mock('@/lib/deployment-config', () => ({
  getDeploymentConfig: () => ({
    name: 'testnet',
    managerAddress: 'manager-A',
    rpcUrl: 'https://rpc.test',
    networkPassphrase: 'Test SDF Network ; September 2015'
  })
}));
vi.mock('@builder-stellar/manager-bindings', () => ({
  Client: class {
    predict_addresses = mocks.predict;
    get_pending_dao = mocks.pending;
    create_dao = async (params: unknown) => {
      mocks.create(params);
      return {
        result: {
          unwrap: () => {
            mocks.preflight();
            return { token: 'SIMULATED-NOT-CONFIRMED' };
          }
        },
        simulationData: {},
        needsNonInvokerSigningBy: () => [],
        toXdr: mocks.preparedXdr
      };
    };
    launch_dao = async (params: unknown) => {
      mocks.launch(params);
      return {
        result: { unwrap: () => null },
        simulationData: {},
        needsNonInvokerSigningBy: () => [],
        toXdr: mocks.preparedXdr
      };
    };
  }
}));
const keypair = Keypair.random();
const wallet = keypair.publicKey();
const networkPassphrase = 'Test SDF Network ; September 2015';
function fixture(value = 'expected', sequence = '1') {
  return new TransactionBuilder(new Account(wallet, sequence), { fee: '100', networkPassphrase })
    .addOperation(Operation.manageData({ name: 'offline recovery fixture', value }))
    .setTimeout(180)
    .build();
}
const unsigned = fixture();
const xdr = unsigned.toXDR();
const signedFixture = TransactionBuilder.fromXDR(xdr, networkPassphrase);
signedFixture.sign(keypair); // Offline fixture only, not a live wallet or deployment.
const signedXdr = signedFixture.toXDR();
const expiresAt = Number(unsigned.timeBounds!.maxTime);
const hash = Array.from(TransactionBuilder.fromXDR(xdr, networkPassphrase).hash(), (byte) =>
  byte.toString(16).padStart(2, '0')
).join('');
const addresses = {
  token: 'dao-A',
  auction: 'auction-A',
  marketplace: 'market-A',
  metadata: 'metadata-A',
  treasury: 'treasury-A',
  governor: 'gov-A'
};
const storage = new Map<string, string>();
const localStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key)
};
let draftId: string;
const formData = () => ({
  ...useCreateDaoStore.getState().drafts.find((d) => d.id === draftId)!.configuration,
  launchAdmin: wallet
});
beforeEach(async () => {
  vi.clearAllMocks();
  vi.useRealTimers();
  storage.clear();
  vi.stubGlobal('window', { localStorage });
  vi.stubGlobal('navigator', {
    locks: { request: vi.fn(async (_name, _options, callback) => callback({ name: 'lock' })) }
  });
  await useCreateDaoStore.persist.rehydrate();
  useCreateDaoStore.setState({ ...defaultConfiguration(), drafts: [], activeDraftId: null });
  useLocalPreferencesStore.setState({ homes: {}, launches: {} });
  useAuthSessionStore.getState().updateSession({
    address: wallet,
    authStatus: 'authenticated',
    walletNetworkPassphrase: networkPassphrase,
    walletNetworkIssue: ''
  });
  draftId = useCreateDaoStore.getState().newDraft({ network: 'testnet', deployment: 'manager-A', wallet: null });
  useCreateDaoStore.getState().updateBasicInfo({
    tokenName: 'Builders',
    tokenSymbol: 'BUILD',
    slug: 'builders',
    description: 'A community of builders.'
  });
  mocks.predict.mockResolvedValue({ result: { unwrap: () => addresses } });
  mocks.pending.mockResolvedValue({ result: null });
  mocks.preparedXdr.mockReturnValue(xdr);
  mocks.sign.mockResolvedValue({ signedTxXdr: signedXdr, signerAddress: wallet });
  mocks.send.mockResolvedValue({ status: 'PENDING', hash });
  mocks.getTransaction.mockResolvedValue({ status: 'SUCCESS' });
  mocks.preflight.mockImplementation(() => undefined);
});
describe('signed deployment recovery', () => {
  const missing = () => ({ status: 'NOT_FOUND', latestLedgerCloseTime: Math.floor(Date.now() / 1000) });
  function nextEnvelope() {
    const tx = fixture('expected', '2');
    const requested = tx.toXDR();
    tx.sign(keypair);
    const signed = tx.toXDR();
    const newHash = Array.from(tx.hash(), (b) => b.toString(16).padStart(2, '0')).join('');
    mocks.preparedXdr.mockReturnValue(requested);
    mocks.sign.mockResolvedValue({ signedTxXdr: signed, signerAddress: wallet });
    mocks.send.mockResolvedValue({ status: 'PENDING', hash: newHash });
    return { signed, newHash };
  }
  it('never signs simply by opening the deployment hook', () => {
    useDaoDeployment(wallet, 'testnet');
    expect(mocks.sign).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('surfaces a failed simulation before asking the wallet to sign', async () => {
    mocks.preflight.mockImplementationOnce(() => {
      throw new Error('Factory preflight rejected');
    });
    await expect(useDaoDeployment(wallet, 'testnet').deployDao(formData(), draftId)).rejects.toThrow(
      'preflight rejected'
    );
    expect(mocks.sign).not.toHaveBeenCalled();
    expect(mocks.tx.success).not.toHaveBeenCalled();
  });
  it('persists nonce, addresses, and signed hash before transmission; confirms actual RPC success', async () => {
    mocks.send.mockImplementationOnce(() => {
      expect(useCreateDaoStore.getState().drafts[0].deployment).toMatchObject({
        hash,
        addresses,
        status: 'signed',
        signedTxXdr: signedXdr,
        expiresAt,
        deployer: wallet
      });
      expect(storage.size).toBeGreaterThan(0);
      return { status: 'PENDING', hash };
    });
    expect(await useDaoDeployment(wallet, 'testnet').deployDao(formData(), draftId)).toEqual(addresses);
    expect(useCreateDaoStore.getState().drafts[0].deployment?.status).toBe('confirmed');
    expect(mocks.getTransaction).toHaveBeenCalledWith(hash);
    expect(mocks.tx.success).toHaveBeenCalledWith('DAO created in Setup', hash);
  });
  it('does not claim success from the simulated result when transmission outcome is unknown', async () => {
    mocks.send.mockRejectedValueOnce(new Error('Network interrupted'));
    await expect(useDaoDeployment(wallet, 'testnet').deployDao(formData(), draftId)).rejects.toThrow('interrupted');
    expect(useCreateDaoStore.getState().drafts[0].deployment?.status).toBe('signed');
    expect(mocks.tx.success).not.toHaveBeenCalled();
    await expect(useDaoDeployment(wallet, 'testnet').deployDao(formData(), draftId)).resolves.toEqual(addresses);
    expect(mocks.sign).toHaveBeenCalledTimes(1);
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });
  it('recovers a confirmed creation without generating a new nonce or signing', async () => {
    useCreateDaoStore
      .getState()
      .recordDeployment(draftId, { nonce: '987', deployer: wallet, addresses, hash, status: 'confirmed' });
    await expect(useDaoDeployment(wallet, 'testnet').deployDao(formData(), draftId)).resolves.toEqual(addresses);
    expect(mocks.predict).not.toHaveBeenCalled();
    expect(mocks.sign).not.toHaveBeenCalled();
  });
  it('recovers actual pending Manager state even if the saved transaction has aged out of RPC history', async () => {
    useCreateDaoStore
      .getState()
      .recordDeployment(draftId, { nonce: '987', deployer: wallet, addresses, hash, status: 'submitted' });
    mocks.pending.mockResolvedValueOnce({ result: { addresses, launch_admin: wallet } });
    mocks.getTransaction.mockResolvedValue({ status: 'NOT_FOUND' });
    expect(await useDaoDeployment(wallet, 'testnet').deployDao(formData(), draftId)).toEqual(addresses);
    expect(mocks.getTransaction).not.toHaveBeenCalled();
    expect(mocks.sign).not.toHaveBeenCalled();
    expect(useCreateDaoStore.getState().drafts[0].deployment?.status).toBe('confirmed');
    expect(useCreateDaoStore.getState().drafts[0].deployment?.confirmedBy).toBe('manager-state');
    expect(mocks.tx.success).not.toHaveBeenCalled();
  });
  it('rejects mismatched recovery addresses instead of claiming success', async () => {
    useCreateDaoStore
      .getState()
      .recordDeployment(draftId, { nonce: '987', deployer: wallet, addresses, status: 'prepared' });
    mocks.pending.mockResolvedValueOnce({
      result: { addresses: { ...addresses, token: 'dao-B' }, launch_admin: wallet }
    });
    await expect(useDaoDeployment(wallet, 'testnet').deployDao(formData(), draftId)).rejects.toThrow(
      'saved prediction'
    );
    expect(mocks.sign).not.toHaveBeenCalled();
    expect(mocks.tx.success).not.toHaveBeenCalled();
  });
  it('retries a rejected wallet operation with the original nonce and configuration', async () => {
    mocks.sign.mockRejectedValueOnce(new Error('User rejected'));
    await expect(useDaoDeployment(wallet, 'testnet').deployDao(formData(), draftId)).rejects.toThrow('rejected');
    const nonce = useCreateDaoStore.getState().drafts[0].deployment!.nonce;
    await useDaoDeployment(wallet, 'testnet').deployDao(formData(), draftId);
    expect(mocks.predict.mock.calls[1][0].nonce).toBe(BigInt(nonce));
    expect(useCreateDaoStore.getState().drafts[0].deployment!.nonce).toBe(nonce);
  });
  it('treats RPC FAILED as definitive and does not poll it until timeout', async () => {
    mocks.getTransaction.mockResolvedValueOnce({ status: 'FAILED' });
    await expect(useDaoDeployment(wallet, 'testnet').deployDao(formData(), draftId)).rejects.toBeInstanceOf(
      DefinitiveTransactionFailure
    );
    expect(useCreateDaoStore.getState().drafts[0].deployment?.status).toBe('failed');
    expect(mocks.getTransaction).toHaveBeenCalledTimes(1);
    expect(mocks.tx.success).not.toHaveBeenCalled();
  });
  it('keeps unknown confirmation recoverable instead of resubmitting', async () => {
    mocks.getTransaction.mockRejectedValueOnce(new Error('RPC unavailable'));
    await expect(useDaoDeployment(wallet, 'testnet').deployDao(formData(), draftId)).rejects.toThrow('RPC unavailable');
    expect(useCreateDaoStore.getState().drafts[0].deployment?.status).toBe('submitted');
  });
  it('blocks a second tab, a different wallet, and a mismatched network before signing', async () => {
    vi.stubGlobal('navigator', {
      locks: { request: async (_name: string, _options: unknown, callback: (lock: null) => unknown) => callback(null) }
    });
    await expect(useDaoDeployment(wallet, 'testnet').deployDao(formData(), draftId)).rejects.toThrow('another tab');
    vi.stubGlobal('navigator', {
      locks: { request: async (_name: string, _options: unknown, callback: (lock: object) => unknown) => callback({}) }
    });
    await expect(
      useDaoDeployment(Keypair.random().publicKey(), 'testnet').deployDao(formData(), draftId)
    ).rejects.toThrow('administrator wallet');
    await expect(useDaoDeployment(wallet, 'public').deployDao(formData(), draftId)).rejects.toThrow('network');
    expect(mocks.sign).not.toHaveBeenCalled();
  });
  it('uses actual selected launch modules, stores launch hash before send and does not sign again on recovery', async () => {
    mocks.pending.mockResolvedValue({ result: { launch_admin: wallet, addresses } });
    const hook = useDaoDeployment(wallet, 'testnet');
    const choice = { launch_auction: false, launch_marketplace: true, enable_minter: false };
    mocks.send.mockRejectedValueOnce(new Error('Transmission interrupted'));
    await expect(hook.launchDao('dao-A', choice)).rejects.toThrow('interrupted');
    const key = `${preferenceScopeKey({ network: 'testnet', deployment: 'manager-A', wallet })}:dao-A`;
    expect(useLocalPreferencesStore.getState().launches[key]).toMatchObject({
      auction: false,
      marketplace: true,
      hash,
      status: 'signed',
      signedTxXdr: signedXdr,
      expiresAt
    });
    await hook.launchDao('dao-A', choice);
    expect(mocks.launch).toHaveBeenCalledWith({
      token_address: 'dao-A',
      launch_config: { ...choice, expected_minter: null }
    });
    expect(mocks.sign).toHaveBeenCalledTimes(1);
    expect(useLocalPreferencesStore.getState().launches[key].status).toBe('confirmed');
  });
  it('requires an explicitly reviewed platform minter', async () => {
    mocks.pending.mockResolvedValue({ result: { launch_admin: wallet, addresses } });
    await expect(
      useDaoDeployment(wallet, 'testnet').launchDao('dao-A', {
        launch_auction: false,
        launch_marketplace: false,
        enable_minter: true
      })
    ).rejects.toThrow('Review');
    expect(mocks.sign).not.toHaveBeenCalled();
  });
  it('keeps a transport failure signed/unaccepted and only explicitly rebroadcasts the exact saved envelope', async () => {
    mocks.send.mockRejectedValueOnce(new Error('Transport lost before acceptance response'));
    await expect(useDaoDeployment(wallet, 'testnet').deployDao(formData(), draftId)).rejects.toThrow('Transport lost');
    const saved = useCreateDaoStore.getState().drafts[0].deployment!;
    expect(saved).toMatchObject({ status: 'signed', signedTxXdr: signedXdr, hash, expiresAt });
    expect(saved.acceptedAt).toBeUndefined();
    mocks.getTransaction.mockResolvedValueOnce(missing());
    await expect(useDaoDeployment(wallet, 'testnet').deployDao(formData(), draftId)).rejects.toThrow(
      'explicitly rebroadcast'
    );
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.sign).toHaveBeenCalledTimes(1);
    mocks.getTransaction.mockResolvedValueOnce(missing()).mockResolvedValue({ status: 'SUCCESS' });
    await useDaoDeployment(wallet, 'testnet').deployDao(formData(), draftId, { rebroadcast: true });
    expect(mocks.send).toHaveBeenCalledTimes(2);
    expect(mocks.send.mock.calls[1][0].toXDR()).toBe(signedXdr);
    expect(mocks.sign).toHaveBeenCalledTimes(1);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(useCreateDaoStore.getState().drafts[0].deployment).toMatchObject({
      nonce: saved.nonce,
      status: 'confirmed',
      hash
    });
  });
  it('does not classify TRY_AGAIN_LATER as accepted or failed and can rebroadcast it without signing again', async () => {
    mocks.send.mockResolvedValueOnce({ status: 'TRY_AGAIN_LATER', hash });
    await expect(useDaoDeployment(wallet, 'testnet').deployDao(formData(), draftId)).rejects.toThrow('did not accept');
    expect(useCreateDaoStore.getState().drafts[0].deployment?.status).toBe('signed');
    expect(mocks.tx.submitted).not.toHaveBeenCalled();
    mocks.getTransaction.mockResolvedValueOnce(missing()).mockResolvedValue({ status: 'SUCCESS' });
    await useDaoDeployment(wallet, 'testnet').deployDao(formData(), draftId, { rebroadcast: true });
    expect(mocks.sign).toHaveBeenCalledTimes(1);
  });
  it('unlocks a definitive RPC rejection for an explicit same-nonce retry after fresh PendingDao checks', async () => {
    mocks.send.mockResolvedValueOnce({ status: 'ERROR', hash });
    await expect(useDaoDeployment(wallet, 'testnet').deployDao(formData(), draftId)).rejects.toThrow('RPC rejected');
    const first = useCreateDaoStore.getState().drafts[0].deployment!;
    expect(first.status).toBe('rejected');
    expect(first.acceptedAt).toBeUndefined();
    const pendingReads = mocks.pending.mock.calls.length;
    mocks.getTransaction.mockResolvedValueOnce(missing()).mockResolvedValue({ status: 'SUCCESS' });
    nextEnvelope();
    await useDaoDeployment(wallet, 'testnet').deployDao(formData(), draftId);
    expect(mocks.pending.mock.calls.length).toBeGreaterThan(pendingReads);
    expect(mocks.create.mock.calls[1][0].params.nonce).toBe(BigInt(first.nonce));
    expect(useCreateDaoStore.getState().drafts[0].deployment?.configurationFingerprint).toBe(
      first.configurationFingerprint
    );
    expect(mocks.sign).toHaveBeenCalledTimes(2);
  });
  it('marks a signed NOT_FOUND envelope expired using indexed ledger time, then explicitly rebuilds with the same frozen nonce', async () => {
    mocks.send.mockRejectedValueOnce(new Error('Transport interrupted'));
    await expect(useDaoDeployment(wallet, 'testnet').deployDao(formData(), draftId)).rejects.toThrow('interrupted');
    const original = useCreateDaoStore.getState().drafts[0].deployment!;
    mocks.getTransaction.mockResolvedValueOnce({ status: 'NOT_FOUND', latestLedgerCloseTime: expiresAt + 1 });
    await expect(useDaoDeployment(wallet, 'testnet').deployDao(formData(), draftId)).rejects.toThrow('expired');
    expect(useCreateDaoStore.getState().drafts[0].deployment?.status).toBe('expired');
    expect(mocks.sign).toHaveBeenCalledTimes(1);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    nextEnvelope();
    mocks.getTransaction
      .mockResolvedValueOnce({ status: 'NOT_FOUND', latestLedgerCloseTime: expiresAt + 1 })
      .mockResolvedValue({ status: 'SUCCESS' });
    await useDaoDeployment(wallet, 'testnet').deployDao(formData(), draftId);
    expect(mocks.create.mock.calls[1][0].params.nonce).toBe(BigInt(original.nonce));
    expect(useCreateDaoStore.getState().drafts[0].deployment?.configurationFingerprint).toBe(
      original.configurationFingerprint
    );
  });
  it('does not use the browser clock to rebuild while the ledger may still execute an accepted envelope', async () => {
    mocks.getTransaction.mockRejectedValueOnce(new Error('RPC temporarily unavailable'));
    await expect(useDaoDeployment(wallet, 'testnet').deployDao(formData(), draftId)).rejects.toThrow('unavailable');
    vi.useFakeTimers();
    vi.setSystemTime((expiresAt + 20) * 1000);
    mocks.getTransaction
      .mockResolvedValueOnce({ status: 'NOT_FOUND', latestLedgerCloseTime: expiresAt - 1 })
      .mockResolvedValue({ status: 'SUCCESS' });
    await useDaoDeployment(wallet, 'testnet').deployDao(formData(), draftId);
    expect(mocks.sign).toHaveBeenCalledTimes(1);
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  it('waits for an accepted but delayed transaction without resubmitting or signing', async () => {
    vi.useFakeTimers();
    mocks.getTransaction.mockResolvedValueOnce(missing()).mockResolvedValue({ status: 'SUCCESS' });
    const operation = useDaoDeployment(wallet, 'testnet').deployDao(formData(), draftId);
    const expected = expect(operation).resolves.toEqual(addresses);
    await vi.advanceTimersByTimeAsync(2000);
    await expected;
    expect(mocks.sign).toHaveBeenCalledTimes(1);
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(useCreateDaoStore.getState().drafts[0].deployment?.acceptedAt).toBeDefined();
  });
  it('does not downgrade an accepted envelope when a subsequent rebroadcast is rejected', async () => {
    mocks.getTransaction.mockRejectedValueOnce(new Error('RPC unavailable'));
    await expect(useDaoDeployment(wallet, 'testnet').deployDao(formData(), draftId)).rejects.toThrow('unavailable');
    mocks.getTransaction.mockResolvedValueOnce(missing());
    mocks.send.mockResolvedValueOnce({ status: 'ERROR', hash });
    await expect(
      useDaoDeployment(wallet, 'testnet').deployDao(formData(), draftId, { rebroadcast: true })
    ).rejects.toThrow('RPC rejected');
    expect(useCreateDaoStore.getState().drafts[0].deployment?.status).toBe('submitted');
    expect(mocks.sign).toHaveBeenCalledTimes(1);
  });
  it('requires successful fresh Manager state before retrying a rejected attempt', async () => {
    mocks.send.mockResolvedValueOnce({ status: 'ERROR', hash });
    await expect(useDaoDeployment(wallet, 'testnet').deployDao(formData(), draftId)).rejects.toThrow('rejected');
    mocks.pending.mockRejectedValueOnce(new Error('Manager read unavailable'));
    await expect(useDaoDeployment(wallet, 'testnet').deployDao(formData(), draftId)).rejects.toThrow(
      'Manager read unavailable'
    );
    expect(mocks.sign).toHaveBeenCalledTimes(1);
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });
  it('reconciles actual pending DAO state instead of rebroadcasting an expired envelope or creating twice', async () => {
    mocks.send.mockRejectedValueOnce(new Error('Transport interrupted'));
    await expect(useDaoDeployment(wallet, 'testnet').deployDao(formData(), draftId)).rejects.toThrow('interrupted');
    mocks.pending.mockResolvedValueOnce({ result: { addresses, launch_admin: wallet } });
    await useDaoDeployment(wallet, 'testnet').deployDao(formData(), draftId, { rebroadcast: true });
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.sign).toHaveBeenCalledTimes(1);
    expect(useCreateDaoStore.getState().drafts[0].deployment?.confirmedBy).toBe('manager-state');
  });
  it('stops a cross-tab edit between review and lock acquisition before generating a nonce or calling the wallet', async () => {
    const reviewed = structuredClone(formData());
    vi.stubGlobal('navigator', {
      locks: {
        request: async (_name: string, _options: unknown, callback: (lock: object) => unknown) => {
          useCreateDaoStore.getState().updateAuction({ reservePrice: '25' });
          return callback({});
        }
      }
    });
    await expect(useDaoDeployment(wallet, 'testnet').deployDao(reviewed, draftId)).rejects.toThrow(
      'Refresh and review'
    );
    expect(mocks.sign).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.predict).not.toHaveBeenCalled();
    expect(useCreateDaoStore.getState().drafts[0].deployment).toBeUndefined();
  });
  it('uses a normalized immutable reviewed configuration without hashing derived launchAdmin', async () => {
    const reviewed = structuredClone(formData());
    reviewed.auction.reservePrice = '1.0000000';
    reviewed.basicInfo.tokenName = ' Builders ';
    expect(creationConfigurationFingerprint(reviewed)).toBe(creationConfigurationFingerprint(formData()));
    await useDaoDeployment(wallet, 'testnet').deployDao(reviewed, draftId);
    const record = useCreateDaoStore.getState().drafts[0].deployment!;
    expect(record.configuration?.auction.reservePrice).toBe('1');
    expect(record.configuration?.basicInfo.tokenName).toBe('Builders');
    expect(record.configurationFingerprint).toBe(creationConfigurationFingerprint(formData()));
  });
  it('rejects a wallet-modified transaction body before saving a hash or transmitting', async () => {
    const changed = fixture('wallet changed operation');
    changed.sign(keypair);
    mocks.sign.mockResolvedValueOnce({ signedTxXdr: changed.toXDR(), signerAddress: wallet });
    await expect(useDaoDeployment(wallet, 'testnet').deployDao(formData(), draftId)).rejects.toThrow('wallet changed');
    expect(mocks.send).not.toHaveBeenCalled();
    expect(useCreateDaoStore.getState().drafts[0].deployment?.hash).toBeUndefined();
  });
  it('rejects a mismatched RPC hash and does not infer acceptance from it', async () => {
    mocks.send.mockResolvedValueOnce({ status: 'PENDING', hash: 'different hash' });
    await expect(useDaoDeployment(wallet, 'testnet').deployDao(formData(), draftId)).rejects.toThrow(
      'different transaction hash'
    );
    expect(useCreateDaoStore.getState().drafts[0].deployment).toMatchObject({ status: 'signed', hash });
    expect(useCreateDaoStore.getState().drafts[0].deployment?.acceptedAt).toBeUndefined();
    expect(mocks.tx.success).not.toHaveBeenCalled();
  });
  it('validates the saved envelope hash again before recovery or rebroadcast', async () => {
    mocks.send.mockRejectedValueOnce(new Error('Interrupted'));
    await expect(useDaoDeployment(wallet, 'testnet').deployDao(formData(), draftId)).rejects.toThrow('Interrupted');
    const store = useCreateDaoStore.getState();
    const record = store.drafts[0].deployment!;
    store.recordDeployment(draftId, { ...record, signedTxXdr: fixture('tampered stored body').toXDR() });
    await expect(
      useDaoDeployment(wallet, 'testnet').deployDao(formData(), draftId, { rebroadcast: true })
    ).rejects.toThrow('does not match');
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.sign).toHaveBeenCalledTimes(1);
  });
  it('applies exact-envelope transport recovery and explicit replay to launch as well', async () => {
    mocks.pending.mockResolvedValue({ result: { launch_admin: wallet, addresses } });
    const choice = { launch_auction: false, launch_marketplace: true, enable_minter: false };
    mocks.send.mockRejectedValueOnce(new Error('Launch transmission lost'));
    await expect(useDaoDeployment(wallet, 'testnet').launchDao('dao-A', choice)).rejects.toThrow('transmission lost');
    mocks.getTransaction.mockResolvedValueOnce(missing());
    await expect(useDaoDeployment(wallet, 'testnet').launchDao('dao-A', choice)).rejects.toThrow(
      'Explicitly rebroadcast'
    );
    expect(mocks.send).toHaveBeenCalledTimes(1);
    mocks.getTransaction.mockResolvedValueOnce(missing()).mockResolvedValue({ status: 'SUCCESS' });
    await useDaoDeployment(wallet, 'testnet').launchDao('dao-A', choice, { rebroadcast: true });
    expect(mocks.sign).toHaveBeenCalledTimes(1);
    expect(mocks.send.mock.calls[1][0].toXDR()).toBe(signedXdr);
  });
  it('checks pending launch ownership again before rebuilding an expired launch envelope', async () => {
    mocks.pending.mockResolvedValue({ result: { launch_admin: wallet, addresses } });
    const choice = { launch_auction: true, launch_marketplace: false, enable_minter: false };
    mocks.send.mockRejectedValueOnce(new Error('Interrupted'));
    await expect(useDaoDeployment(wallet, 'testnet').launchDao('dao-A', choice)).rejects.toThrow('Interrupted');
    mocks.getTransaction.mockResolvedValueOnce({ status: 'NOT_FOUND', latestLedgerCloseTime: expiresAt + 1 });
    await expect(useDaoDeployment(wallet, 'testnet').launchDao('dao-A', choice)).rejects.toThrow('expired');
    nextEnvelope();
    mocks.getTransaction.mockResolvedValueOnce(missing()).mockResolvedValue({ status: 'SUCCESS' });
    await useDaoDeployment(wallet, 'testnet').launchDao('dao-A', choice);
    expect(mocks.launch).toHaveBeenCalledTimes(2);
    expect(mocks.sign).toHaveBeenCalledTimes(2);
    expect(mocks.pending).toHaveBeenCalledTimes(3);
  });
  it('blocks a launch retry if the DAO is no longer pending, without claiming success from absence', async () => {
    mocks.pending.mockResolvedValueOnce({ result: { launch_admin: wallet, addresses } });
    const choice = { launch_auction: false, launch_marketplace: true, enable_minter: false };
    mocks.send.mockResolvedValueOnce({ status: 'ERROR', hash });
    await expect(useDaoDeployment(wallet, 'testnet').launchDao('dao-A', choice)).rejects.toThrow('RPC rejected');
    mocks.getTransaction.mockResolvedValueOnce(missing());
    mocks.pending.mockResolvedValueOnce({ result: null });
    await expect(useDaoDeployment(wallet, 'testnet').launchDao('dao-A', choice)).rejects.toThrow(
      'does not own a pending DAO'
    );
    expect(mocks.sign).toHaveBeenCalledTimes(1);
    expect(mocks.tx.success).not.toHaveBeenCalled();
  });
  it('rejects wallet mutation during launch before transmission', async () => {
    mocks.pending.mockResolvedValueOnce({ result: { launch_admin: wallet, addresses } });
    const changed = fixture('changed launch');
    changed.sign(keypair);
    mocks.sign.mockResolvedValueOnce({ signedTxXdr: changed.toXDR(), signerAddress: wallet });
    await expect(
      useDaoDeployment(wallet, 'testnet').launchDao('dao-A', {
        launch_auction: true,
        launch_marketplace: false,
        enable_minter: false
      })
    ).rejects.toThrow('wallet changed');
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it('does not silently replay a saved minter approval when the current reviewed minter differs', async () => {
    mocks.pending.mockResolvedValue({ result: { launch_admin: wallet, addresses } });
    const choice = {
      launch_auction: false,
      launch_marketplace: true,
      enable_minter: true,
      expected_minter: 'reviewed-minter-A'
    };
    mocks.send.mockRejectedValueOnce(new Error('Interrupted'));
    await expect(useDaoDeployment(wallet, 'testnet').launchDao('dao-A', choice)).rejects.toThrow('Interrupted');
    await expect(
      useDaoDeployment(wallet, 'testnet').launchDao(
        'dao-A',
        { ...choice, expected_minter: 'new-minter-B' },
        { rebroadcast: true }
      )
    ).rejects.toThrow('saved launch review differs');
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.sign).toHaveBeenCalledTimes(1);
  });
  it('never invents an envelope or signs afresh when explicitly replaying an older hash-only receipt', async () => {
    useCreateDaoStore
      .getState()
      .recordDeployment(draftId, { nonce: '123', deployer: wallet, addresses, hash, status: 'submitted' });
    mocks.getTransaction.mockResolvedValueOnce(missing());
    await expect(
      useDaoDeployment(wallet, 'testnet').deployDao(formData(), draftId, { rebroadcast: true })
    ).rejects.toThrow('older receipt');
    expect(mocks.sign).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
    expect(useCreateDaoStore.getState().drafts[0].deployment?.nonce).toBe('123');
  });
  it('stops launch choices changed by another tab before calling the wallet', async () => {
    const choice = { launch_auction: false, launch_marketplace: true, enable_minter: false };
    const key = `${preferenceScopeKey({ network: 'testnet', deployment: 'manager-A', wallet })}:dao-A`;
    useLocalPreferencesStore.getState().setLaunch(key, { auction: true, marketplace: false, minter: false });
    await expect(useDaoDeployment(wallet, 'testnet').launchDao('dao-A', choice)).rejects.toThrow(
      'Launch choices changed'
    );
    expect(mocks.sign).not.toHaveBeenCalled();
    expect(mocks.launch).not.toHaveBeenCalled();
  });
  it('rebuilds a rejected launch only after fresh pending ownership verification', async () => {
    mocks.pending.mockResolvedValue({ result: { launch_admin: wallet, addresses } });
    const choice = { launch_auction: false, launch_marketplace: true, enable_minter: false };
    mocks.send.mockResolvedValueOnce({ status: 'ERROR', hash });
    await expect(useDaoDeployment(wallet, 'testnet').launchDao('dao-A', choice)).rejects.toThrow('RPC rejected');
    nextEnvelope();
    mocks.getTransaction.mockResolvedValueOnce(missing()).mockResolvedValue({ status: 'SUCCESS' });
    await useDaoDeployment(wallet, 'testnet').launchDao('dao-A', choice);
    expect(mocks.pending).toHaveBeenCalledTimes(2);
    expect(mocks.launch).toHaveBeenCalledTimes(2);
    expect(mocks.sign).toHaveBeenCalledTimes(2);
    expect(mocks.launch.mock.calls[1][0].launch_config).toEqual({ ...choice, expected_minter: null });
  });
});
describe('scoped indexing and confirmation', () => {
  it('polls the existing scoped API and checks identity instead of importing a database client', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ daoId: 'dao-A', status: 'pending' }) });
    vi.stubGlobal('fetch', fetch);
    expect(await pollCreatedDao('dao-A')).toBe(true);
    expect(fetch).toHaveBeenCalledWith('/api/dao/dao-A', expect.objectContaining({ cache: 'no-store' }));
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ daoId: 'dao-B', status: 'pending' }) });
    await expect(pollCreatedDao('dao-A')).rejects.toThrow('Invalid DAO');
  });
  it('returns an indexing timeout without changing a confirmed transaction into failure', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    const result = pollCreatedDao('dao-A', undefined, 2000);
    await vi.advanceTimersByTimeAsync(2000);
    expect(await result).toBe(false);
  });
  it('fails explicitly on 503 and respects pre-aborted requests', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(pollCreatedDao('dao-A')).rejects.toThrow('lookup is unavailable');
    const controller = new AbortController();
    controller.abort();
    expect(await pollCreatedDao('dao-A', controller.signal)).toBe(false);
  });
  it('keeps NOT_FOUND distinct from SUCCESS and reports unknown status on timeout', async () => {
    vi.useFakeTimers();
    mocks.getTransaction.mockResolvedValue({ status: 'NOT_FOUND' });
    const result = confirmCreationTransaction(hash, 'https://rpc.test', 2000);
    const expected = expect(result).rejects.toThrow('unknown');
    await vi.advanceTimersByTimeAsync(2000);
    await expected;
  });
});
