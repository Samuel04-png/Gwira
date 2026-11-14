import React, { useMemo, useState } from 'react';
import type { GwiraLocalState } from '../domain/types.js';
import { DeterministicPlanProposalGenerator, generatePlanProposal, validatePlanProposal, type PlanProposal, type ProposalOwner, type WorkflowSnapshot } from './planProposals.js';

function issueMessage(issue: ReturnType<typeof validatePlanProposal>['issues'][number]): string {
  if ('message' in issue) return issue.message;
  if (issue.code === 'unknown-step') return `The step “${issue.stepId}” no longer exists.`;
  if (issue.code === 'unknown-owner') return `The proposed owner “${issue.ownerId}” is unavailable.`;
  return `The client key “${issue.clientKey}” is used more than once.`;
}

/** Development-only proof surface. It cannot apply a plan without Core. */
export function PlanProposalPreview({ state }: { state: GwiraLocalState }): React.ReactElement {
  const [request, setRequest] = useState('');
  const [proposal, setProposal] = useState<PlanProposal>();
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string>();
  const snapshot = useMemo<WorkflowSnapshot>(() => ({
    organizationId: state.organization.id, workflowId: state.workspace.id, version: 1,
    steps: state.tasks.map((task) => ({ id: task.id, title: task.title, description: task.description, owner: task.assignee, dependsOn: task.dependsOnTaskIds ?? [] })),
    approvalPolicies: []
  }), [state]);
  const owners = useMemo(() => new Map<string, ProposalOwner['kind']>([
    ...state.people.filter((person) => person.workspaceId === state.workspace.id).map((person) => [person.id, 'person'] as const),
    ...state.agents.filter((agent) => agent.workspaceId === state.workspace.id).map((agent) => [agent.id, 'agent'] as const)
  ]), [state.people, state.agents, state.workspace.id]);
  const validation = useMemo(() => proposal ? validatePlanProposal(snapshot, proposal, owners, new Date().toISOString()) : undefined, [proposal, snapshot, owners]);
  const createPreview = async (): Promise<void> => {
    const prompt = request.trim(); if (!prompt || generating) return;
    setGenerating(true); setError(undefined); setProposal(undefined);
    const now = new Date();
    try {
      const generated = await generatePlanProposal({
        prompt, organizationId: snapshot.organizationId, workflowId: snapshot.workflowId,
        baseVersion: snapshot.version, requestedBy: 'local-preview',
        createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + 60 * 60 * 1_000).toISOString()
      }, new DeterministicPlanProposalGenerator());
      setProposal(generated);
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : 'Proposal generation failed.');
    } finally {
      setGenerating(false);
    }
  };
  return <section className="gwira-proposal-preview" aria-label="Safe plan proposal preview">
    <header><div><span>Development preview</span><h2>Safe plan proposal</h2><p>This preview never runs a tool or changes the workflow.</p></div></header>
    <label>Describe a proposed step<textarea value={request} onChange={(event) => setRequest(event.target.value)} placeholder="For example: Prepare a weekend promotion brief" rows={2} maxLength={200} /></label>
    <div className="gwira-proposal-preview__actions"><button type="button" onClick={() => void createPreview()} disabled={!request.trim() || generating}>{generating ? 'Generating…' : 'Create preview'}</button><button type="button" disabled title="Requires Gwira Core authorization and atomic workflow-version persistence.">Apply changes</button></div>
    {error ? <p role="alert">{error}</p> : null}
    {proposal && validation ? <div className={validation.ok ? 'is-valid' : 'is-invalid'} role="status"><strong>{validation.ok ? 'Ready to review' : 'Needs changes'}</strong>{validation.ok ? <ul>{validation.preview?.steps.filter((step) => step.id.startsWith('__proposal__:')).map((step) => <li key={step.id}>Add step: {step.title}</li>)}</ul> : <ul>{validation.issues.map((issue, index) => <li key={`${issue.code}-${index}`}>{issueMessage(issue)}</li>)}</ul>}<small>Apply is unavailable until Gwira Core provides membership authorization, version locking, and durable audit storage.</small></div> : null}
  </section>;
}
