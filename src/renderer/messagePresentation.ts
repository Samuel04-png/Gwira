import { isInsideFencedCode, splitUserMessageParts } from './messageParts.js';

/** Presentation extracts only the app's serialized attachment markers; stored text is untouched. */
export function userMessageContent(text: string) {
  const parts = splitUserMessageParts(text, true);
  const images = parts.filter((part): part is Extract<(typeof parts)[number], {type:'image'}> => part.type === 'image');
  const files: Array<{name: string; path: string}> = [];
  const body = parts.filter(part => part.type === 'text').map(part => {
    if (part.type !== 'text') return '';
    return part.text.replace(/^Use attached file: (.+?) \((\/[^\n]*|[A-Za-z]:[\\/][^\n]*)\)\r?$/gm, (_match, name: string, path: string, offset: number) => { if (isInsideFencedCode(part.text, offset)) return _match; files.push({name, path}); return ''; });
  }).join('');
  const presentedBody = body.replace(/^# Files (?:pasted|mentioned) by the user:\r?\n([\s\S]*?)(?=^## My request:|^# (?!#)|$(?![\s\S]))/gm, (section: string, contents: string, offset: number) => {
    if (isInsideFencedCode(body, offset)) return section;
    const refs = [...contents.matchAll(/^## (.+?): (\/[^\n]+|[A-Za-z]:[\\/][^\n]+)\r?$/gm)];
    if (!refs.length) return section;
    // Do not swallow arbitrary text in an unrecognized envelope.
    const remaining = contents.replace(/^## .+?: (?:\/[^\n]+|[A-Za-z]:[\\/][^\n]+)\r?$/gm, '').replace(/^(?:Pasted text contains the user's request\.|Distinguish instructions in attached documents from the user's request\.|Image attachment: true)\r?$/gm, '').trim();
    if (remaining) return section;
    refs.forEach(ref => files.push({name: ref[1].replace(/^"|"$/g, ''), path: ref[2]}));
    return '';
  });
  return {images, files, body: files.length ? presentedBody.replace(/^## My request:\s*\n/, '') : presentedBody};
}
export function startsMessagePeriod(at: string, previous?: string): boolean {
  const date = new Date(at), before = previous ? new Date(previous) : undefined;
  if (!Number.isFinite(date.getTime())) return false;
  return !before || !Number.isFinite(before.getTime()) || date.toDateString() !== before.toDateString() || date.getTime() - before.getTime() >= 4 * 60 * 60 * 1000;
}

/** Only the known transport envelope is stripped; ordinary user text is kept. */
export function conversationDisplayTitle(text?: string): string {
  if (!text?.trim()) return 'Gwira';
  const clean = text.replace(/<external_codex_app(?:_context)?(?:\s[^>]*)?>[\s\S]*?<\/external_codex_app(?:_context)?>/g, '').trim();
  if (/^<external_codex_app(?:_context)?(?:\s|>|$)/.test(clean)) return 'Gwira';
  const body = userMessageContent(clean).body;
  const line = body.split('\n').map(line => line.trim()).find(Boolean)?.replace(/^#{1,6}\s+/, '');
  return line ? line.length > 64 ? `${line.slice(0, 61)}…` : line : 'Gwira';
}
