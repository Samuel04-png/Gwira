import {createHash, randomUUID} from 'node:crypto';
import {mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync} from 'node:fs';
import path from 'node:path';

import type {PreferenceKey} from '../../shared/scopedPreferences.js';
export interface PreferenceScope {backend:string;userId:string;organizationId:string}
export const MAX_PREFERENCE_BYTES = 65536;
// JSON serialization can expand a single control character to six characters.
export const MAX_PREFERENCE_IPC_CHARS = MAX_PREFERENCE_BYTES * 6 + 16384;

function isPreferenceKey(value: unknown): value is PreferenceKey {
  return value === 'tabs' || value === 'layout' || value === 'sidebar' || value === 'business-sidebar' || value === 'business-channels' || value === 'pending-channel-create' || value === 'pending-directory-person' || value === 'channel-drafts' || value === 'conversation-state' || value === 'initial-generation' || value === 'global-chat';
}

/** Scoped device state, including unsent conversation drafts. Saved business records use the backend. */
export class ScopedPreferences {
  constructor(private readonly root: string) {}

  private filename(scope: PreferenceScope, key: unknown): string {
    if (!isPreferenceKey(key) || !scope.backend || !scope.userId || !scope.organizationId) throw new Error('Invalid preference request.');
    const digest = createHash('sha256').update(JSON.stringify([scope.backend, scope.userId, scope.organizationId])).digest('hex');
    return path.join(this.root, digest, `${key}.json`);
  }

  read(scope: PreferenceScope, key: unknown): string | null {
    const file = this.filename(scope, key);
    try { return readFileSync(file, 'utf8'); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  write(scope: PreferenceScope, key: unknown, value: unknown): void {
    const file = this.filename(scope, key);
    if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > MAX_PREFERENCE_BYTES) throw new Error('Invalid preference value.');
    try { JSON.parse(value); } catch { throw new Error('Invalid preference value.'); }
    mkdirSync(path.dirname(file), {recursive:true, mode:0o700});
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temporary, value, {mode:0o600, flag:'wx'});
      renameSync(temporary, file);
    } finally {
      try { unlinkSync(temporary); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    }
  }
}
