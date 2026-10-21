import type { OrganizationWorkerKind, WorkflowAuditEvent, WorkflowAuditEventKind } from './workflowTypes.js';

/** Creates a caller-identified audit record without generating time or IDs. */
export function workflowAuditEvent(input: {
  id: string;
  workflowId: string;
  kind: WorkflowAuditEventKind;
  occurredAt: string;
  summary: string;
  actor?: { kind: OrganizationWorkerKind; id: string };
  taskId?: string;
  checkpointId?: string;
}): WorkflowAuditEvent {
  return { ...input };
}
