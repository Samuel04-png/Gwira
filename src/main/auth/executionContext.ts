import type {AccountSnapshot} from '../../shared/accountAuth.js';

/**
 * Process-wide lifetime boundary. A snapshot is not itself authorization for
 * cloud data; cloud operations still require the authenticated backend.
 */
export class ExecutionContext {
  private generation = 0;
  private state?: AccountSnapshot;
  private readonly listeners = new Set<() => void>();
  private localOperations = 0;
  private readonly idleWaiters = new Set<() => void>();

  update(next: AccountSnapshot): void {
    const previous = this.state;
    const changed = !previous || previous.phase !== next.phase
      || previous.user?.id !== next.user?.id
      || previous.activeOrganization?.id !== next.activeOrganization?.id
      || previous.activeOrganization?.role !== next.activeOrganization?.role;
    this.state = next;
    if (changed) {
      this.generation++;
      for (const listener of this.listeners) listener();
    }
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  revoke(): void {
    this.state = undefined;
    this.generation++;
    for (const listener of this.listeners) listener();
  }

  ticket(): number {
    return this.generation;
  }

  assertCurrent(ticket: number): void {
    if (ticket !== this.generation) throw new Error('The account context changed. Try again.');
  }

  localTicket(): number {
    if (this.state?.phase !== 'offline_local' || !this.state.localModeAllowed || this.state.user) {
      throw new Error('Local machine tools are unavailable in this account context.');
    }
    return this.generation;
  }

  assertLocal(ticket: number): void {
    if (ticket !== this.localTicket()) throw new Error('The account context changed. Try again.');
  }

  beginLocalOperation(): {ticket: number; release: () => void} {
    const ticket = this.localTicket();
    this.localOperations++;
    let released = false;
    return {ticket, release: () => {
      if (released) return;
      released = true;
      if (--this.localOperations === 0) {
        for (const resolve of this.idleWaiters) resolve();
        this.idleWaiters.clear();
      }
    }};
  }

  waitForLocalOperations(): Promise<void> {
    if (this.localOperations === 0) return Promise.resolve();
    return new Promise(resolve => this.idleWaiters.add(resolve));
  }
}
