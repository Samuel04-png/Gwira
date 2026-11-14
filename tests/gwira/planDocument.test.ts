import {describe,expect,it} from 'vitest';
import {applyPlanEdit,buildPlan,classifyPlanMessage,parsePlanDoc,previewMarkdown,renderPlanMarkdown} from '../../src/renderer/gwira/onboarding/planDocument.js';

const collections=buildPlan({goal:'I run a lending business and want to follow up on overdue customer payments.',answers:[{question:'Where do you keep payment records?',answer:'Google Sheets'},{question:'Draft or send?',answer:'Draft them for my approval'}]});
const website=buildPlan({goal:'Build a simple website for my business',answers:[]});

describe('plan generation',()=>{
 it('produces different plans for different work',()=>{
  expect(collections.title).not.toBe(website.title);
  expect(collections.steps.map(s=>s.title)).not.toEqual(website.steps.map(s=>s.title));
 });
 it('reports only what the user said and never claims connected data',()=>{
  const md=renderPlanMarkdown(collections);
  expect(md).toContain('Google Sheets');
  expect(md).toContain('has not been connected');
  expect(md).toMatch(/not created, no tool access, not running/);
  expect(md).toMatch(/need separate authorization/);
 });
 it('omits sections with nothing to say',()=>{
  const plain=renderPlanMarkdown({...website,integrations:[],revisions:[]});
  expect(plain).not.toContain('## Required integrations');
  expect(plain).not.toContain('## Revisions');
  expect(plain).not.toContain('## What you told Gwira');
 });
 it('marks required integrations as not connected',()=>{
  const withGmail={...collections,integrations:[{name:'Gmail',reason:'Would send approved reminders.'}]};
  expect(renderPlanMarkdown(withGmail)).toContain('**Gmail** — Would send approved reminders. Not connected.');
 });
 it('shows the status at read time, honestly labelled',()=>{
  expect(previewMarkdown(collections,{status:'draft',version:1})).toContain('Draft · awaiting your approval · Version 1 · Prepared with suggested rules, not live AI');
  expect(previewMarkdown(collections,{status:'approved',version:2})).toContain('Approved');
 });
 it('round-trips through the validator and rejects malformed data',()=>{
  expect(parsePlanDoc(JSON.parse(JSON.stringify(collections)))).toEqual(collections);
  expect(parsePlanDoc({...collections,steps:[]})).toBeUndefined();
  expect(parsePlanDoc({...collections,title:''})).toBeUndefined();
  expect(parsePlanDoc('x')).toBeUndefined();
 });
});

describe('conversational edits',()=>{
 it('revises the named step without touching the others',()=>{
  const r=applyPlanEdit(collections,'Change step two. I want the messages drafted in English and Nyanja.');
  expect(r.kind).toBe('edited');if(r.kind!=='edited')return;
  expect(r.plan.steps[1].description).toBe('Messages drafted in English and Nyanja.');
  expect(r.plan.steps[0]).toEqual(collections.steps[0]);expect(r.plan.steps[2]).toEqual(collections.steps[2]);
  expect(r.plan.revisions.at(-1)).toContain('Step 2');expect(r.summary).toContain('Nyanja');
 });
 it('asks instead of guessing when detail is missing or the step does not exist',()=>{
  expect(applyPlanEdit(collections,'Change step 2').kind).toBe('needs_detail');
  expect(applyPlanEdit(collections,'Change step 9 to something else').kind).toBe('needs_detail');
  expect(applyPlanEdit(collections,'make it better').kind).toBe('unsupported');
 });
 it('adds, removes and renames',()=>{
  const added=applyPlanEdit(collections,'Add a step: check results every Friday');
  expect(added.kind==='edited'&&added.plan.steps.length).toBe(collections.steps.length+1);
  const removed=applyPlanEdit(collections,'Remove step 1');
  expect(removed.kind==='edited'&&removed.plan.steps.length).toBe(collections.steps.length-1);
  const renamed=applyPlanEdit(collections,'Rename the plan to Monthly collections');
  expect(renamed.kind==='edited'&&renamed.plan.title).toBe('Monthly collections');
 });
 it('does not mutate the input plan',()=>{
  const copy=JSON.stringify(collections);applyPlanEdit(collections,'Change step 1 to review every account');expect(JSON.stringify(collections)).toBe(copy);
 });
});

describe('approval intent',()=>{
 it.each(['I approve the plan.','Looks good. Proceed.','Yes, approve this workflow.','Approve the current version.','Approve it','I approve the customer follow-up plan.','Go ahead with the plan'])('approves %s',text=>{
  expect(classifyPlanMessage(text)).toBe('approve');
 });
 it.each(['Maybe approve it later.','I will approve it once step 2 is changed','Should I approve the plan?','Do not approve the plan','I approve the invoice','Approve the payment','The manager said "I approve the plan" yesterday','Not yet, wait','approve step 1 but change step 3','Can you approve this for me?'])('does not approve %s',text=>{
  expect(classifyPlanMessage(text)).not.toBe('approve');
 });
 it('treats unclear approval talk as a question to clarify, not as an edit',()=>{
  expect(classifyPlanMessage('Maybe approve it later.')).toBe('unclear_approval');
  expect(classifyPlanMessage('I approve the invoice')).toBe('unclear_approval');
 });
 it('recognises edits and ordinary chat',()=>{
  expect(classifyPlanMessage('Change step two to include English')).toBe('edit');
  expect(classifyPlanMessage('What does the Doat do?')).toBe('other');
  expect(classifyPlanMessage('')).toBe('other');
 });
});
