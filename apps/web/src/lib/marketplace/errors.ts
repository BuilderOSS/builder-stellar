export function marketplaceErrorMessage(error: unknown) {
  const text = error instanceof Error ? error.message : String(error);
  const messages: Record<string, string> = {
    '1303': 'The price must be greater than zero.',
    '1304': 'Choose an expiry in the future.',
    '1305': 'This token already has a listing. Refresh the marketplace.',
    '1306': 'This listing is no longer available. Refresh before trying again.',
    '1307': 'This listing has expired. It can no longer be purchased.',
    '1308': 'This listing has not expired yet.',
    '1309': 'Only the original seller can cancel this listing.',
    '1311':
      'This listing price and fee exceed the contract arithmetic limit. The seller can cancel the listing and choose a smaller price.',
    '1314': 'The marketplace is paused. Purchases and new listings are unavailable.',
    '9001': 'The marketplace has not launched yet.'
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
