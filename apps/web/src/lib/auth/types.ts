export type AuthChallenge =
  | {
      method: 'sep53';
      nonce: string;
      issuedAt: string;
      expiresAt: string;
      network: string;
      domain: string;
      uri: string;
      address: string;
      serverPublicKey: string;
      serverSignature: string;
    }
  | {
      method: 'sep10';
      address: string;
      xdr: string;
      expiresAt: string;
      network: string;
      homeDomain: string;
      webAuthDomain: string;
    };

export type AuthSession = {
  challenge?: AuthChallenge;
  address?: string;
  network?: string;
  authMethod?: AuthMethod;
  authenticatedAt?: number;
};

export type AuthMethod = 'sep53' | 'sep10';

export type AuthChallengeResponse = {
  appName: string;
  nonce: string;
  domain: string;
  uri: string;
  network: string;
  issuedAt: string;
  expirationTime: string;
  serverPublicKey: string;
  serverSignature: string;
};

export type Sep10ChallengeResponse = {
  address: string;
  network: string;
  xdr: string;
  expiresAt: string;
};

export type AuthSessionResponse = {
  authenticated: boolean;
  address: string | null;
  authMethod?: AuthMethod | null;
};

export type AuthStatus =
  | 'anonymous'
  | 'connecting-wallet'
  | 'requesting-challenge'
  | 'awaiting-signature'
  | 'verifying-signature'
  | 'authenticated'
  | 'error';
