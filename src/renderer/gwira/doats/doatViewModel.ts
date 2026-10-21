import type { GwiraLocalState, Task } from '../domain/types.js';
import type { Doat } from './domain/types.js';
import { DOAT_PALETTES } from './visual/avatar.js';
import { mapTaskToDoatOperationalStatus } from './execution/executionPlanner.js';
import type { DoatUiRecord } from './ui/types.js';

const uiShape = { orb: 'orb', prism: 'prism', capsule: 'leaf', halo: 'satellite', facet: 'arch' } as const;

/** Maps persisted, non-secret domain facts into the renderer-only profile contract. */
export function doatToUiRecord(doat: Doat, state: GwiraLocalState): DoatUiRecord {
  const tasks = state.tasks.filter((task) => task.assignee?.kind === 'agent' && task.assignee.id === doat.id);
  const active = tasks.find((task) => task.agentRun?.status === 'running')
    ?? tasks.find((task) => task.status === 'in_review')
    ?? tasks.find((task) => task.status === 'blocked')
    ?? tasks.find((task) => task.status === 'todo');
  const palette = DOAT_PALETTES.find((item) => item.id === doat.appearance.active.spec.paletteId) ?? DOAT_PALETTES[0];
  const paused = doat.operations.status === 'paused';
  const status = doat.archivedAt ? 'unavailable' : mapTaskToDoatOperationalStatus({ paused, providerId: doat.intelligence.providerId }, active);
  const providerAvailable = doat.intelligence.providerId === 'codex-local' && doat.intelligence.providerAvailability === 'configured' && !doat.archivedAt;
  const completed = tasks.filter((task) => task.status === 'done').length;
  const failed = tasks.filter((task) => task.agentRun?.status === 'error').length;
  const supervisor = doat.governance.supervisorPersonId ? state.people.find((person) => person.id === doat.governance.supervisorPersonId) : undefined;
  return {
    id: doat.id, name: doat.identity.name, role: doat.identity.role, department: doat.identity.department,
    description: doat.identity.description, status: status === 'waiting_for_approval' ? 'waiting_approval' : status,
    avatar: { seed: doat.appearance.active.spec.seed, shape: uiShape[doat.appearance.active.spec.shape], primaryColor: palette.primary, secondaryColor: palette.accent, accessory: doat.appearance.active.spec.accessory === 'badge' ? 'none' : doat.appearance.active.spec.accessory, version: doat.appearance.active.revision },
    communicationStyle: doat.identity.communicationStyle, personality: doat.identity.personality,
    capabilities: doat.capabilities.map((item) => item.name), tools: doat.capabilities.filter((item) => item.kind === 'tool').map((item) => item.name),
    supervisorName: supervisor?.name, activeTask: active ? toUiTask(active) : undefined, tasks: tasks.map(toUiTask),
    completedTaskCount: completed, failedTaskCount: failed, providerAvailable,
    providerLabel: providerAvailable ? 'Local Codex CLI' : (doat.intelligence.unavailableReason ?? 'No compatible local execution provider is configured.'), archived: Boolean(doat.archivedAt)
  };
}

function toUiTask(task: Task) { return { id: task.id, title: task.title, status: task.status, updatedAt: task.updatedAt }; }
