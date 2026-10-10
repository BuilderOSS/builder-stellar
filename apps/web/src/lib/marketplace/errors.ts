export function marketplaceErrorMessage(error: unknown) {
  const text = error instanceof Error ? error.message : String(error);
  const messages: Record<string, string> = {
    '7702': 'The price must be greater than zero.',
    '7703': 'Choose an expiry in the future.',
    '7704': 'This token already has a listing. Refresh the marketplace.',
    '7705': 'This listing is no longer available. Refresh before trying again.',
    '7706': 'This listing has expired. It can no longer be purchased.',
    '7707': 'This listing has not expired yet.',
    '7708': 'Only the original seller can cancel this listing.',
    '7709': 'The marketplace fee is out of range (at most 25%).',
    '7710':
      'This listing price and fee exceed the contract arithmetic limit. The seller can cancel the listing and choose a smaller price.',
    '7712':
      'The marketplace payment asset changed since you reviewed it. Refresh, review the new asset and list again.',
    '7713': 'The marketplace is paused. Purchases and new listings are unavailable.',
    '7714': 'The marketplace fee increased since you reviewed it. Refresh, review the new fee and list again.',
    '7715': 'The price is now higher than the price you reviewed. Refresh the listing and review the new price.',
    '7001': 'The marketplace has not launched yet.'
  };
  for (const [code, message] of Object.entries(messages)) {
    if (new RegExp(`(?:Error\\(Contract, #|contract error[: ]+|error #)${code}\\b`, 'i').test(text)) return message;
  }
  if (/reject|declin|cancelled by user/i.test(text)) return 'Signing was cancelled. No new transaction was submitted.';
  if (/insufficient|underfunded|balance.*low/i.test(text))
    return 'Insufficient spendable balance. Keep XLM above the account reserve for network fees.';
  if (/restore.*contract state|restore some contract state|archived|ExpiredState/i.test(text))
    return 'Some contract state is archived and needs a restoration transaction. This trade was not submitted; restore the state before trying again.';
  return text.length < 350
    ? text
    : 'The transaction could not be prepared. Refresh the listing and check your balance, wallet network, and ownership.';
}
