import {describe,expect,it} from 'vitest';
import {userMessageContent,startsMessagePeriod} from '../src/renderer/messagePresentation.js';
import {splitUserMessageParts} from '../src/renderer/messageParts.js';
describe('message presentation preserves source content',()=>{
 it('keeps repeated paragraphs and original whitespace on the presentation path',()=>{
  const text='  First paragraph.\n\nFirst paragraph.\n\n```text\n  indented\n```\n';
  expect(userMessageContent(text).body).toBe(text);
  expect(splitUserMessageParts(text,true)).toEqual([{type:'text',text}]);
 });
 it('extracts ordered image markers without deleting adjacent repeated text',()=>{
  const text='<image name=[Portrait] path="/a.png">\n</image>\nKeep this.\n\nKeep this.\n<image name=[Landscape] path="/b.png">\n</image>';
  const result=userMessageContent(text);expect(result.images.map(i=>i.path)).toEqual(['/a.png','/b.png']);expect(result.body).toBe('\nKeep this.\n\nKeep this.\n');
 });
 it('extracts real serialized file attachments and leaves ordinary paths alone',()=>{
  const text='Use attached file: Notes (final).txt (/project/Notes (final).txt)\n\nPlease keep /project/Notes (final).txt as written.';
  const result=userMessageContent(text);expect(result.files).toEqual([{name:'Notes (final).txt',path:'/project/Notes (final).txt'}]);expect(result.body).toContain('Please keep /project/Notes (final).txt as written.');
 });
 it('keeps example attachment syntax inside fenced code as original content',()=>{
  const text='```text\nUse attached file: Example.txt (/tmp/example.txt)\n<image name=[Example] path="/tmp/example.png">\n</image>\n```';
  const result=userMessageContent(text);expect(result.body).toBe(text);expect(result.files).toEqual([]);expect(result.images).toEqual([]);
 });
 it('does not turn nearby messages into repeated large date headings',()=>{
  expect(startsMessagePeriod('2026-10-28T08:00:00')).toBe(true);
  expect(startsMessagePeriod('2026-10-28T08:03:00','2026-10-28T08:00:00')).toBe(false);
  expect(startsMessagePeriod('2026-10-28T13:00:00','2026-10-28T08:00:00')).toBe(true);
  expect(startsMessagePeriod('2026-10-29T00:01:00','2026-10-28T23:59:00')).toBe(true);
  expect(startsMessagePeriod('invalid')).toBe(false);
 });
});
