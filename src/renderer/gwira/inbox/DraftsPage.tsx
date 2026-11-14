import { Icon } from "../../components/Icon.js";
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { InboxEmptyState } from './InboxEmptyState.js';
import { InboxRow } from './InboxRow.js';
import { InboxGroupHeading, InboxViewList } from './InboxViewList.js';
import { ShellIcon } from '../../components/Icon.js';
import { avatarInitials } from './inboxNavModel.js';
import { draftDestination, editedLabel, failureLabel, groupDraftEntries, type DraftEntry } from './draftsModel.js';
import type { ConversationListItem } from '../messaging/domain/selectors.js';
import type { DispatchResult } from '../messaging/data/localRepository.js';
import type { Draft, EntityRef, Message } from '../messaging/domain/types.js';
import './drafts.css';

export interface DraftsPageProps {
  /** Failed sends first, then drafts by last edit. Already limited to the current actor. */
  entries: readonly DraftEntry[];
  conversations: readonly ConversationListItem[];
  /** Organization, workspace and actor identity. Pending Undo offers are dropped when it changes. */
  scopeKey: string;
  onResumeDraft: (draft: Draft) => void;
  onResumeFailed: (message: Message, mode: 'open' | 'edit') => void;
  onRetry: (messageId: string) => DispatchResult;
  /** Deletes the author's own failed message. Called only after the Undo window closes. */
  onDeleteFailed: (messageId: string) => DispatchResult;
  onSetDraft: (conversationId: string, body: string, threadRootId?: string, actorPersonId?: string, refs?: EntityRef[], updatedAt?: string) => DispatchResult;
  now?: Date;
}

const UNDO_MS = 5000;

export function DraftsPage({ entries, conversations, scopeKey, onResumeDraft, onResumeFailed, onRetry, onDeleteFailed, onSetDraft, now: nowProp }: DraftsPageProps): React.ReactElement {
  const [error, setError] = useState('');
  const [undo, setUndo] = useState<Draft[]>([]);
  // A discarded failed message is hidden now and deleted when the Undo window closes, so Undo needs no workaround.
  const [removed, setRemoved] = useState<Message[]>([]);
  const removedRef = useRef<Message[]>([]);
  removedRef.current = removed;
  const commitRemoved = (): void => { for (const message of removedRef.current) onDeleteFailed(message.id); removedRef.current = []; };
  const commitRef = useRef(commitRemoved);
  commitRef.current = commitRemoved;
  const rootRef = useRef<HTMLElement>(null);
  const pendingFocus = useRef<string | undefined>(undefined);
  const removedIds = useMemo(() => new Set(removed.map((message) => message.id)), [removed]);
  const visibleEntries = useMemo(() => entries.filter((entry) => entry.kind !== 'failed' || !removedIds.has(entry.message.id)), [entries, removedIds]);
  const now = useMemo(() => nowProp ?? new Date(), [entries, nowProp]);
  const places = useMemo(() => new Map(conversations.map((item) => [item.conversation.id, item] as const)), [conversations]);
  const groups = useMemo(() => groupDraftEntries(visibleEntries), [visibleEntries]);

  useLayoutEffect(() => { setError(''); setUndo([]); removedRef.current = []; setRemoved([]); }, [scopeKey]);
  // Leaving the view ends the Undo window.
  useEffect(() => () => commitRef.current(), []);

  useLayoutEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = undefined;
    const row = rootRef.current?.querySelector<HTMLElement>(`[data-inbox-row="${CSS.escape(target)}"]`);
    (row ?? rootRef.current?.querySelector<HTMLElement>('[data-drafts-focus]'))?.focus();
  }, [entries]);

  // The Undo offer lasts five seconds from the latest discard.
  useEffect(() => {
    if (undo.length === 0 && removed.length === 0) return undefined;
    const timer = window.setTimeout(() => {
      const failures = removedRef.current.map((message) => onDeleteFailed(message.id)).filter((result) => !result.ok);
      removedRef.current = [];
      setRemoved([]);
      setUndo([]);
      if (failures.length > 0) setError('A failed message could not be removed.');
    }, UNDO_MS);
    return () => window.clearTimeout(timer);
  }, [undo, removed]);

  const neighbourOf = (entry: DraftEntry): string | undefined => {
    const flat = groups.flatMap((group) => group.entries);
    const index = flat.indexOf(entry);
    return (flat[index + 1] ?? flat[index - 1])?.key;
  };
  const discard = (entry: Extract<DraftEntry, { kind: 'draft' }>): void => {
    const { draft } = entry;
    pendingFocus.current = neighbourOf(entry);
    const result = onSetDraft(draft.conversationId, '', draft.threadRootId, draft.actorPersonId, []);
    setError(result.ok ? '' : result.error.message);
    if (result.ok) setUndo((current) => [...current, draft]);
  };
  const discardFailed = (entry: Extract<DraftEntry, { kind: 'failed' }>): void => {
    pendingFocus.current = neighbourOf(entry);
    setError('');
    setRemoved((current) => [...current, entry.message]);
  };
  const undoAll = (): void => {
    let failure = '';
    if (removed.length > 0) pendingFocus.current = `failed:${removed[0]!.id}`;
    removedRef.current = [];
    setRemoved([]);
    for (const draft of undo) {
      const result = onSetDraft(draft.conversationId, draft.body, draft.threadRootId, draft.actorPersonId, draft.refs ? [...draft.refs] : [], draft.updatedAt);
      if (!result.ok) failure = result.error.message;
    }
    pendingFocus.current = undo[0] ? `draft:${undo[0].conversationId}:${undo[0].threadRootId ?? ''}` : undefined;
    setError(failure);
    setUndo([]);
  };
  const retry = (entry: Extract<DraftEntry, { kind: 'failed' }>): void => {
    pendingFocus.current = neighbourOf(entry);
    const result = onRetry(entry.message.id);
    if (!result.ok) pendingFocus.current = undefined;
    setError(result.ok ? '' : result.error.message);
  };

  const total = visibleEntries.length;
  const summary = total === 0 ? 'Messages you start but don’t send' : `${total} ${total === 1 ? 'item' : 'items'} waiting`;

  return <section ref={rootRef} className="gw-drafts" aria-labelledby="gw-drafts-title">
    <header className="gw-drafts__header">
      <h2 id="gw-drafts-title" tabIndex={-1} data-drafts-focus>Drafts</h2>
      <p className="gw-drafts__summary">{summary}</p>
    </header>
    {error ? <p className="gw-drafts__error" role="alert">{error}</p> : null}
    <div className="gw-drafts__scroll">
      {total === 0
        ? <InboxEmptyState icon={<ShellIcon name="drafts" />} title="No drafts" description="Messages you start but don't send wait here." />
        : <InboxViewList label="Drafts and failed sends">
          {groups.map((group) => <React.Fragment key={group.id}>
            <InboxGroupHeading>{group.id === 'failed' ? <><span className="gw-drafts__failed-glyph" aria-hidden="true"><Icon name="failed" /></span>{group.label}</> : group.label}</InboxGroupHeading>
            {group.entries.map((entry) => entry.kind === 'draft'
              ? <DraftRow key={entry.key} entry={entry} now={now} item={places.get(entry.draft.conversationId)} onOpen={() => onResumeDraft(entry.draft)} onDiscard={() => discard(entry)} />
              : <FailedRow key={entry.key} entry={entry} now={now} item={places.get(entry.message.conversationId)} onOpen={() => onResumeFailed(entry.message, 'open')} onEdit={() => onResumeFailed(entry.message, 'edit')} onRetry={() => retry(entry)} onDiscard={() => discardFailed(entry)} />)}
          </React.Fragment>)}
        </InboxViewList>}
    </div>
    {undo.length + removed.length > 0 ? <div className="gw-drafts__toast" role="status">
      <span>{toastLabel(undo.length, removed.length)}</span>
      <button type="button" onClick={undoAll}>Undo</button>
    </div> : null}
  </section>;
}

function toastLabel(drafts: number, failed: number): string {
  if (failed === 0) return drafts === 1 ? 'Draft discarded' : `${drafts} drafts discarded`;
  if (drafts === 0) return failed === 1 ? 'Failed message discarded' : `${failed} failed messages discarded`;
  return `${drafts + failed} items discarded`;
}

function DestinationTile({ item, inThread }: { item: ConversationListItem | undefined; inThread: boolean }): React.ReactElement {
  const kind = item?.conversation.kind;
  if (inThread) return <span className="gw-drafts__tile" aria-hidden="true"><ShellIcon name="threads" /></span>;
  if (kind === 'channel') return <span className="gw-drafts__tile" aria-hidden="true"><ShellIcon name={item?.conversation.visibility === 'private' ? 'lock' : 'hash'} /></span>;
  if (kind === 'group') return <span className="gw-drafts__tile" aria-hidden="true"><ShellIcon name="users" /></span>;
  return <span className={`gw-drafts__tile is-person${item?.hasDoatMember ? ' is-doat' : ''}`} aria-hidden="true">{avatarInitials(item?.title ?? '?')}</span>;
}

function previewText(body: string): string {
  return body.trim() ? body.replace(/\s+/g, ' ') : 'Linked records';
}

function DraftRow({ entry, item, now, onOpen, onDiscard }: { entry: Extract<DraftEntry, { kind: 'draft' }>; item: ConversationListItem | undefined; now: Date; onOpen: () => void; onDiscard: () => void }): React.ReactElement {
  const { draft } = entry;
  const inThread = Boolean(draft.threadRootId);
  const destination = draftDestination(item, inThread);
  const label = editedLabel(draft.updatedAt, now);
  return <InboxRow rowKey={entry.key} density="compact" rowClassName="is-draft" onOpen={onOpen}
    ariaLabel={`Draft to ${destination}, ${label}: ${previewText(draft.body)}`}
    avatar={<DestinationTile item={item} inThread={inThread} />}
    title={destination}
    preview={previewText(draft.body)}
    time={{ iso: draft.updatedAt, label }}
    actions={<button type="button" className="gw-inbox-row__action" aria-label={`Discard draft to ${destination}`} title="Discard" onClick={onDiscard}><TrashGlyph /></button>} />;
}

function FailedRow({ entry, item, now, onOpen, onEdit, onRetry, onDiscard }: { entry: Extract<DraftEntry, { kind: 'failed' }>; item: ConversationListItem | undefined; now: Date; onOpen: () => void; onEdit: () => void; onRetry: () => void; onDiscard: () => void }): React.ReactElement {
  const { message } = entry;
  const inThread = Boolean(message.threadRootId);
  const destination = draftDestination(item, inThread);
  const reason = failureLabel(message.failureReason);
  const label = editedLabel(message.createdAt, now, 'Failed');
  return <InboxRow rowKey={entry.key} density="compact" rowClassName="is-draft is-failed" onOpen={onOpen}
    ariaLabel={`Failed to send to ${destination}, ${label}. ${reason}. ${previewText(message.body)}`}
    avatar={<DestinationTile item={item} inThread={inThread} />}
    title={destination}
    preview={previewText(message.body)}
    meta={<span className="gw-drafts__reason">{reason}</span>}
    time={{ iso: message.createdAt, label }}
    actions={<>
      <button type="button" className="gw-drafts__text-action" onClick={onRetry} aria-label={`Retry sending to ${destination}`}>Retry</button>
      <button type="button" className="gw-drafts__text-action" onClick={onEdit} aria-label={`Edit message to ${destination}`}>Edit</button>
      <button type="button" className="gw-inbox-row__action" aria-label={`Discard failed message to ${destination}`} title="Discard" onClick={onDiscard}><TrashGlyph /></button>
    </>} />;
}

function TrashGlyph(): React.ReactElement { return <Icon name="trash" />; }
