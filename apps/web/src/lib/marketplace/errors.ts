/** Shown when the market's permission to hold a token is missing or has run out (before or during List). */
export const APPROVAL_EXPIRED = 'Your permission expired. Allow the market again.';

/** Shown for a preparation failure that matches no known contract or wallet error. */
export const PREPARE_FAILED =
  'The transaction could not be prepared. Refresh the listing and check your balance, wallet network, and ownership.';

/**
 * Words for a marketplace failure. Unknown text is shown as it is only when `showUnknown` is
 * true (the browser, where the text comes from the member's own wallet); the server passes false,
 * because RPC and simulation errors can carry internal detail.
 */
export function marketplaceErrorMessage(error: unknown, { showUnknown = true }: { showUnknown?: boolean } = {}) {
  const text = error instanceof Error ? error.message : String(error);
  const messages: Record<string, string> = {
    '7701': "The market isn't set up yet.",
    '7702': 'The price must be greater than zero.',
    '7703': 'Choose an expiry in the future.',
    '7704': 'This token already has a listing. Refresh the marketplace.',
    '7705': 'This listing is no longer available. Refresh before trying again.',
    '7706': 'This listing has expired. It can no longer be purchased.',
    '7707': 'This listing has not expired yet.',
    '7708': 'Only the original seller can cancel this listing.',
    '7709': 'The resale fee is out of range (at most 25%).',
    '7710':
      'This listing price and fee exceed the contract arithmetic limit. The seller can cancel the listing and choose a smaller price.',
    '7711': "The treasury given doesn't match this tribe's treasury.",
    '7712':
      'The marketplace payment asset changed since you reviewed it. Refresh, review the new asset and list again.',
    '7713': 'The marketplace is paused. Purchases and new listings are unavailable.',
    '7714': 'The resale fee increased since you reviewed it. Refresh, review the new fee and list again.',
    '7715': 'The price is now higher than the price you reviewed. Refresh the listing and review the new price.',
    '7716': 'Write a comment before posting.',
    '7717': 'This comment is too long. Shorten it and post again.',
    // Pools of new tokens (opened, stocked and closed by proposals).
    '7718':
      "The tribe hasn't allowed the market enough new tokens for this pool. Members need to pass a proposal that grants them first.",
    '7719': 'This pool no longer exists. Refresh the market.',
    '7720': 'This pool has closed or ended, so it no longer sells tokens.',
    '7721': 'You have bought as many tokens from this pool as one wallet can.',
    '7722': 'This pool has sold as many tokens as it can for now. Try again when its next sales period starts.',
    '7723': 'That token has just left this pool. Refresh the market and try again.',
    '7724': 'The market has as many open pools as it can hold. Close and clear one before opening another.',
    '7725': "This pool is still open, so its unsold tokens can't go back to the treasury yet.",
    '7726': 'A pool needs a size, a limit per wallet, a sales limit and a sales period that are each more than zero.',
    '7727': 'This pool is fully stocked. Its tokens are ready to buy.',
    '7001': 'The marketplace has not launched yet.',
    '7216': 'Memberships in this tribe are locked, so tokens cannot be listed for sale.',
    // The token's transfer_from, which List calls to move the token into the market's care.
    '200': 'This token no longer exists. Refresh your tokens.',
    '201': 'You no longer hold this token. Refresh your tokens.',
    '202': APPROVAL_EXPIRED
  };
  for (const [code, message] of Object.entries(messages)) {
    if (new RegExp(`(?:Error\\(Contract, #|contract error[: ]+|error #)${code}\\b`, 'i').test(text)) return message;
  }
  if (/reject|declin|cancelled by user/i.test(text)) return 'Signing was cancelled. No new transaction was submitted.';
  if (/insufficient|underfunded|balance.*low/i.test(text))
    return 'Insufficient spendable balance. Keep XLM above the account reserve for network fees.';
  if (/restore.*contract state|restore some contract state|archived|ExpiredState/i.test(text))
    return 'Some contract state is archived and needs a restoration transaction. This trade was not submitted; restore the state before trying again.';
  return showUnknown && text.length < 350 ? text : PREPARE_FAILED;
}
