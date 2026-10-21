import type { Agent, Person } from '../domain/types.js';

/** Presentation-only ordering. It never changes the persisted records. */
export function peopleByName(people: readonly Person[]): Person[] {
  return people.slice().sort((left, right) => left.name.localeCompare(right.name) || left.createdAt.localeCompare(right.createdAt));
}

/** Coding is the only agent capability currently backed by the local app. */
export function codingAgentCapabilities(agent: Agent): readonly string[] {
  return agent.type === 'coding' ? ['Runs the installed Codex CLI in a linked local project'] : [];
}

export function canSubmitPerson(name: string, role: string): boolean {
  return Boolean(name.trim() && role.trim());
}

export function canSubmitCodingAgent(name: string): boolean {
  return Boolean(name.trim());
}
