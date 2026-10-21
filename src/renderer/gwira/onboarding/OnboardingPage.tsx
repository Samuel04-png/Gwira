import React from 'react';
import { LOCAL_DOAT_GUIDANCE, localMemberGuidance, type BusinessType, type LocalOnboardingState, type OrganizationModelChoice, type TeamSize, type OnboardingTemplateSuggestion, suggestedTemplates } from './onboardingModel.js';
import { OnboardingChecklist } from './OnboardingChecklist.js';

export interface OnboardingPageProps {
  state: LocalOnboardingState;
  onChange: (state: LocalOnboardingState) => void;
  onBack: () => void;
  onContinue: () => void;
  onFinish: () => void;
}

const businessTypes: readonly BusinessType[] = ['service', 'retail', 'product', 'nonprofit', 'other'];
const teamSizes: readonly TeamSize[] = ['solo', 'small', 'growing', 'established'];
const organizationModels: readonly OrganizationModelChoice[] = ['flat', 'functional', 'divisional'];

/** Presentational local onboarding. Parent code persists the supplied state and decides when to navigate. */
export function OnboardingPage({ state, onChange, onBack, onContinue, onFinish }: OnboardingPageProps): React.ReactElement {
  const update = (patch: Partial<typeof state.profile>) => onChange({ ...state, profile: { ...state.profile, ...patch } });
  const templates = suggestedTemplates(state.profile);
  const selectTemplate = (template: OnboardingTemplateSuggestion) => onChange({ ...state, profile: { ...state.profile, selectedTemplateId: template.id, organizationModel: template.organizationModel } });
  const step = state.currentStep;
  return <section className="gwira-onboarding-page" aria-label="Set up your local workspace">
    <header><div><p>Local workspace setup</p><h1>Set up Gwira for your business</h1><p>Your answers are stored on this device by the application that embeds this screen. No business account, cloud workspace, or invitation is created here.</p></div></header>
    <OnboardingChecklist state={state} />
    {step === 'business' && <div className="gwira-onboarding-page__body"><label>Business name<input value={state.profile.businessName} onChange={(event) => update({ businessName: event.target.value })} autoFocus /></label><label>Business type<select value={state.profile.businessType ?? ''} onChange={(event) => update({ businessType: event.target.value as BusinessType || undefined })}><option value="">Choose one</option>{businessTypes.map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label>Industry<input value={state.profile.industry ?? ''} onChange={(event) => update({ industry: event.target.value })} /></label><label>Team size<select value={state.profile.teamSize ?? ''} onChange={(event) => update({ teamSize: event.target.value as TeamSize || undefined })}><option value="">Choose one</option>{teamSizes.map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label>Primary objective<textarea value={state.profile.primaryObjective ?? ''} onChange={(event) => update({ primaryObjective: event.target.value })} placeholder="What would you like to improve first?" /></label></div>}
    {step === 'organization' && <div className="gwira-onboarding-page__body"><h2>Choose a starting organization model</h2><p>This records a local structure only. It does not set reporting authority, permissions, or tool access.</p>{organizationModels.map((model) => <label key={model}><input type="radio" name="organization-model" checked={state.profile.organizationModel === model} onChange={() => update({ organizationModel: model })} />{model}</label>)}</div>}
    {step === 'starting-point' && <div className="gwira-onboarding-page__body"><h2>Choose a local starting template</h2><p>Templates are suggestions, not automatic departments, workflows, or assignments.</p><div className="gwira-onboarding-page__templates">{templates.map((template) => <button key={template.id} type="button" aria-pressed={state.profile.selectedTemplateId === template.id} onClick={() => selectTemplate(template)}><strong>{template.title}</strong><span>{template.description}</span><small>Suggested: {template.suggestedDepartments.join(', ')}</small></button>)}</div></div>}
    {step === 'team-guidance' && <div className="gwira-onboarding-page__body"><h2>Bring your local workspace to life</h2><p>{localMemberGuidance(state.profile.teamSize)}</p><p>{LOCAL_DOAT_GUIDANCE}</p></div>}
    {step === 'complete' && <div className="gwira-onboarding-page__body"><h2>Your local setup is ready</h2><p>You can now review the suggested structure and create work. Nothing has been sent outside this device.</p></div>}
    <footer><button type="button" onClick={onBack} disabled={step === 'business'}>Back</button>{step === 'complete' ? <button type="button" onClick={onFinish}>Open workspace</button> : <button type="button" onClick={onContinue}>Continue</button>}</footer>
  </section>;
}
