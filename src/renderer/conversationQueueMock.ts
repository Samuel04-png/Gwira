import { claimQueuedRequest, enqueueRequest, type QueuedRequest } from './conversationModel.js';

/** Explicit test/development adapter. Never imported by the production conversation. */
export class MockConversationQueue {
  private records: QueuedRequest[] = [];
  constructor(development: boolean) { if (!development) throw new Error('The mock queue is available only in development.'); }
  snapshot(): QueuedRequest[] { return this.records.map((entry) => ({ ...entry })); }
  enqueue(request: QueuedRequest): void { this.records = enqueueRequest(this.records, request); }
  edit(id: string, text: string): void { if (text.trim()) this.records = this.records.map((entry) => entry.id === id && entry.status === 'pending' ? { ...entry, text } : entry); }
  remove(id: string): void { this.records = this.records.filter((entry) => entry.id !== id || entry.status !== 'pending'); }
  moveEarlier(id: string): void {
    const index = this.records.findIndex((entry) => entry.id === id && entry.status === 'pending');
    const entry = this.records[index];
    if (!entry) return;
    for (let before = index - 1; before >= 0; before--) {
      const other = this.records[before];
      if (other.status === 'pending' && other.workspaceId === entry.workspaceId && other.conversationId === entry.conversationId) {
        [this.records[index], this.records[before]] = [other, entry]; break;
      }
    }
  }
  claim(workspaceId: string, conversationId: string): QueuedRequest | undefined {
    const result = claimQueuedRequest(this.records, workspaceId, conversationId); this.records = result.queue; return result.request;
  }
  complete(id: string): void { this.records = this.records.map((entry) => entry.id === id && entry.status === 'started' ? { ...entry, status: 'completed' } : entry); }
}
