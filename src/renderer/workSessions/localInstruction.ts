import type { LocalMessagingRepository } from '../gwira/messaging/data/localRepository.js';
import type { GwiraLocalState } from '../gwira/domain/types.js';
import type { WorkSessionView } from './model.js';
/** Saves an authorized, task-linked LOCAL message. It makes no delivery claim. */
export function saveEmployeeInstruction(repository: LocalMessagingRepository, state: GwiraLocalState, row: WorkSessionView, text: string, clientId: string): { message: string } {
  const task = state.tasks.find(item => item.workspaceId === state.workspace.id && item.id === row.task?.id);
  if (row.task?.workspaceId !== state.workspace.id || !task || task.assignee?.kind !== 'person' || task.assignee.id !== row.ownerId || !state.people.some(person => person.workspaceId === state.workspace.id && person.id === task.assignee?.id)) throw Error('The employee assignment changed. Review the current task before sending. Your draft is retained.');
  const snapshot = repository.getSnapshot();
  if (snapshot.state.workspaceId !== state.workspace.id || snapshot.state.organizationId !== state.organization.id || !snapshot.state.selfPersonId) throw Error('Choose a current workspace person in Inbox before saving this message.');
  const conversation = repository.dispatch({ type: 'createDm', participant: { kind: 'human', id: task.assignee.id } });
  if (!conversation.ok) throw Error(conversation.error.message);
  const sent = repository.dispatch({ type: 'sendMessage', conversationId: conversation.value.conversationId!, clientId, body: text, refs: [{ kind: 'task', taskId: task.id }] });
  if (!sent.ok) throw Error(sent.error.message);
  const saved = repository.getSnapshot().state.messages.find(message => message.id === sent.value.messageId);
  if (saved?.sendState === 'failed') {
    const retry = repository.dispatch({ type: 'retryMessage', messageId: saved.id });
    if (!retry.ok || !retry.durable) throw Error('Could not save the local message. Your draft is retained. Retry when local storage is available.');
  } else if (!sent.durable) throw Error('Could not save the local message. Your draft is retained. Retry when local storage is available.');
  return { message: 'Message saved locally in Inbox and linked to this task. Delivery is not confirmed.' };
}
