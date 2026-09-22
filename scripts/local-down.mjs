import { runQuiet } from './lib.mjs';

const containerName = 'stellar-builder-local';

runQuiet('docker', ['stop', containerName]);

console.log('Local Stellar container stopped when it was running.');
