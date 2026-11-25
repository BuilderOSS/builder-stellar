/** iron-session refuses shorter secrets, and so does every key derived from them here. */
export const MIN_SECRET_LENGTH = 32;

function invalidPasswordConfig(): never {
  throw new Error(
    `IRON_PASSWORD must be a secret of at least ${MIN_SECRET_LENGTH} characters, or a JSON map of numbered secrets such as {"2":"…","1":"…"}.`
  );
}

/**
 * The session secrets, by number. IRON_PASSWORD is either one secret (number 1) or a JSON map of
 * numbered secrets. iron-session seals new cookies with the highest number and opens cookies sealed
 * with any number in the map, so an operator rotates by adding a higher-numbered secret: existing
 * sessions keep working until the old number is removed, and removing it ends them.
 */
export function getSessionPasswords(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const value = env.IRON_PASSWORD;
  const raw = value?.trim();
  if (!value || !raw) invalidPasswordConfig();
  // A value that looks like JSON is read as a map, so a mistyped map fails instead of becoming one long secret.
  if (!raw.startsWith('{') && !raw.startsWith('[')) {
    // A single secret is used exactly as set, as before, so existing keys derived from it don't change.
    if (value.length < MIN_SECRET_LENGTH) invalidPasswordConfig();
    return { 1: value };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // The parser's message can quote part of the value, so it is not passed on.
    invalidPasswordConfig();
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) invalidPasswordConfig();
  const entries = Object.entries(parsed as Record<string, unknown>);
  if (entries.length === 0) invalidPasswordConfig();
  const passwords: Record<string, string> = {};
  for (const [id, secret] of entries) {
    // iron-session picks the sealing secret by numeric comparison, so ids must be plain positive integers.
    if (!/^[1-9][0-9]{0,8}$/.test(id)) invalidPasswordConfig();
    if (typeof secret !== 'string' || secret.length < MIN_SECRET_LENGTH) invalidPasswordConfig();
    passwords[id] = secret;
  }
  return passwords;
}

/** The secret new session cookies are sealed with: the highest-numbered one. */
export function currentSessionPassword(env: NodeJS.ProcessEnv = process.env): string {
  const passwords = getSessionPasswords(env);
  const newest = Math.max(...Object.keys(passwords).map(Number));
  return passwords[String(newest)];
}
