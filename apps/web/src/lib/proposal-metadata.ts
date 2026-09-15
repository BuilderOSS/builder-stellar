export type ProposalMetadata = {
  title: string;
  description: string;
  url: string;
};

export type ProposalMetadataDraft = {
  title: string;
  description: string;
  url?: string;
};

export type ProposalMetadataValidation = {
  valid: boolean;
  message: string;
};

type ProposalMetadataKey = keyof ProposalMetadata;

function normalizeTitle(value: unknown) {
  const title = typeof value === 'string' ? value.trim() : '';
  return title || 'No Title';
}

function normalizeDescription(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeUrl(value: unknown) {
  if (typeof value !== 'string') return '';

  const url = value.trim();
  if (!url) return '';
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url)) return url;

  return `https://${url}`;
}

function hasDisallowedControlCharacters(value: string) {
  return /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value);
}

function decodeLooseEscapedString(value: string) {
  const encoder = new TextEncoder();
  const bytes: number[] = [];

  const append = (chunk: string) => {
    if (!chunk) return;
    bytes.push(...encoder.encode(chunk));
  };

  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    if (char !== '\\') {
      append(char);
      continue;
    }

    const escape = value[i + 1];
    if (!escape) {
      append('\\');
      break;
    }

    i += 1;

    if (escape === 'u') {
      const hex = value.slice(i + 1, i + 5);
      if (/^[0-9a-fA-F]{4}$/.test(hex)) {
        append(String.fromCharCode(Number.parseInt(hex, 16)));
        i += 4;
        continue;
      }
    }

    if (escape === 'x') {
      const hex = value.slice(i + 1, i + 3);
      if (/^[0-9a-fA-F]{2}$/.test(hex)) {
        bytes.push(Number.parseInt(hex, 16));
        i += 2;
        continue;
      }
    }

    switch (escape) {
      case '\\':
        append('\\');
        break;
      case '"':
        append('"');
        break;
      case '/':
        append('/');
        break;
      case 'b':
        append('\b');
        break;
      case 'f':
        append('\f');
        break;
      case 'n':
        append('\n');
        break;
      case 'r':
        append('\r');
        break;
      case 't':
        append('\t');
        break;
      default:
        append(escape);
        break;
    }
  }

  return new TextDecoder().decode(new Uint8Array(bytes));
}

function extractLooseField(value: string, key: ProposalMetadataKey) {
  const pattern = new RegExp(`"${key}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, 's');
  const match = value.match(pattern);
  if (!match) return undefined;

  return decodeLooseEscapedString(match[1]);
}

function decodeLooseMetadata(value: string): ProposalMetadata | null {
  const title = extractLooseField(value, 'title');
  const description = extractLooseField(value, 'description');
  const url = extractLooseField(value, 'url');

  if (typeof title === 'undefined' && typeof description === 'undefined' && typeof url === 'undefined') {
    return null;
  }

  return {
    title: normalizeTitle(title),
    description: normalizeDescription(description),
    url: normalizeUrl(url)
  };
}

function normalizeMetadata(value: Partial<ProposalMetadata> | null | undefined): ProposalMetadata | null {
  if (
    !value ||
    (typeof value.title === 'undefined' && typeof value.description === 'undefined' && typeof value.url === 'undefined')
  ) {
    return null;
  }

  return {
    title: normalizeTitle(value.title),
    description: normalizeDescription(value.description),
    url: normalizeUrl(value.url)
  };
}

export function encodeProposalMetadata(metadata: ProposalMetadataDraft) {
  return JSON.stringify({
    title: normalizeTitle(metadata.title),
    description: normalizeDescription(metadata.description),
    url: normalizeUrl(metadata.url)
  });
}

export function validateProposalMetadataDraft(metadata: ProposalMetadataDraft): ProposalMetadataValidation {
  const title = metadata.title.trim();
  if (!title) {
    return { valid: false, message: 'Title is required.' };
  }

  const description = metadata.description.trim();
  if (!description) {
    return { valid: false, message: 'Description is required.' };
  }

  if (hasDisallowedControlCharacters(metadata.title) || hasDisallowedControlCharacters(metadata.description)) {
    return { valid: false, message: 'Title and description cannot contain control characters.' };
  }

  const url = normalizeUrl(metadata.url);
  if (url) {
    try {
      const parsed = new URL(url);
      if (!parsed.hostname) {
        return { valid: false, message: 'URL must include a valid hostname.' };
      }
    } catch {
      return { valid: false, message: 'URL must be a valid web address.' };
    }
  }

  return { valid: true, message: '' };
}

export function decodeProposalMetadata(value: string): ProposalMetadata | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return decodeLooseMetadata(value);
    }

    return normalizeMetadata(parsed as Partial<ProposalMetadata>);
  } catch {
    return decodeLooseMetadata(value);
  }
}

export function parseProposalMetadata(value: string): ProposalMetadata {
  return (
    decodeProposalMetadata(value) ?? {
      title: 'No Title',
      description: value,
      url: ''
    }
  );
}
