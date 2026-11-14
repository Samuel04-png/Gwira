import {describe, expect, it} from 'vitest';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {MAX_PREFERENCE_BYTES,MAX_PREFERENCE_IPC_CHARS,ScopedPreferences} from '../src/main/auth/scopedPreferences.js';

describe('scoped UI preferences', () => {
  it('isolates user, backend and organization without reading or modifying legacy data', () => {
    const root=mkdtempSync(path.join(tmpdir(),'gwira-pref-test-'));
    try {
      const legacy=path.join(root,'legacy.json');
      writeFileSync(legacy,'legacy-private');
      const a={backend:'https://one.example',userId:'a',organizationId:'one'};
      const store=new ScopedPreferences(root);
      store.write(a,'tabs','{"tab":"a"}');
      store.write(a,'initial-generation','{"userId":"a","organizationId":"one"}');
      store.write(a,'global-chat','{"draft":"private"}');
      for (const scope of [
        {...a,userId:'b'},
        {...a,organizationId:'two'},
        {...a,backend:'https://two.example'}
      ]) {
        expect(store.read(scope,'tabs')).toBeNull();
        expect(store.read(scope,'initial-generation')).toBeNull();
        expect(store.read(scope,'global-chat')).toBeNull();
      }
      expect(new ScopedPreferences(root).read(a,'tabs')).toBe('{"tab":"a"}');
      expect(new ScopedPreferences(root).read(a,'initial-generation')).toBe('{"userId":"a","organizationId":"one"}');
      expect(new ScopedPreferences(root).read(a,'global-chat')).toBe('{"draft":"private"}');
      expect(readFileSync(legacy,'utf8')).toBe('legacy-private');
      expect(() => store.read(a,'../legacy')).toThrow();
      expect(() => store.write(a,'tabs','not json')).toThrow();
      expect(() => store.write(a,'tabs',JSON.stringify('x'.repeat(65537)))).toThrow();
    } finally { rmSync(root,{recursive:true,force:true}); }
  });
  it('accepts the full byte limit and rejects larger values without overwriting', () => {
    const root=mkdtempSync(path.join(tmpdir(),'gwira-pref-limit-'));
    try {
      const store=new ScopedPreferences(root),scope={backend:'https://one.example',userId:'a',organizationId:'one'};
      const value=JSON.stringify('x'.repeat(MAX_PREFERENCE_BYTES-2));
      expect(Buffer.byteLength(value,'utf8')).toBe(MAX_PREFERENCE_BYTES);
      store.write(scope,'tabs',value);
      expect(store.read(scope,'tabs')).toBe(value);
      expect(() => store.write(scope,'tabs',JSON.stringify('x'.repeat(MAX_PREFERENCE_BYTES-1)))).toThrow('Invalid preference value.');
      expect(store.read(scope,'tabs')).toBe(value);
      expect(JSON.stringify({key:'tabs',value,expected:{userId:'a',organizationId:'one'}}).length).toBeLessThan(MAX_PREFERENCE_IPC_CHARS);
    } finally { rmSync(root,{recursive:true,force:true}); }
  });
});
