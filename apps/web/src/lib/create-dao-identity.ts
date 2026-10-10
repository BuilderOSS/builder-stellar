import { isValidSlug } from './create-dao-schema';
import { MAX_TOKEN_SYMBOL_LENGTH } from './validation';

/** Splits a name into plain ASCII words: accents dropped, everything else is a separator. */
function words(name: string) {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
}

/**
 * A ticker from the DAO name: short names as-is ("Gnars" → GNARS), three or more words as
 * initials ("Purple Cats Club" → PCC), otherwise the first word ("Builder DAO" → BUILDER).
 * Always passes the token symbol rule (A-Z/0-9, 1-12 chars) or is empty.
 */
export function suggestSymbol(name: string) {
  const parts = words(name).map((word) => word.toUpperCase());
  if (!parts.length) return '';
  const joined = parts.join('');
  if (joined.length <= 6) return joined;
  if (parts.length >= 3)
    return parts
      .map((word) => word[0])
      .join('')
      .slice(0, MAX_TOKEN_SYMBOL_LENGTH);
  return parts[0].slice(0, 8);
}

/**
 * A URL slug from the DAO name ("Lantern Club!" → lantern-club). Short names get a "-dao"
 * suffix to reach the 4-character minimum. Empty when the name has no usable characters.
 */
export function suggestSlug(name: string) {
  let slug = words(name).join('-').toLowerCase().slice(0, 63).replace(/-+$/, '');
  if (slug && slug.length < 4) slug = `${slug}-dao`;
  return isValidSlug(slug) ? slug : '';
}

/**
 * Whether a field is still following the name: empty, or exactly what the previous name
 * would have produced. Once someone types their own value it stops being replaced.
 */
export function followsName(value: string, previousName: string, suggest: (name: string) => string) {
  return !value || value === suggest(previousName);
}
