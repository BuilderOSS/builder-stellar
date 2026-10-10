import { contract, rpc } from '@stellar/stellar-sdk';

type ClaimArgs = { token_id: string; recipient: string; amount: bigint };
export interface MinterMethods {
  mint_allowlist(
    args: ClaimArgs,
    options?: contract.MethodOptions
  ): Promise<contract.AssembledTransaction<contract.Result<null>>>;
  mint_merkle(
    args: ClaimArgs & { proof: Uint8Array[] },
    options?: contract.MethodOptions
  ): Promise<contract.AssembledTransaction<contract.Result<null>>>;
}

function typeShape(type: import('@stellar/stellar-sdk').xdr.ScSpecTypeDef): string {
  if (type.type === 'scSpecTypeVec') return `vec<${typeShape(type.vec.elementType)}>`;
  if (type.type === 'scSpecTypeBytesN') return `bytes${type.bytesN.n}`;
  if (type.type === 'scSpecTypeUdt') return type.udt.name.toString();
  if (type.type === 'scSpecTypeResult')
    return `result<${typeShape(type.result.okType)},${typeShape(type.result.errorType)}>`;
  return type.type.replace('scSpecType', '').toLowerCase();
}

/** Fail closed on old or incompatible RPC specs; names alone are not an ABI. */
export function assertMinterSpec(spec: contract.Spec) {
  const signatures = {
    mint_allowlist: ['token_id:address', 'recipient:address', 'amount:u128'],
    mint_merkle: ['token_id:address', 'recipient:address', 'amount:u128', 'proof:vec<bytes32>'],
    set_merkle_root: ['token_id:address', 'root:bytes32'],
    set_allowlist: ['token_id:address', 'addresses:vec<address>', 'fixed_amount:u128'],
    mint_batch: ['token_id:address', 'recipients:vec<address>', 'amounts:vec<u128>']
  };
  for (const [method, expected] of Object.entries(signatures)) {
    const fn = spec.getFunc(method);
    const inputs = fn.inputs.map((input) => `${input.name.toString()}:${typeShape(input.type)}`);
    if (
      JSON.stringify(inputs) !== JSON.stringify(expected) ||
      fn.outputs.length !== 1 ||
      typeShape(fn.outputs[0]) !== 'result<void,MinterError>'
    )
      throw new Error(`Unsupported Minter ABI: ${method}. Nothing can be signed.`);
  }
  const errors = spec.findEntry('MinterError');
  if (errors.type !== 'scSpecEntryUdtErrorEnumV0') throw new Error('Unsupported Minter error ABI.');
  const required = {
    InvalidAmount: 2,
    InvalidTokenId: 3,
    BatchTooLarge: 4,
    MerkleRootNotSet: 5,
    AllowlistNotSet: 6,
    NotInAllowlist: 7,
    AlreadyClaimed: 8,
    MerkleProofInvalid: 9,
    InvalidInput: 10,
    TokenContractError: 11,
    TokenNotLive: 13
  };
  const cases = new Map(errors.udtErrorEnumV0.cases.map((item) => [item.name.toString(), item.value]));
  for (const [name, code] of Object.entries(required))
    if (cases.get(name) !== code) throw new Error('Unsupported Minter error ABI.');
}

export async function minterClient(options: contract.ClientOptions) {
  const client = await contract.Client.from<MinterMethods>(options);
  assertMinterSpec(client.spec);
  return client;
}

export function assertClaimSimulation(tx: contract.AssembledTransaction<contract.Result<null>>) {
  if (!tx.simulation || !rpc.Api.isSimulationSuccess(tx.simulation) || rpc.Api.isSimulationRestore(tx.simulation))
    throw new Error('Claim simulation failed or requires archived state restoration. Nothing was signed.');
  void tx.simulationData;
  const result = tx.result;
  if (!result || typeof result.isOk !== 'function' || !result.isOk())
    throw new Error('The Minter rejected this claim. Check the round, allocation, prior claims and mint authority.');
  result.unwrap();
}
