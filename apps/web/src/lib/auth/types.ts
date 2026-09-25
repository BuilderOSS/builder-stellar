export type AuthChallenge = {
  nonce: string;
  issuedAt: string;
  expiresAt: string;
  network: string;
  domain: string;
  uri: string;
};

export type AuthSession = {
  challenge?: AuthChallenge;
  address?: string;
  network?: string;
  authenticatedAt?: number;
};

export type AuthChallengeResponse = {
  appName: string;
  nonce: string;
  domain: string;
  uri: string;
  network: string;
  issuedAt: string;
  expirationTime: string;
};

export type AuthSessionResponse = {
  authenticated: boolean;
  address: string | null;
};

export type AuthStatus =
  | 'anonymous'
  | 'connecting-wallet'
  | 'requesting-challenge'
  | 'awaiting-signature'
  | 'verifying-signature'
  | 'authenticated'
  | 'error';
