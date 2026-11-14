/** Local scheduling records are triggers for review, never execution authorization. */
export type Recurrence = {
    frequency: 'daily' | 'weekdays' | 'weekly';
    time: string;
    weekday: number;
    timeZone: string;
};
export interface ScheduleInput {
    title: string;
    instructions: string;
    recurrence: Recurrence;
    doatId: string;
    ownerId: string;
}
export interface Schedule extends ScheduleInput {
    id: string;
    workspaceId: string;
    version: number;
    status: 'registered' | 'paused' | 'deleted';
    nextRun?: string;
    createdAt: string;
    updatedAt: string;
}
export interface ScheduleRun {
    id: string;
    scheduleId: string;
    workspaceId: string;
    source: 'timer' | 'manual';
    dueAt: string;
    createdAt: string;
    status: 'awaiting_review' | 'dismissed';
    instructions: string;
    doatId: string;
}
export interface ScheduleAudit {
    id: string;
    scheduleId: string;
    at: string;
    action: 'created' | 'edited' | 'paused' | 'resumed' | 'deleted' | 'triggered' | 'dismissed';
}
export interface ScheduleSnapshot {
    serviceError?: string;
    schedules: Schedule[];
    runs: ScheduleRun[];
    audit: ScheduleAudit[];
}
export type ScheduleCommand = {
    kind: 'save';
    input: ScheduleInput;
    id?: string;
    version?: number;
} | {
    kind: 'pause' | 'resume' | 'delete' | 'run';
    id: string;
    version: number;
} | {
    kind: 'dismiss';
    runId: string;
};
export interface SchedulesApi {
    read(workspaceId: string): Promise<ScheduleSnapshot>;
    change(workspaceId: string, command: ScheduleCommand): Promise<ScheduleSnapshot>;
}
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export function validateScheduleInput(value: unknown): asserts value is ScheduleInput {
    const input = value as ScheduleInput;
    if (!input || typeof input !== 'object')
        throw new Error('Schedule details are required.');
    for (const [key, max] of [['title', 160], ['instructions', 12000], ['doatId', 160], ['ownerId', 160]] as const) {
        if (typeof input[key] !== 'string' || !input[key].trim() || input[key].length > max)
            throw new Error(`Enter a valid ${key === 'doatId' ? 'Doat' : key === 'ownerId' ? 'owner' : key}.`);
    }
    const rule = input.recurrence;
    if (!rule || !['daily', 'weekdays', 'weekly'].includes(rule.frequency) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(rule.time) || !Number.isInteger(rule.weekday) || rule.weekday < 0 || rule.weekday > 6)
        throw new Error('Confirm a valid recurrence and time.');
    if (typeof rule.timeZone !== 'string' || rule.timeZone.length > 100)
        throw new Error('Enter an IANA timezone, such as Africa/Lusaka.');
    try {
        new Intl.DateTimeFormat('en', { timeZone: rule.timeZone }).format();
    }
    catch {
        throw new Error('Enter an IANA timezone, such as Africa/Lusaka.');
    }
}
/** UTC search respects IANA DST transitions. Missing wall times are skipped; repeated wall times run once. */
export function nextOccurrence(rule: Recurrence, after: string): string {
    const start = Date.parse(after);
    if (!Number.isFinite(start))
        throw new Error('Invalid scheduler clock.');
    const format = new Intl.DateTimeFormat('en-CA', { timeZone: rule.timeZone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    const parts = (ms: number) => Object.fromEntries(format.formatToParts(ms).map(p => [p.type, p.value]));
    const prior = parts(start), priorDay = `${prior.year}-${prior.month}-${prior.day}`;
    const priorTime = `${prior.hour}:${prior.minute}`;
    for (let ms = Math.floor(start / 60000) * 60000 + 60000; ms <= start + 9 * 86400000; ms += 60000) {
        const p = parts(ms), time = `${p.hour}:${p.minute}`, day = `${p.year}-${p.month}-${p.day}`;
        if (time !== rule.time || (day === priorDay && time <= priorTime))
            continue;
        const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday!);
        if (rule.frequency === 'weekly' && weekday !== rule.weekday)
            continue;
        if (rule.frequency === 'weekdays' && (weekday === 0 || weekday === 6))
            continue;
        return new Date(ms).toISOString();
    }
    throw new Error('No occurrence found in the next nine days. Check recurrence.');
}
export function recurrenceLabel(rule: Recurrence): string { return `${rule.frequency === 'weekly' ? `Every ${WEEKDAYS[rule.weekday]}` : rule.frequency === 'weekdays' ? 'Every weekday' : 'Every day'} at ${rule.time} · ${rule.timeZone}`; }
/** A deliberately small parser. Suggestions always require explicit confirmation. */
export function suggestRecurrence(text: string, timeZone: string): Recurrence | undefined {
    const lower = text.toLowerCase();
    const day = WEEKDAYS.findIndex(d => new RegExp(`\\b${d.toLowerCase()}s?\\b`).test(lower));
    const frequency = /\bweekdays?\b/.test(lower) ? 'weekdays' : day >= 0 || /\bweekly\b/.test(lower) ? 'weekly' : /\bdaily\b|every day|every morning/.test(lower) ? 'daily' : undefined;
    if (!frequency)
        return undefined;
    const match = lower.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/);
    let hour = match ? Number(match[1]) : 9;
    if (match?.[3] && (hour < 1 || hour > 12))
        return undefined;
    if (match?.[3])
        hour = hour % 12 + (match[3] === 'pm' ? 12 : 0);
    if (hour > 23 || Number(match?.[2] ?? 0) > 59)
        return undefined;
    return { frequency, weekday: day >= 0 ? day : 1, time: `${String(hour).padStart(2, '0')}:${match?.[2] ?? '00'}`, timeZone };
}
