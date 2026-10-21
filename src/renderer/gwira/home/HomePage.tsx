import React, { useMemo } from 'react';
import type { GwiraLocalState } from '../domain/types.js';
import { overdueTasks, pendingApprovals, recentActivity, summarizeWorkspace, taskTitle } from './homeViewModel.js';

export interface HomePageProps {
  state: GwiraLocalState;
  /** Injected by the controller for deterministic rendering and tests. */
  today?: string;
  onOpenTask: (taskId: string) => void;
  onOpenMyWork: () => void;
  onOpenInbox: () => void;
}

function currentDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Local workspace overview. It displays only records persisted in GwiraLocalState. */
export function HomePage({ state, today = currentDate(), onOpenTask, onOpenMyWork, onOpenInbox }: HomePageProps): React.ReactElement {
  const summary = useMemo(() => summarizeWorkspace(state), [state]);
  const overdue = useMemo(() => overdueTasks(state.tasks, today), [state.tasks, today]);
  const approvals = useMemo(() => pendingApprovals(state.approvals), [state.approvals]);
  const activity = useMemo(() => recentActivity(state.activity), [state.activity]);

  return <section className="gwira-home" aria-label="Dashboard">
    <header className="gwira-home__header">
      <div><h1>Dashboard</h1><p>{state.workspace.name} · local workspace overview</p></div>
      <button type="button" onClick={onOpenMyWork}>Open My Work</button>
    </header>
    <section className="gwira-home__summary" aria-label="Workspace summary">
      <article><strong>{summary.totalTasks}</strong><span>All tasks</span></article>
      <article><strong>{summary.activeTasks}</strong><span>Active</span></article>
      <article><strong>{summary.inReview}</strong><span>In review</span></article>
      <article><strong>{summary.completed}</strong><span>Completed</span></article>
      <article><strong>{summary.blocked}</strong><span>Blocked</span></article>
      <button type="button" className="gwira-home__summary-action" onClick={onOpenInbox}><strong>{summary.pendingApprovals}</strong><span>Pending approvals</span></button>
    </section>
    <div className="gwira-home__content">
      <section className="gwira-home__panel" aria-labelledby="gwira-overdue-heading">
        <h2 id="gwira-overdue-heading">Overdue work</h2>
        {overdue.length === 0 ? <p>No overdue tasks.</p> : <ul>{overdue.map((task) => <li key={task.id}><button type="button" onClick={() => onOpenTask(task.id)}>{task.title}</button><time dateTime={task.dueDate}>Due {task.dueDate?.slice(0, 10)}</time></li>)}</ul>}
      </section>
      <section className="gwira-home__panel" aria-labelledby="gwira-pending-heading">
        <h2 id="gwira-pending-heading">Pending approvals</h2>
        {approvals.length === 0 ? <p>No approvals awaiting a decision.</p> : <ul>{approvals.map((approval) => <li key={approval.id}><button type="button" onClick={() => onOpenTask(approval.taskId)}>{taskTitle(state, approval.taskId)}</button><span>Result {approval.resultId}</span></li>)}</ul>}
      </section>
      <section className="gwira-home__panel gwira-home__activity" aria-labelledby="gwira-activity-heading">
        <h2 id="gwira-activity-heading">Recent activity</h2>
        {activity.length === 0 ? <p>Activity will appear here as work is created and updated.</p> : <ol>{activity.map((entry) => <li key={entry.id}>{entry.taskId ? <button type="button" onClick={() => onOpenTask(entry.taskId!)}>{entry.summary}</button> : <span>{entry.summary}</span>}<time dateTime={entry.occurredAt}>{entry.occurredAt}</time></li>)}</ol>}
      </section>
    </div>
  </section>;
}
