import type {OnboardingChatEntry,PlanRecord} from '../../../shared/accountAuth.js';
import type {SessionMessage} from '../../../shared/types.js';
import {decide,type MeetState} from '../onboarding/meetGwiraModel.js';

export const planReadyMessage='I’ve prepared a plan based on what you’ve told me. You can review it beside our conversation.';
export const planReadyNarrowMessage='I’ve prepared a plan based on what you’ve told me. Use Open plan to read it; it opens over the conversation and you can close it to continue.';

/** Builds the transcript from saved onboarding state so a restart shows the same conversation. Nothing here is generated at random. */
export function buildFirstRunMessages(input:{state:MeetState;startedAt?:string;chat:OnboardingChatEntry[];plan?:PlanRecord;planFailed:boolean;planPending:boolean;narrow?:boolean}):SessionMessage[] {
 const {state,chat,plan}=input;const start=input.startedAt??new Date(0).toISOString();const out:SessionMessage[]=[];
 const add=(role:'user'|'codex',text:string,at:string)=>out.push({id:`first-run-${out.length}`,role,text,createdAt:at});
 if(state.act==='opening'||!state.goal)return out;
 add('user',state.goal,start);
 state.answers.forEach(a=>{add('codex',a.question,start);add('user',a.answer==='Skip'?'Continue with what we know':a.answer,start);});
 if(state.act==='clarifying'){const d=decide(state.goal,state.answers,state.asked-1);if(d.question)add('codex',d.question,start);}
 else if(plan)add('codex',input.narrow?planReadyNarrowMessage:planReadyMessage,start);
 else if(input.planFailed)add('codex','I couldn’t save the plan yet. Your answers are kept. Try again when you’re ready.',start);
 else if(input.planPending)add('codex','I’m preparing a plan from what you’ve told me.',start);
 chat.forEach(e=>add(e.role==='user'?'user':'codex',e.text,e.at));
 return out;
}

export const helpReply='I can change a step, add or remove one, rename the plan, or approve it. I can’t answer open questions yet: this setup uses suggested rules, not live AI.';
export const unclearApprovalReply='I want to be sure before approving anything. Say “I approve the plan” when you’re ready, or use Approve plan. Nothing has been approved.';
export const editHelp='I can change a step, add or remove a step, or rename the plan. For example: “Change step 2 to draft messages in English and Nyanja.”';

export function approvedReply(plan:PlanRecord,integrations:string[]):string {
 const names=integrations.length?` ${integrations.join(' and ')} ${integrations.length>1?'are':'is'} not connected, so nothing will be sent.`:'';
 return `The plan is approved (version ${plan.version}). Approval covers the plan only: no tasks have been created and nothing has been sent. Sending messages, publishing and payments each need separate authorization.${names}`;
}
