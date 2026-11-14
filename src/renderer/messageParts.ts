export type UserMessagePart =
  | { type: 'text'; text: string }
  | { type: 'image'; name: string; path: string };

export function splitUserMessageParts(text: string, preserveText = false): UserMessagePart[] {
  const parts: UserMessagePart[] = [];
  const pattern = /<image\s+name=\[([^\]]+)\]\s+path="([^"]+)">\s*<\/image>/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (preserveText && isInsideFencedCode(text, match.index)) continue;
    if (match.index > cursor) {
      parts.push({ type: 'text', text: text.slice(cursor, match.index) });
    }
    parts.push({ type: 'image', name: match[1], path: match[2] });
    cursor = match.index + match[0].length;
  }

  if (cursor < text.length) {
    parts.push({ type: 'text', text: text.slice(cursor) });
  }

  const result = parts.length > 0 ? parts : [{ type: 'text' as const, text }];
  return preserveText ? result : cleanupUserMessageParts(result);
}

function cleanupUserMessageParts(parts: UserMessagePart[]): UserMessagePart[] {
  const cleaned = parts
    .map((part) => {
      if (part.type !== 'text') return part;
      return { type: 'text' as const, text: dedupeTextBlocks(part.text) };
    })
    .filter((part) => part.type === 'image' || part.text.trim().length > 0);

  return dedupeTextParts(cleaned);
}

function dedupeTextBlocks(text: string): string {
  const seen = new Set<string>();
  return text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => {
      const normalized = block.replace(/\s+/g, ' ');
      if (!normalized) return false;
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    })
    .join('\n\n');
}

function dedupeTextParts(parts: UserMessagePart[]): UserMessagePart[] {
  const seen = new Set<string>();
  return parts.filter((part) => {
    if (part.type === 'image') return true;
    const normalized = part.text.trim().replace(/\s+/g, ' ');
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

/** Attachment syntax quoted as an example is content, not an attachment record. */
export function isInsideFencedCode(text: string, offset: number): boolean {
  let fence: { character: string; length: number } | undefined;
  for (const line of text.slice(0, offset).split('\n')) {
    const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (!match) continue;
    if (!fence) fence = {character: match[1][0]!, length: match[1].length};
    else if (match[1][0] === fence.character && match[1].length >= fence.length && !match[2].trim()) fence = undefined;
  }
  return !!fence;
}
