const KEY = 'builder.wallet-intro.v1';

// Storage can be denied (private browsing); then the intro shows once per page load instead.
let seenThisLoad = false;

/** Whether this browser has seen the wallet intro that comes before the first Connect. */
export function hasSeenWalletIntro(): boolean {
  if (seenThisLoad) return true;
  try {
    return window.localStorage.getItem(KEY) === 'seen';
  } catch {
    return false;
  }
}

export function markWalletIntroSeen() {
  seenThisLoad = true;
  try {
    window.localStorage.setItem(KEY, 'seen');
  } catch {
    // Remembered for this page load only.
  }
}

/** Test hook: forget the in-memory flag. */
export function resetWalletIntroForTests() {
  seenThisLoad = false;
}
