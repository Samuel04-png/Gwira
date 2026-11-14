import { randomUUID } from 'node:crypto';
import { renameSync } from 'node:fs';
import { mkdir, open, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { nextOccurrence, validateScheduleInput, type Schedule, type ScheduleCommand, type ScheduleSnapshot } from '../../../shared/schedules.js';
type Store = ScheduleSnapshot & {
    schemaVersion: 1;
};
const empty = (): Store => ({ schemaVersion: 1, schedules: [], runs: [], audit: [] });
const clone = <T>(value: T): T => structuredClone(value);
/** Single desktop process; exclusive file lock prevents two app instances from writing concurrently. */
export class ScheduleService {
    private tail: Promise<unknown> = Promise.resolve();
    constructor(private file: string, private clock: () => string = () => new Date().toISOString()) { }
    private transaction<T>(operation: (state: Store) => T, write = true, assertCurrent: () => void = () => {}): Promise<T> {
        const work = this.tail.then(async () => {
            assertCurrent();
            await mkdir(path.dirname(this.file), { recursive: true, mode: 0o700 });
            let lock;
            try {
                lock = await open(`${this.file}.lock`, 'wx', 0o600);
            }
            catch (error) {
                if ((error as NodeJS.ErrnoException).code !== 'EEXIST')
                    throw new Error('Schedule storage is unavailable. Check disk access and retry.');
                const pid = Number(await readFile(`${this.file}.lock`, 'utf8').catch(() => ''));
                let stale = false;
                if (Number.isInteger(pid) && pid > 0) {
                    try {
                        process.kill(pid, 0);
                    }
                    catch (cause) {
                        stale = (cause as NodeJS.ErrnoException).code === 'ESRCH';
                    }
                }
                if (stale) {
                    await unlink(`${this.file}.lock`);
                    lock = await open(`${this.file}.lock`, 'wx', 0o600);
                }
                else
                    throw new Error('Schedule storage is locked by another app. Close other Gwira instances and retry.');
            }
            try {
                await lock.writeFile(String(process.pid));
                let state = empty();
                try {
                    const raw = await readFile(this.file, 'utf8');
                    if (raw.length > 20 * 1024 * 1024)
                        throw new Error('Schedule history exceeds the local storage limit.');
                    state = JSON.parse(raw) as Store;
                    if (state.schemaVersion !== 1 || !Array.isArray(state.schedules) || !Array.isArray(state.runs) || !Array.isArray(state.audit))
                        throw new Error('Invalid schedule storage.');
                    if (new Set(state.schedules.map(schedule => schedule.id)).size !== state.schedules.length)
                        throw new Error('Duplicate schedules in storage.');
                    for (const run of state.runs)
                        if (!run || !['awaiting_review', 'dismissed'].includes(run.status) || typeof run.instructions !== 'string' || !state.schedules.some(schedule => schedule.id === run.scheduleId && schedule.workspaceId === run.workspaceId) || !Number.isFinite(Date.parse(run.createdAt)) || !Number.isFinite(Date.parse(run.dueAt)))
                            throw new Error('Invalid run history.');
                    for (const event of state.audit)
                        if (!event || !state.schedules.some(schedule => schedule.id === event.scheduleId) || !Number.isFinite(Date.parse(event.at)))
                            throw new Error('Invalid schedule activity.');
                    for (const schedule of state.schedules) {
                        validateScheduleInput(schedule);
                        if (!['registered', 'paused', 'deleted'].includes(schedule.status) || !Number.isInteger(schedule.version) || !schedule.workspaceId || !schedule.id || (schedule.status === 'registered' && !schedule.nextRun) || (schedule.nextRun && !Number.isFinite(Date.parse(schedule.nextRun))))
                            throw new Error('Invalid stored schedule.');
                    }
                }
                catch (error) {
                    if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
                        throw error;
                }
                assertCurrent();
                const result = operation(state);
                if (write) {
                    const temporary = `${this.file}.${randomUUID()}.tmp`;
                    const handle = await open(temporary, 'wx', 0o600);
                    try {
                        await handle.writeFile(JSON.stringify(state));
                        await handle.sync();
                    }
                    finally {
                        await handle.close();
                    }
                    try {
                        assertCurrent();
                        renameSync(temporary, this.file);
                    }
                    finally {
                        await unlink(temporary).catch(() => { });
                    }
                    const directory = await open(path.dirname(this.file), 'r');
                    try {
                        await directory.sync();
                    }
                    finally {
                        await directory.close();
                    }
                }
                return clone(result);
            }
            finally {
                await lock.close();
                await unlink(`${this.file}.lock`);
            }
        });
        this.tail = work.catch(() => { });
        return work;
    }
    private snapshot(state: Store, workspaceId: string): ScheduleSnapshot {
        const schedules = state.schedules.filter(s => s.workspaceId === workspaceId);
        const ids = new Set(schedules.map(s => s.id));
        return { schedules: schedules.filter(s => s.status !== 'deleted'), runs: state.runs.filter(r => r.workspaceId === workspaceId), audit: state.audit.filter(a => ids.has(a.scheduleId)) };
    }
    read(workspaceId: string, assertCurrent?: () => void): Promise<ScheduleSnapshot> { return this.transaction(state => this.snapshot(state, workspaceId), false, assertCurrent); }
    change(workspaceId: string, command: ScheduleCommand, assertCurrent?: () => void): Promise<ScheduleSnapshot> {
        if (typeof workspaceId !== 'string' || !workspaceId || workspaceId.length > 160)
            return Promise.reject(new Error('A local workspace is required.'));
        return this.transaction(state => {
            const now = this.clock();
            const audit = (scheduleId: string, action: Store['audit'][number]['action']) => state.audit.push({ id: randomUUID(), scheduleId, at: now, action });
            if (command.kind === 'dismiss') {
                const run = state.runs.find(r => r.id === command.runId && r.workspaceId === workspaceId);
                if (!run || run.status !== 'awaiting_review')
                    throw new Error('This review is no longer pending. Refresh history.');
                run.status = 'dismissed';
                audit(run.scheduleId, 'dismissed');
            }
            else if (command.kind === 'save') {
                validateScheduleInput(command.input);
                const input = { title: command.input.title.trim(), instructions: command.input.instructions.trim(), doatId: command.input.doatId, ownerId: command.input.ownerId, recurrence: { ...command.input.recurrence } };
                if (command.id) {
                    const schedule = this.find(state, workspaceId, command.id, command.version);
                    Object.assign(schedule, input, { version: schedule.version + 1, updatedAt: now });
                    schedule.nextRun = schedule.status === 'registered' ? nextOccurrence(schedule.recurrence, now) : undefined;
                    audit(schedule.id, 'edited');
                }
                else {
                    const schedule: Schedule = { ...input, id: randomUUID(), workspaceId, status: 'registered', version: 1, nextRun: nextOccurrence(input.recurrence, now), createdAt: now, updatedAt: now };
                    state.schedules.push(schedule);
                    audit(schedule.id, 'created');
                }
            }
            else {
                const schedule = this.find(state, workspaceId, command.id, command.version);
                if (command.kind === 'run')
                    this.enqueue(state, schedule, 'manual', now, now);
                else if (command.kind === 'pause' || command.kind === 'resume' || command.kind === 'delete') {
                    schedule.status = command.kind === 'pause' ? 'paused' : command.kind === 'resume' ? 'registered' : 'deleted';
                    schedule.nextRun = schedule.status === 'registered' ? nextOccurrence(schedule.recurrence, now) : undefined;
                    schedule.version++;
                    schedule.updatedAt = now;
                    audit(schedule.id, command.kind === 'pause' ? 'paused' : command.kind === 'resume' ? 'resumed' : 'deleted');
                    if (command.kind === 'delete')
                        for (const run of state.runs.filter(r => r.scheduleId === schedule.id && r.status === 'awaiting_review')) {
                            run.status = 'dismissed';
                            audit(schedule.id, 'dismissed');
                        }
                }
                else
                    throw new Error('Unknown schedule command.');
            }
            return this.snapshot(state, workspaceId);
        }, true, assertCurrent);
    }
    private find(state: Store, workspaceId: string, id: string, version?: number): Schedule {
        const schedule = state.schedules.find(s => s.id === id && s.workspaceId === workspaceId && s.status !== 'deleted');
        if (!schedule)
            throw new Error('Schedule not found in this workspace.');
        if (version !== schedule.version)
            throw new Error('This schedule changed. Refresh before saving again.');
        return schedule;
    }
    private enqueue(state: Store, schedule: Schedule, source: 'timer' | 'manual', dueAt: string, now: string): void {
        // One pending review per schedule; no automatic external effects or retry duplication.
        if (state.runs.some(r => r.scheduleId === schedule.id && r.status === 'awaiting_review')) {
            if (source === 'manual')
                throw new Error('A run is already waiting for review. Review or dismiss it first.');
            return;
        }
        state.runs.push({ id: randomUUID(), scheduleId: schedule.id, workspaceId: schedule.workspaceId, source, dueAt, createdAt: now, status: 'awaiting_review', instructions: schedule.instructions, doatId: schedule.doatId });
        state.audit.push({ id: randomUUID(), scheduleId: schedule.id, at: now, action: 'triggered' });
    }
    /** On reopen, coalesce missed occurrences into one review. Never replay a backlog of effects. */
    tick(assertCurrent?: () => void): Promise<void> {
        return this.transaction(state => {
            const now = this.clock();
            for (const schedule of state.schedules) {
                if (schedule.status !== 'registered' || !schedule.nextRun || schedule.nextRun > now)
                    continue;
                this.enqueue(state, schedule, 'timer', schedule.nextRun, now);
                schedule.nextRun = nextOccurrence(schedule.recurrence, now);
                schedule.updatedAt = now;
                schedule.version++;
            }
        }, true, assertCurrent);
    }
}
