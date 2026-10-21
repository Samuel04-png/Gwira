import { describe, expect, it } from 'vitest';
import { viewAfterOpeningThread } from '../src/renderer/navigationState.js';

describe('navigation state', () => {
  it('returns to Home when opening a project history from the skills page', () => {
    expect(viewAfterOpeningThread('skills')).toBe('home');
  });

  it('keeps the Home working environment visible when opening a thread', () => {
    expect(viewAfterOpeningThread('home')).toBe('home');
  });
});
