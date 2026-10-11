/** Pure text edits for the markdown field. Each returns the new value and the selection to restore. */
export type MarkdownEdit = { value: string; start: number; end: number };

/** Wrap the selection (or a placeholder word) in markers, e.g. `**bold**`; unwrap if it already is. */
export function wrapSelection(
  value: string,
  start: number,
  end: number,
  before: string,
  after = before,
  placeholder = 'text'
): MarkdownEdit {
  const selected = value.slice(start, end);
  const outer = value.slice(start - before.length, end + after.length);
  if (selected && outer === `${before}${selected}${after}`) {
    const next = value.slice(0, start - before.length) + selected + value.slice(end + after.length);
    return { value: next, start: start - before.length, end: end - before.length };
  }
  const inner = selected || placeholder;
  const next = value.slice(0, start) + before + inner + after + value.slice(end);
  return { value: next, start: start + before.length, end: start + before.length + inner.length };
}

/** A link around the selection; the URL part is selected so it can be typed straight away. */
export function insertLink(value: string, start: number, end: number): MarkdownEdit {
  const label = value.slice(start, end) || 'link text';
  const url = 'https://';
  const next = `${value.slice(0, start)}[${label}](${url})${value.slice(end)}`;
  const urlStart = start + label.length + 3;
  return { value: next, start: urlStart, end: urlStart + url.length };
}

/** Prefix every line touched by the selection, e.g. `- ` for a list or `> ` for a quote; remove it if all have it. */
export function prefixLines(value: string, start: number, end: number, prefix: string): MarkdownEdit {
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  const nextBreak = value.indexOf('\n', end);
  const lineEnd = nextBreak === -1 ? value.length : nextBreak;
  const lines = value.slice(lineStart, lineEnd).split('\n');
  const all = lines.every((line) => line.startsWith(prefix));
  const changed = lines.map((line) => (all ? line.slice(prefix.length) : `${prefix}${line}`)).join('\n');
  const next = value.slice(0, lineStart) + changed + value.slice(lineEnd);
  return { value: next, start: lineStart, end: lineStart + changed.length };
}

/** Insert text at the cursor, on its own line when it is a block (an image). */
export function insertBlock(value: string, at: number, text: string): MarkdownEdit {
  const before = value.slice(0, at);
  const after = value.slice(at);
  const lead = before && !before.endsWith('\n') ? '\n' : '';
  const trail = after && !after.startsWith('\n') ? '\n' : '';
  const next = `${before}${lead}${text}${trail}${after}`;
  const cursor = before.length + lead.length + text.length;
  return { value: next, start: cursor, end: cursor };
}

/** The placeholder shown while an image uploads; unique so several uploads can run at once. */
export function uploadPlaceholder(name: string, token: string) {
  return `![Uploading ${name.replace(/[[\]]/g, '')}… ${token}]()`;
}

/** Markdown for an uploaded image. Brackets in the file name would break the alt text. */
export function imageMarkdown(name: string, uri: string) {
  const alt = name.replace(/\.[^.]+$/, '').replace(/[[\]]/g, '');
  return `![${alt}](${uri})`;
}

/** Swap an upload's placeholder for the finished image, wherever later typing has moved it. */
export function resolvePlaceholder(value: string, marker: string, markdown: string) {
  return value.replace(marker, markdown);
}

/** Remove a failed upload's placeholder, with the line break it was given. */
export function dropPlaceholder(value: string, marker: string) {
  return value.includes(`${marker}\n`) ? value.replace(`${marker}\n`, '') : value.replace(marker, '');
}
