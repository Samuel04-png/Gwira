import { describe, expect, it } from 'vitest';
import type { Agent, Person } from '../../src/renderer/gwira/domain/types.js';
import { canSubmitCodingAgent, canSubmitPerson, codingAgentCapabilities, peopleByName } from '../../src/renderer/gwira/workspace/workspaceViewModel.js';

describe('workspace view model', () => {
  it('orders a directory without mutating local records', () => {
    const people: Person[] = [
      { id: 'b', workspaceId: 'w', name: 'Zuri', role: 'Founder', createdAt: '2026-01-02T00:00:00.000Z' },
      { id: 'a', workspaceId: 'w', name: 'Ama', role: 'Founder', createdAt: '2026-01-01T00:00:00.000Z' }
    ];
    expect(peopleByName(people).map((person) => person.name)).toEqual(['Ama', 'Zuri']);
    expect(people.map((person) => person.name)).toEqual(['Zuri', 'Ama']);
  });

  it('only describes the installed coding capability and validates required local input', () => {
    const agent: Agent = { id: 'a', workspaceId: 'w', name: 'Engineer', type: 'coding', createdAt: '2026-01-01T00:00:00.000Z' };
    expect(codingAgentCapabilities(agent)).toEqual(['Runs the installed Codex CLI in a linked local project']);
    expect(canSubmitPerson('  ', 'Founder')).toBe(false);
    expect(canSubmitPerson('Ama', ' Founder ')).toBe(true);
    expect(canSubmitCodingAgent('')).toBe(false);
    expect(canSubmitCodingAgent('Engineer')).toBe(true);
  });
});
