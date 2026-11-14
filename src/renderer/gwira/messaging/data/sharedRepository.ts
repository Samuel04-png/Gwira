import { LocalMessagingRepository } from './localRepository.js';
import type { StorageLike } from './messagingStore.js';
import type { MessagingScope, MessagingWork } from '../domain/types.js';

// Multiple navigation surfaces share one repository for the same storage and scope.
// Sample storage objects remain isolated from the real workspace repository.
const repositories = new WeakMap<StorageLike, Map<string, { repository: LocalMessagingRepository; work: MessagingWork }>>();
export function sharedRepository(storage: StorageLike, scope: MessagingScope, work: MessagingWork): LocalMessagingRepository {
  let scopes = repositories.get(storage);
  if (!scopes) { scopes = new Map(); repositories.set(storage, scopes); }
  const key = JSON.stringify([scope.organizationId, scope.workspaceId]);
  let entry = scopes.get(key);
  if (!entry) {
    const holder = { work };
    const repository = new LocalMessagingRepository({ storage, scope, getWork: () => holder.work });
    entry = Object.assign(holder, { repository }); scopes.set(key, entry);
  }
  entry.work = work;
  return entry.repository;
}

