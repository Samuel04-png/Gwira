import type { CodexDesktopApi, CodexExitEvent, SessionMessage } from '../shared/types.js';

// Original, local microcopy. These are decorative waiting labels, never tool claims.
export const thinkingPhrases = [
  'Finding the useful angle…', 'Giving the idea some room…', 'Lining up the pieces…',
  'Following a promising thread…', 'Putting a little order in…', 'Letting the idea take shape…',
  'Looking around the next corner…', 'Gathering the loose ends…', 'Making room for a good answer…',
  'Turning the idea over…', 'Finding a clearer path…', 'Giving the details a moment…',
  'Bringing the pieces closer…', 'Untying a small knot…', 'Setting the ideas in motion…',
  'Looking for the helpful part…', 'Making the rough edges meet…', 'Keeping the possibilities open…',
  'Warming up the drawing board…', 'Finding the next foothold…', 'Shaping a useful starting point…',
  'Making a little headway…', 'Getting the ideas acquainted…', 'Finding where things click…'
] as const;

export function thinkingFrame(elapsedMs: number, reducedMotion = false, seed = 0): { primary: string; decorative?: string; index: number } {
  const elapsed = Math.max(0, elapsedMs);
  if (reducedMotion || elapsed < 4000) return { primary: 'Thinking…', index: -1 };
  const index = (Math.floor((elapsed - 4000) / 3600) * 7 + Math.abs(seed)) % thinkingPhrases.length;
  return elapsed < 12000 ? { primary: thinkingPhrases[index], index }
    : { primary: 'Waiting for response…', decorative: thinkingPhrases[index], index };
}

export function currentGeneration(messages: readonly SessionMessage[]): { startedAt?: string; hasResponse: boolean; messages: readonly SessionMessage[] } {
  let start = -1;
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === 'user') { start = i; break; }
  const current = messages.slice(start + 1);
  return { startedAt: start >= 0 ? messages[start].createdAt : undefined, hasResponse: current.some((message) => message.role === 'codex' && message.text.trim().length > 0), messages: current };
}

/** stopSession acknowledges the request only. Wait for the matching process-exit event before claiming cancellation. */
export function requestConversationStop(api: Pick<CodexDesktopApi, 'onExit' | 'stopSession'>, sessionId: string, timeoutMs = 15000): Promise<CodexExitEvent> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (event?: CodexExitEvent, error?: Error): void => {
      if (settled) return;
      settled = true; clearTimeout(timer); unsubscribe();
      if (error) reject(error); else resolve(event!);
    };
    const unsubscribe = api.onExit((event) => { if (event.sessionId === sessionId) finish(event); });
    const timer = setTimeout(() => finish(undefined, new Error('Cancellation is not confirmed yet. Your draft is saved. Wait for the run to finish or try Stop again.')), timeoutMs);
    void api.stopSession({ sessionId }).catch(() => finish(undefined, new Error('Could not request cancellation. Your draft is saved. Try Stop again.')));
  });
}

export interface QueuedRequest { id: string; workspaceId: string; conversationId: string; submittedAt: string; text: string; status: 'pending' | 'started' | 'completed'; }
/** State contract for explicit development adapters. Production has no durable queue capability. */
export function enqueueRequest(queue: readonly QueuedRequest[], request: QueuedRequest): QueuedRequest[] {
  return queue.some((entry) => entry.id === request.id) ? [...queue] : [...queue, request];
}
export function claimQueuedRequest(queue: readonly QueuedRequest[], workspaceId: string, conversationId: string): { queue: QueuedRequest[]; request?: QueuedRequest } {
  if (queue.some((entry) => entry.workspaceId === workspaceId && entry.conversationId === conversationId && entry.status === 'started')) return { queue: [...queue] };
  const request = queue.find((entry) => entry.workspaceId === workspaceId && entry.conversationId === conversationId && entry.status === 'pending');
  return { queue: queue.map((entry) => entry.id === request?.id ? { ...entry, status: 'started' } : entry), request };
}
