import {describe,it,expect} from 'vitest';
import {groupResponseEntries,completeResponseText,spokenResponseText} from '../src/renderer/responsePresentation.js';
import {buildTraceEntries} from '../src/renderer/activityTraceModel.js';
import {conversationDisplayTitle,userMessageContent} from '../src/renderer/messagePresentation.js';
import type {SessionMessage} from '../src/shared/types.js';
const m=(id:string,role:SessionMessage['role'],text:string):SessionMessage=>({id,role,text,createdAt:'2026-11-03T08:00:00Z'});
describe('response presentation boundaries',()=>{
 it('groups one provider turn through activity without merging separate user turns or changing records',()=>{
  const messages=[m('u','user','Request'),m('a','codex','# Heading'),m('s','system','Command: pwd\nExit code: 0'),m('b','codex','```ts\nconst x = 1;\n```'),m('u2','user','Follow-up'),m('c','codex','Different response')];
  const original=JSON.stringify(messages),groups=groupResponseEntries(buildTraceEntries(messages,false));
  expect(groups.map(e=>e.kind)).toEqual(['message','response','message','response']);
  const first=groups[1];if(first.kind!=='response')throw Error('Expected response');
  expect(completeResponseText(first.entries)).toBe('# Heading\n\n```ts\nconst x = 1;\n```');
  expect(JSON.stringify(messages)).toBe(original);
 });
 it('does not copy trace metadata or user prompts, and preserves tables and lists',()=>{
  const content='- Review\n\n| Item | Status |\n| --- | --- |\n| A | Ready |';
  expect(completeResponseText(buildTraceEntries([m('u','user','Private prompt'),m('s','system','Command: secret'),m('a','codex',content)],false))).toBe(content);
  expect(spokenResponseText('Hello [reader](https://example.com).\n```js\nsecret();\n```')).toBe('Hello reader.');
 });
 it('cleans only known transport titles at the presentation boundary',()=>{
  expect(conversationDisplayTitle('<external_codex_app_context>internal</external_codex_app_context>\nBuild a website')).toBe('Build a website');
  expect(conversationDisplayTitle('<external_codex_app_context>unfinished')).toBe('Gwira');
  expect(conversationDisplayTitle('Use <Widget> in the page')).toBe('Use <Widget> in the page');
 });
 it('extracts serialized pasted files while keeping ordinary prose and literal code intact',()=>{
  const text='# Files pasted by the user:\n\n## "Brief": /tmp/brief.txt\n\nPasted text contains the user\'s request.\n\n## My request:\n\nReview it.';
  expect(userMessageContent(text)).toMatchObject({files:[{name:'Brief',path:'/tmp/brief.txt'}],body:'Review it.'});
  expect(userMessageContent('```text\n'+text+'\n```').files).toEqual([]);
  expect(userMessageContent('# Files mentioned by the user:\nUnrecognized content').body).toContain('Unrecognized content');
 });
});
