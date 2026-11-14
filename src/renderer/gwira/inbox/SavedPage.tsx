import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { InboxEmptyState } from './InboxEmptyState.js';
import { InboxRow } from './InboxRow.js';
import { InboxGroupHeading, InboxViewList } from './InboxViewList.js';
import { ShellIcon } from '../../components/Icon.js';
import { MessageAvatar } from './MessageFeed.js';
import { SAVED_MODES, groupSaved, savedPlace, savedTimeLabel, type SavedMode, type SavedView } from './savedModel.js';
import type { ConversationListItem } from '../messaging/domain/selectors.js';
import type { DispatchResult } from '../messaging/data/localRepository.js';
import type { TaskStatus } from '../domain/types.js';
import './saved.css';

export interface SavedPageProps {
  /** The current person's saved messages, newest save first. */
  views: readonly SavedView[];
  conversations: readonly ConversationListItem[];
  /** Task status by id, for the small status glyph on linked-record chips. */
  taskStatuses: ReadonlyMap<string, TaskStatus>;
  /** Organization, workspace and actor identity. The grouping choice resets when it changes. */
  scopeKey: string;
  onOpenMessage: (conversationId: string, messageId: string) => void;
  /** `savedAt` restores the original save time when Undo re-saves a message. */
  onSetSaved: (messageId: string, saved: boolean, savedAt?: string) => DispatchResult;
  now?: Date;
}

interface UndoEntry { messageId: string; savedAt: string }
const UNDO_MS = 5000;
const STATUS_LABELS: Record<TaskStatus, string> = { backlog: 'Backlog', todo: 'To do', in_progress: 'In progress', in_review: 'In review', done: 'Done', blocked: 'Blocked' };

export function SavedPage({ views, conversations, taskStatuses, scopeKey, onOpenMessage, onSetSaved, now: nowProp }: SavedPageProps): React.ReactElement {
  const [mode, setMode] = useState<SavedMode>('date');
  const [error, setError] = useState('');
  const [undo, setUndo] = useState<UndoEntry[]>([]);
  const rootRef = useRef<HTMLElement>(null);
  const pendingFocus = useRef<string | undefined>(undefined);
  const now = useMemo(() => nowProp ?? new Date(), [views, nowProp]);
  const places = useMemo(() => new Map(conversations.map((item) => [item.conversation.id, item] as const)), [conversations]);
  const groups = useMemo(() => groupSaved(views, mode, now, places), [views, mode, now, places]);

  useLayoutEffect(() => { setMode('date'); setError(''); setUndo([]); }, [scopeKey]);

  useLayoutEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = undefined;
    const row = rootRef.current?.querySelector<HTMLElement>(`[data-inbox-row="${CSS.escape(target)}"]`);
    (row ?? rootRef.current?.querySelector<HTMLElement>('[data-saved-focus]'))?.focus();
  }, [views, mode]);

  // The Undo offer lasts five seconds from the latest unsave.
  useEffect(() => {
    if (undo.length === 0) return undefined;
    const timer = window.setTimeout(() => setUndo([]), UNDO_MS);
    return () => window.clearTimeout(timer);
  }, [undo]);

  const unsave = (view: SavedView): void => {
    const flat = groups.flatMap((group) => group.views);
    const index = flat.indexOf(view);
    pendingFocus.current = (flat[index + 1] ?? flat[index - 1])?.message.id;
    const result = onSetSaved(view.message.id, false);
    setError(result.ok ? '' : result.error.message);
    if (result.ok) setUndo((current) => [...current, { messageId: view.message.id, savedAt: view.savedAt }]);
  };
  const undoAll = (): void => {
    let failure = '';
    for (const entry of undo) {
      const result = onSetSaved(entry.messageId, true, entry.savedAt);
      if (!result.ok) failure = result.error.message;
    }
    pendingFocus.current = undo[0]?.messageId;
    setError(failure);
    setUndo([]);
  };

  const summary = views.length === 0 ? 'Messages you keep for later' : `${views.length} saved ${views.length === 1 ? 'message' : 'messages'}`;

  return <section ref={rootRef} className="gw-saved" aria-labelledby="gw-saved-title">
    <header className="gw-saved__header">
      <h2 id="gw-saved-title" tabIndex={-1} data-saved-focus>Saved</h2>
      <p className="gw-saved__summary">{summary}</p>
    </header>
    {views.length > 0 ? <div className="gw-saved__modes" role="group" aria-label="Group saved messages by">
      {SAVED_MODES.map((item) => <button type="button" key={item.id} aria-pressed={mode === item.id} onClick={() => setMode(item.id)}>{item.label}</button>)}
    </div> : null}
    {error ? <p className="gw-saved__error" role="alert">{error}</p> : null}
    <div className="gw-saved__scroll">
      {views.length === 0
        ? <InboxEmptyState icon={<ShellIcon name="bookmark" />} title="Nothing saved yet" description="Save a message to keep it handy. Hover a message and choose Save." />
        : <InboxViewList label="Saved messages">
          {groups.map((group) => <React.Fragment key={group.id}>
            <InboxGroupHeading>{group.label}</InboxGroupHeading>
            {group.views.map((view) => <SavedRow key={view.message.id} view={view} now={now} taskStatuses={taskStatuses}
              place={savedPlace(view, places.get(view.message.conversationId))} onOpen={() => onOpenMessage(view.message.conversationId, view.message.id)} onUnsave={() => unsave(view)} />)}
          </React.Fragment>)}
        </InboxViewList>}
    </div>
    {undo.length > 0 ? <div className="gw-saved__toast" role="status">
      <span>{undo.length === 1 ? 'Message unsaved' : `${undo.length} messages unsaved`}</span>
      <button type="button" onClick={undoAll}>Undo</button>
    </div> : null}
  </section>;
}

interface SavedRowProps { view: SavedView; place: string; now: Date; taskStatuses: ReadonlyMap<string, TaskStatus>; onOpen: () => void; onUnsave: () => void }

function SavedRow({ view, place, now, taskStatuses, onOpen, onUnsave }: SavedRowProps): React.ReactElement {
  const { message, author, conversationUnavailable } = view;
  const isDoat = author.ref.kind === 'doat';
  const body = message.body.trim() ? message.body.replace(/\s+/g, ' ') : 'Linked records';
  const chips = view.refs.map((ref, index) => {
    const status = ref.status === 'available' && ref.taskId ? taskStatuses.get(ref.taskId) : undefined;
    const kind = ref.ref.kind === 'approval' ? 'Approval' : ref.ref.kind === 'task' ? 'Task' : undefined;
    return <span key={index} className={`gw-saved-chip${ref.status === 'unavailable' ? ' is-unavailable' : ''}`} title={`${kind ? `${kind}: ` : ''}${ref.label}${status ? ` · ${STATUS_LABELS[status]}` : ''}`}>
      {status ? <span className="gw-saved-chip__glyph" data-status={status} role="img" aria-label={STATUS_LABELS[status]} /> : null}
      <span className="gw-saved-chip__label">{ref.label}</span>
        {status ? <span className="gw-saved-chip__status"> · {STATUS_LABELS[status]}</span> : null}
    </span>;
  });
  return <InboxRow rowKey={message.id} density="compact" rowClassName={`is-saved${conversationUnavailable ? ' is-unavailable' : ''}`} onOpen={conversationUnavailable ? () => undefined : onOpen}
    ariaLabel={`${author.name} in ${place}${conversationUnavailable ? ', cannot be opened' : ''}: ${body}`}
    avatar={isDoat
      ? <span className="gw-msg-avatar gw-msg-avatar--doat gw-inbox-row__doat-mark"><ShellIcon name="doats" /></span>
      : <MessageAvatar author={author.ref} name={author.name} />}
    title={<>{author.name}{isDoat ? <span className="gw-inbox-row__tag"> Doat</span> : null} <span className={conversationUnavailable ? 'gw-saved__place is-unavailable' : 'gw-saved__place'}>{conversationUnavailable ? `· ${place}` : `in ${place}`}</span></>}
    time={{ iso: view.savedAt, label: savedTimeLabel(view.savedAt, now) }}
    preview={body}
    meta={chips.length > 0 ? <span className="gw-saved-chips">{chips}</span> : undefined}
    actions={<button type="button" className="gw-inbox-row__action is-on" aria-label={`Unsave message from ${author.name}`} title="Unsave" onClick={onUnsave}><ShellIcon name="bookmark" /></button>} />;
}
