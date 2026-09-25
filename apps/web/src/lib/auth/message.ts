type AuthMessageInput = {
  appName: string;
  address: string;
  domain: string;
  uri: string;
  network: string;
  nonce: string;
  issuedAt: string;
  expirationTime: string;
};

export function createAuthMessage(input: AuthMessageInput) {
  return [
    `${input.domain} wants you to sign in with your Stellar account.`,
    '',
    input.address,
    '',
    `Sign in to ${input.appName}.`,
    '',
    `URI: ${input.uri}`,
    `Network: ${input.network}`,
    `Nonce: ${input.nonce}`,
    `Issued At: ${input.issuedAt}`,
    `Expiration Time: ${input.expirationTime}`
  ].join('\n');
}
