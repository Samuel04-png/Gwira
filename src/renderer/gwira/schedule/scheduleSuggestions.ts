import type { GwiraLocalState } from '../domain/types.js';
import { buildWorkItems } from '../workfilters/workModel.js';
import { localStateToGraphRecords } from '../graph/localGraphAdapter.js';
import type { Schedule } from '../../../shared/schedules.js';
export interface ScheduleSuggestion {
    id: string;
    intent: string;
    title: string;
    description: string;
    instructions: string;
    reason: string;
    source: 'workspace' | 'general';
    score: number;
    subject?: string;
}
const concepts: Record<string, RegExp> = {
    activity: /activity digest|recorded activity/i,
    approvals: /\bapprovals?\b|awaiting review|pending review/i,
    deadlines: /overdue|deadlines?|due dates?/i,
    blockers: /blocked|blockers?/i,
    failures: /failed|failures?|execution errors?/i,
    projects: /projects?|progress brief/i,
    workflow: /workflow|handoffs?|dependencies/i,
    recurring: /repeated|recurring activities|repeat work/i,
    outcomes: /doat outcomes|execution history|agent results|run outcomes/i,
    priorities: /priorities|high.priority|urgent tasks/i,
    finance: /invoices?|expenses?|spending|financ|budget/i,
    customers: /customers?|follow.ups?|responses?|support/i,
    inventory: /inventory|stock|supplies/i,
    meetings: /meetings?|agenda/i,
    people: /team workload|staffing|capacity/i,
    security: /security|access review/i,
    competitors: /competitors?|market changes/i,
};
const semanticIcons = { activity: 'reports', approvals: 'review', deadlines: 'clock', blockers: 'blocked', failures: 'failed', projects: 'folder', workflow: 'operations', recurring: 'refresh', outcomes: 'doats', priorities: 'list', finance: 'finance', customers: 'support', inventory: 'steps', meetings: 'users', people: 'people', security: 'policies', competitors: 'explore' } as const;
type SuggestionIcon = typeof semanticIcons[keyof typeof semanticIcons] | 'reports' | 'clock';
/** Resolve meaning, never an arbitrary icon name supplied by business content. */
export function resolveSuggestionIcon(value: {
    intent?: string;
    title?: string;
    description?: string;
}): SuggestionIcon {
    const icons: Readonly<Record<string, SuggestionIcon>> = semanticIcons;
    const text = `${value.title ?? ''} ${value.description ?? ''}`;
    // A recorded blocker/failure/approval takes precedence over incidental wording.
    if (value.intent && Object.hasOwn(icons, value.intent) && !['projects', 'recurring', 'activity'].includes(value.intent))
        return icons[value.intent]!;
    // Specific business subjects take precedence over a broad project/report type.
    for (const intent of ['finance', 'inventory', 'customers', 'security', 'meetings'])
        if (concepts[intent]!.test(text))
            return icons[intent]!;
    if (value.intent && Object.hasOwn(icons, value.intent))
        return icons[value.intent]!;
    for (const [intent, pattern] of Object.entries(concepts))
        if (pattern.test(text))
            return icons[intent]!;
    return /report|summary|brief|review/i.test(text) ? 'reports' : 'clock';
}
const normalize = (value: string): string => value.toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const short = (value: string, limit = 34): string => value.length <= limit ? value : value.slice(0, limit - 1).trimEnd() + '…';
const words = (value: string): Set<string> => new Set(normalize(value).split(' ').filter(word => word.length > 3 && !['every', 'weekly', 'daily', 'review', 'prepare', 'summary', 'schedule', 'work', 'with', 'from', 'this', 'that', 'have', 'your'].includes(word)));
function covered(candidate: ScheduleSuggestion, schedules: readonly Schedule[]): boolean {
    return schedules.some(schedule => {
        const text = `${schedule.title} ${schedule.instructions}`;
        const sameSubject = !candidate.subject || normalize(text).includes(normalize(candidate.subject));
        const broadProjectReview = /(?:all|active|our|the) projects/i.test(text);
        if (concepts[candidate.intent]?.test(text))
            return sameSubject || broadProjectReview;
        if (!sameSubject)
            return false;
        const a = words(candidate.instructions), b = words(text);
        const overlap = [...a].filter(word => b.has(word)).length;
        return a.size > 0 && overlap / Math.max(a.size, b.size) >= 0.65;
    });
}
const examples: Array<[
    string,
    string,
    string,
    string
]> = [
    ['projects', 'Project progress', 'Summarize progress, blockers and next steps for a weekly review.', 'Every Friday at 3 pm, review the projects I select and draft a concise progress summary with blockers and next steps. Ask me which projects to include.'],
    ['deadlines', 'Deadline check', 'Prepare a daily list of work approaching its due date.', 'Every weekday at 9 am, review authorized tasks with recorded due dates and draft a deadline summary. Do not invent dates or change deadlines.'],
    ['approvals', 'Approval digest', 'Bring pending decisions together in a concise daily brief.', 'Every weekday at 9 am, summarize pending approvals I am permitted to see. Do not make approval decisions.'],
    ['finance', 'Weekly finances', 'Review recorded expenses and highlight items needing attention.', 'Every Friday at 3 pm, draft a review of the financial records I authorize. Ask which records to use; do not assume a finance integration is connected.'],
    ['customers', 'Customer follow-ups', 'Draft a review of customer conversations that need a response.', 'Every weekday at 10 am, review the customer conversations I authorize and draft a follow-up list. Ask which source to use. Do not send messages.'],
    ['priorities', 'Tomorrow’s priorities', 'Prepare a short plan from open work and upcoming deadlines.', 'Every weekday at 4 pm, review authorized open tasks and recorded deadlines, then suggest priorities for tomorrow. Do not reassign work.'],
    ['competitors', 'Competitor brief', 'Collect relevant announcements in a weekly, sourced brief.', 'Every Monday at 9 am, prepare a sourced competitor brief. Ask which companies to monitor and confirm available research tools.'],
    ['inventory', 'Inventory review', 'Highlight stock records that may need a closer look.', 'Every Friday at 2 pm, review inventory records I authorize and prepare a list for human review. Ask for the data source and thresholds. Do not place orders.'],
    ['meetings', 'Meeting preparation', 'Gather relevant project notes into a concise meeting agenda.', 'Every Monday at 9 am, prepare an agenda from the projects and notes I select. Ask which meeting this supports.'],
    ['people', 'Team workload', 'Prepare a weekly view of recorded assignments and blockers.', 'Every Friday at 2 pm, summarize recorded team assignments and blockers from authorized tasks. Do not infer employee presence or reassign work.'],
    ['security', 'Access review', 'Prepare a review checklist for the tools and records you choose.', 'Every month, prepare an access-review checklist for the tools I select. Confirm a supported recurrence and authorized data sources first. Do not change access.'],
    ['outcomes', 'Doat results', 'Collect recorded outcomes and errors in a weekly review.', 'Every Friday at 3 pm, summarize recorded Doat run outcomes and errors from authorized tasks. Do not invent runs or retry external actions.'],
];
/** Uses only already-available local workspace records; never fetches or expands permissions. */
export function buildScheduleSuggestions(state: GwiraLocalState, schedules: readonly Schedule[], now: number): ScheduleSuggestion[] {
    const scope = state.workspace.id;
    const validScope = state.workspace.organizationId === state.organization.id;
    const tasks = validScope ? state.tasks.filter(task => task.workspaceId === scope) : [];
    const taskIds = new Set(tasks.map(task => task.id));
    const projects = validScope ? state.projects.filter(project => project.workspaceId === scope) : [];
    const active = tasks.filter(task => !['done'].includes(task.status));
    const localSchedules = schedules.filter(schedule => schedule.workspaceId === scope && schedule.status !== 'deleted');
    const candidates: ScheduleSuggestion[] = [];
    const add = (intent: string, title: string, description: string, instructions: string, reason: string, score: number, subject?: string): void => {
        candidates.push({ id: `${intent}:${subject ? normalize(subject) : 'workspace'}`, intent, title: short(title), description, instructions, reason, score, subject, source: 'workspace' });
    };
    // Reuse the shared date-only attention rules: work due today is not overdue.
    const overdueIds = new Set(validScope ? buildWorkItems(localStateToGraphRecords(state), { today: new Date(now) }).items.filter(item => item.attention.some(reason => reason.kind === 'overdue')).map(item => item.id) : []);
    const overdue = active.filter(task => overdueIds.has(task.id) && task.dueDate && Number.isFinite(Date.parse(task.dueDate)));
    if (overdue.length)
        add('deadlines', 'Review overdue work', `${overdue.length} open task${overdue.length === 1 ? ' has' : 's have'} a recorded due date in the past. Prepare a daily review.`, 'Every weekday at 9 am, review overdue tasks in this workspace using their recorded due dates. Draft a concise summary with owners and next steps. Do not change deadlines.', 'Based on recorded due dates of open tasks in this workspace.', 100 + Math.min(overdue.length, 10));
    const approvals = validScope ? state.approvals.filter(approval => taskIds.has(approval.taskId) && approval.status === 'pending') : [];
    if (approvals.length)
        add('approvals', 'Pending decisions', `${approvals.length} recorded approval${approvals.length === 1 ? ' is' : 's are'} awaiting a decision. Prepare a daily digest.`, 'Every weekday at 9 am, summarize pending approvals linked to tasks in this workspace, including their instructions and recorded reviewer information. Do not decide approvals.', 'Based on pending approval records linked to visible workspace tasks.', 96 + Math.min(approvals.length, 10));
    const blocked = active.filter(task => task.status === 'blocked');
    if (blocked.length)
        add('blockers', 'Blocker check', `${blocked.length} task${blocked.length === 1 ? ' is' : 's are'} marked blocked. Draft a concise follow-up brief.`, 'Every weekday at 9 am, review tasks marked blocked in this workspace and draft a brief of recorded blockers and possible next steps. Do not invent causes or modify assignments.', 'Based on the recorded Blocked task status.', 94 + Math.min(blocked.length, 10));
    const failed = tasks.filter(task => task.agentRun?.status === 'error');
    if (failed.length)
        add('failures', 'Review failed runs', `${failed.length} task${failed.length === 1 ? ' has' : 's have'} a recorded execution error. Collect errors for review.`, 'Every weekday at 10 am, summarize recorded Doat execution errors in this workspace and prepare a recovery checklist for review. Do not automatically retry or repeat external actions.', 'Based on actual AgentRun error records, not inferred Doat activity.', 92 + Math.min(failed.length, 10));
    const urgent = active.filter(task => ['urgent', 'high'].includes(task.priority));
    if (urgent.length)
        add('priorities', 'Priority brief', `${urgent.length} open task${urgent.length === 1 ? ' has' : 's have'} a high or urgent priority. Prepare a daily brief.`, 'Every weekday at 9 am, summarize open high-priority and urgent tasks in this workspace with their recorded owners, deadlines and blockers. Do not change priorities.', 'Based on recorded task priorities.', 84);
    for (const project of projects) {
        const work = active.filter(task => task.projectId === project.id);
        if (work.length)
            add('projects', `${short(project.name, 19)} review`, `${work.length} open task${work.length === 1 ? '' : 's'} in ${project.name}. Prepare a weekly progress brief.`, `Every Friday at 3 pm, review authorized tasks in the project “${project.name}” and draft a progress summary of completed work, open tasks and recorded blockers. Do not modify the project.`, `Based on tasks explicitly linked to ${project.name}.`, 80 + Math.min(work.length, 8), project.name);
    }
    const dependencies = active.filter(task => task.dependsOnTaskIds?.some(id => taskIds.has(id)));
    if (dependencies.length)
        add('workflow', 'Workflow handoffs', `${dependencies.length} open task${dependencies.length === 1 ? ' has' : 's have'} explicit dependencies. Review handoffs each week.`, 'Every Monday at 9 am, review explicitly recorded task dependencies in this workspace and draft a workflow handoff brief. Do not infer dependencies or execute the workflow.', 'Based on explicit task dependency records; no executable workflow registry is assumed.', 78);
    const repeated = new Map<string, typeof tasks>();
    for (const task of tasks) {
        const key = normalize(task.title);
        if (key.length < 5)
            continue;
        repeated.set(key, [...(repeated.get(key) ?? []), task]);
    }
    for (const work of repeated.values())
        if (work.length >= 2 && work.some(task => task.agentRun || task.status === 'done')) {
            const title = work[0]!.title;
            add('recurring', 'Repeated work review', `“${title}” appears in ${work.length} recorded tasks. Assess whether a routine would help.`, `Every Friday at 3 pm, review the recorded tasks titled “${title}” in this workspace and summarize their outcomes. Help me confirm whether recurring work is appropriate before proposing execution.`, 'Based on repeated task titles with a completion or execution record; no recurrence is assumed.', 76, title);
        }
    const outcomes = tasks.filter(task => task.agentRun?.status === 'completed');
    if (outcomes.length)
        add('outcomes', 'Doat outcome review', `${outcomes.length} task${outcomes.length === 1 ? ' has' : 's have'} a recorded completed run. Prepare a weekly outcomes review.`, 'Every Friday at 3 pm, summarize actual recorded Doat run outcomes in this workspace. Link to existing tasks and results where available. Do not invent outputs or live activity.', 'Based on completed AgentRun records.', 72);
    const activity = validScope ? state.activity.filter(event => event.workspaceId === scope && (!event.taskId || taskIds.has(event.taskId)) && Number.isFinite(Date.parse(event.occurredAt))) : [];
    const activityDays = new Set(activity.map(event => event.occurredAt.slice(0, 10)));
    if (activityDays.size >= 2 && activity.length >= 3)
        add('activity', 'Workspace activity', `Recorded activity spans ${activityDays.size} days. Collect changes in a weekly digest.`, 'Every Friday at 3 pm, prepare an activity digest from recorded workspace events I am permitted to see. Distinguish recorded facts from unknowns and do not infer employee presence or business outcomes.', 'Based on recorded activity on multiple days, not an assumed recurring business process.', 70);
    for (const [intent, title, description, instructions] of examples)
        candidates.push({ id: `example:${intent}`, intent, title, description: `General example · ${description}`, instructions, reason: 'General business example; this is not a claim about company activity or connected data.', source: 'general', score: 0 });
    const seen = new Set<string>();
    return candidates.sort((a, b) => b.score - a.score || (a.source === 'general' && b.source === 'general' ? 0 : a.id.localeCompare(b.id))).filter(candidate => {
        if (seen.has(candidate.intent) || covered(candidate, localSchedules))
            return false;
        seen.add(candidate.intent);
        return true;
    }).slice(0, 6);
}
/** Draft preparation is separate from sending or schedule registration. */
export function scheduleDraftInstruction(instructions: string): string { return `/schedule ${instructions.trim()}`; }
