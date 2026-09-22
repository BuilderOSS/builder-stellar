import { spawnSync } from 'node:child_process';

export function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: options.stdio ?? 'inherit',
    encoding: 'utf8',
    env: options.env ?? process.env,
    cwd: options.cwd ?? process.cwd()
  });

  if (result.status !== 0) {
    const error = new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`);
    error.stdout = result.stdout;
    error.stderr = result.stderr;
    throw error;
  }

  return result.stdout ?? '';
}

export function runQuiet(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    env: options.env ?? process.env,
    cwd: options.cwd ?? process.cwd()
  });

  return {
    ok: result.status === 0,
    code: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? ''
  };
}

export function fetchTransactionLedger(txHash, networkName) {
  const result = runQuiet('stellar', [
    'tx',
    'fetch',
    'result',
    '--hash',
    txHash,
    '--network',
    networkName,
    '--output',
    'json-formatted'
  ]);

  if (!result.ok) {
    throw new Error(
      `Failed to fetch ledger for transaction ${txHash}: ${result.stderr || result.stdout}`
    );
  }

  const match = result.stdout.match(/Transaction Ledger:\s*(\d+)/i);
  if (!match) {
    throw new Error(`Could not parse ledger for transaction ${txHash}`);
  }

  return Number.parseInt(match[1], 10);
}

export function enrichTransactionMetadata(metadata, networkName) {
  if (!metadata?.txHash) {
    return metadata ?? null;
  }

  const ledger = metadata.ledger ?? fetchTransactionLedger(metadata.txHash, networkName);
  return { ...metadata, ledger };
}
