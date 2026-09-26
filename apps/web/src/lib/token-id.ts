export function parseTokenId(value: string) {
  if (!/^\d+$/.test(value)) throw new Error('Invalid token id');

  const tokenId = Number(value);
  if (!Number.isSafeInteger(tokenId)) throw new Error('Invalid token id');

  return tokenId;
}
