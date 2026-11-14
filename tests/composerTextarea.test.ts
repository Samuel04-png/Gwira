import { describe, expect, it } from 'vitest';
import { composerTextareaHeight } from '../src/renderer/composerTextarea.js';

describe('composerTextareaHeight', () => {
  it('grows to fit content until the input height budget', () => {
    expect(composerTextareaHeight({ scrollHeight: 160, containerHeight: 700, minHeight: 38 })).toEqual({ height: 160, overflowY: 'hidden' });
  });

  it('caps content at the input height budget and enables vertical scrolling', () => {
    expect(composerTextareaHeight({ scrollHeight: 520, containerHeight: 700, minHeight: 38 })).toEqual({ height: 200, overflowY: 'auto' });
  });

  it('keeps the compact minimum height for short content', () => {
    expect(composerTextareaHeight({ scrollHeight: 20, containerHeight: 700, minHeight: 38 })).toEqual({ height: 38, overflowY: 'hidden' });
  });
});
