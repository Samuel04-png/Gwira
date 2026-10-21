import React, { useMemo, useState } from 'react';
import { createProceduralAvatarSpec } from './avatarModel.js';
import { DoatAvatar } from './DoatAvatar.js';
import type { DoatDraft, DoatRoleCategory, DoatShape, DoatSupervisorOption } from './types.js';

const categories: readonly { value: DoatRoleCategory; label: string; role: string }[] = [
  { value: 'software_development', label: 'Software development', role: 'Software engineer' },
  { value: 'research', label: 'Research', role: 'Research analyst' },
  { value: 'customer_support', label: 'Customer support', role: 'Customer support specialist' },
  { value: 'marketing', label: 'Marketing', role: 'Marketing specialist' },
  { value: 'finance_reporting', label: 'Finance and reporting', role: 'Finance analyst' },
  { value: 'operations', label: 'Operations', role: 'Operations coordinator' },
  { value: 'scheduling', label: 'Scheduling', role: 'Scheduling coordinator' },
  { value: 'documentation', label: 'Documentation', role: 'Documentation specialist' },
  { value: 'custom', label: 'Custom role', role: '' }
];

export interface DoatCreationWizardProps {
  supervisors: readonly DoatSupervisorOption[];
  /** True only when an execution adapter is genuinely available. */
  providerAvailable: boolean;
  providerLabel?: string;
  onCancel: () => void;
  onCreate: (draft: DoatDraft) => void;
}

/** A presentational wizard. It yields a draft; creation and avatar persistence belong to its parent. */
export function DoatCreationWizard({ supervisors, providerAvailable, providerLabel, onCancel, onCreate }: DoatCreationWizardProps): React.ReactElement {
  const [step, setStep] = useState(1);
  const [category, setCategory] = useState<DoatRoleCategory>('software_development');
  const [name, setName] = useState(''); const [role, setRole] = useState('Software engineer'); const [objective, setObjective] = useState('');
  const [instructions, setInstructions] = useState(''); const [restrictions, setRestrictions] = useState(''); const [escalationRules, setEscalationRules] = useState('');
  const [personality, setPersonality] = useState('Calm and precise'); const [communicationStyle, setCommunicationStyle] = useState('Clear and concise'); const [shape, setShape] = useState<DoatShape>('prism'); const [primaryColor, setPrimaryColor] = useState('#61c7d7'); const [secondaryColor, setSecondaryColor] = useState('#b0eff4');
  const [supervisorId, setSupervisorId] = useState(''); const [approvalRequired, setApprovalRequired] = useState(true);
  const avatar = useMemo(() => createProceduralAvatarSpec(name || role || 'new-doat', { shape, primaryColor, secondaryColor, accessory: category === 'software_development' ? 'visor' : undefined }), [category, name, primaryColor, role, secondaryColor, shape]);
  const selectCategory = (value: DoatRoleCategory) => { setCategory(value); const match = categories.find((item) => item.value === value); if (match && value !== 'custom') setRole(match.role); };
  const canContinue = step === 1 ? Boolean(objective.trim()) : step === 2 ? Boolean(role.trim()) : step === 3 ? true : step === 4 ? Boolean(name.trim()) : true;
  const finish = () => onCreate({ name: name.trim(), role: role.trim(), roleCategory: category, objective: objective.trim(), instructions: instructions.trim() || undefined, restrictions: restrictions.trim() || undefined, escalationRules: escalationRules.trim() || undefined, personality, communicationStyle, avatar, supervisorId: supervisorId || undefined, approvalRequired });
  return <section className="gwira-doat-wizard" aria-label="Create Doat">
    <header><div><p>New Doat · Step {step} of 6</p><h1>{['What do you need help with?', 'Define responsibilities', 'Choose intelligence and tools', 'Create its appearance', 'Configure supervision', 'Meet your Doat'][step - 1]}</h1></div><button type="button" onClick={onCancel}>Cancel</button></header>
    <div className="gwira-doat-wizard__progress" aria-hidden="true"><span style={{ width: `${(step / 6) * 100}%` }} /></div>
    {step === 1 && <div className="gwira-doat-wizard__body"><label>What should your Doat help your business accomplish?<textarea value={objective} onChange={(event) => setObjective(event.target.value)} placeholder="Describe the outcome you need." autoFocus /></label><fieldset><legend>Role category</legend>{categories.map((item) => <label key={item.value}><input type="radio" checked={category === item.value} onChange={() => selectCategory(item.value)} />{item.label}</label>)}</fieldset></div>}
    {step === 2 && <div className="gwira-doat-wizard__body"><label>Doat name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Ada" /></label><label>Role title<input required value={role} onChange={(event) => setRole(event.target.value)} /></label><label>Instructions<textarea value={instructions} onChange={(event) => setInstructions(event.target.value)} placeholder="How should this Doat approach its work?" /></label><label>Restrictions<textarea value={restrictions} onChange={(event) => setRestrictions(event.target.value)} placeholder="Actions it must not take." /></label><label>Escalation rules<textarea value={escalationRules} onChange={(event) => setEscalationRules(event.target.value)} placeholder="When should it ask a human?" /></label></div>}
    {step === 3 && <div className="gwira-doat-wizard__body"><h2>Provider and tools</h2>{providerAvailable ? <p>{providerLabel ?? 'A supported local execution provider is available.'} Provider and tool permissions are applied by the execution adapter when this Doat is assigned supported work.</p> : <p className="gwira-doat-wizard__notice">{providerLabel ?? 'No execution provider is configured.'} You may save this Doat’s identity, but it cannot execute tasks until a compatible provider is configured.</p>}<p>Specialist roles do not create new providers, integrations, skills, or permissions automatically.</p><label>Communication style<select value={communicationStyle} onChange={(event) => setCommunicationStyle(event.target.value)}><option>Clear and concise</option><option>Warm and collaborative</option><option>Direct and structured</option></select></label><label>Personality<select value={personality} onChange={(event) => setPersonality(event.target.value)}><option>Calm and precise</option><option>Curious and methodical</option><option>Focused and practical</option></select></label></div>}
    {step === 4 && <div className="gwira-doat-wizard__body gwira-doat-wizard__appearance"><DoatAvatar spec={avatar} status="idle" size={180} label={name || role || 'New Doat'} /><div><p>This is a deterministic procedural SVG preview, not an AI-generated image. It is based on the saved visual specification and does not regenerate on render.</p><label>Shape<select value={shape} onChange={(event) => setShape(event.target.value as DoatShape)}>{(['orb', 'prism', 'leaf', 'satellite', 'arch'] as const).map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label>Primary color<input type="color" value={primaryColor} onChange={(event) => setPrimaryColor(event.target.value)} /></label><label>Secondary color<input type="color" value={secondaryColor} onChange={(event) => setSecondaryColor(event.target.value)} /></label></div></div>}
    {step === 5 && <div className="gwira-doat-wizard__body"><label>Human supervisor<select value={supervisorId} onChange={(event) => setSupervisorId(event.target.value)}><option value="">No supervisor assigned</option>{supervisors.map((supervisor) => <option value={supervisor.id} key={supervisor.id}>{supervisor.name}</option>)}</select></label><label><input type="checkbox" checked={approvalRequired} onChange={(event) => setApprovalRequired(event.target.checked)} /> Require human approval before sensitive actions</label><p>Budgets, integrations, and concurrency limits are not configurable in this local UI until a provider exposes enforceable controls.</p></div>}
    {step === 6 && <div className="gwira-doat-wizard__body gwira-doat-wizard__meet"><DoatAvatar spec={avatar} status={providerAvailable ? 'idle' : 'unavailable'} size={180} label={name || role || 'New Doat'} /><div><h2>{name || 'Your new Doat'}</h2><p>{role || 'Role not named'}</p><p>{objective}</p><p>{providerAvailable ? 'Ready to be assigned supported work.' : 'Saved as unavailable until a compatible execution provider is configured.'}</p></div></div>}
    <footer><button type="button" onClick={() => step === 1 ? onCancel() : setStep((value) => value - 1)}>{step === 1 ? 'Cancel' : 'Back'}</button>{step === 6 ? <button type="button" onClick={finish} disabled={!name.trim() || !role.trim() || !objective.trim()}>Create Doat</button> : <button type="button" onClick={() => setStep((value) => value + 1)} disabled={!canContinue}>Continue</button>}</footer>
  </section>;
}
