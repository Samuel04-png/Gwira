/**
 * Local, serializable onboarding data. This module deliberately has no account,
 * invitation, provider, or network concepts: its caller owns persistence.
 */
export type BusinessType = 'service' | 'retail' | 'product' | 'nonprofit' | 'other';
export type TeamSize = 'solo' | 'small' | 'growing' | 'established';
export type OnboardingStep = 'business' | 'organization' | 'starting-point' | 'team-guidance' | 'complete';
export type OrganizationModelChoice = 'flat' | 'functional' | 'divisional';

export interface LocalOnboardingProfile {
  businessName: string;
  businessType?: BusinessType;
  industry?: string;
  teamSize?: TeamSize;
  primaryObjective?: string;
  organizationModel?: OrganizationModelChoice;
  selectedTemplateId?: string;
}

export interface LocalOnboardingState {
  version: 1;
  currentStep: OnboardingStep;
  profile: LocalOnboardingProfile;
  completedAt?: string;
}

export interface OnboardingTemplateSuggestion {
  id: string;
  title: string;
  description: string;
  organizationModel: OrganizationModelChoice;
  suggestedDepartments: readonly string[];
  suitableFor: readonly BusinessType[];
}

export const LOCAL_ONBOARDING_TEMPLATES: readonly OnboardingTemplateSuggestion[] = [
  { id: 'simple-operations', title: 'Simple operations', description: 'A lightweight starting point for a small team.', organizationModel: 'flat', suggestedDepartments: ['Operations'], suitableFor: ['service', 'retail', 'other'] },
  { id: 'functional-team', title: 'Functional team', description: 'Separate work by the function responsible for it.', organizationModel: 'functional', suggestedDepartments: ['Operations', 'Sales', 'Delivery'], suitableFor: ['service', 'product', 'retail', 'nonprofit'] },
  { id: 'product-delivery', title: 'Product and delivery', description: 'A starting point for teams that build and support a product.', organizationModel: 'divisional', suggestedDepartments: ['Product', 'Delivery', 'Customer support'], suitableFor: ['product', 'service'] }
];

export const ONBOARDING_STEPS: readonly OnboardingStep[] = ['business', 'organization', 'starting-point', 'team-guidance', 'complete'];

export function createLocalOnboardingState(profile: Partial<LocalOnboardingProfile> = {}): LocalOnboardingState {
  return { version: 1, currentStep: 'business', profile: { businessName: '', ...profile } };
}

export function isStepComplete(state: LocalOnboardingState, step = state.currentStep): boolean {
  const { profile } = state;
  if (step === 'business') return Boolean(profile.businessName.trim() && profile.businessType && profile.industry?.trim() && profile.teamSize && profile.primaryObjective?.trim());
  if (step === 'organization') return Boolean(profile.organizationModel);
  if (step === 'starting-point') return Boolean(profile.selectedTemplateId);
  return true;
}

export function nextOnboardingState(state: LocalOnboardingState, now: string): LocalOnboardingState {
  const index = ONBOARDING_STEPS.indexOf(state.currentStep);
  if (index < 0 || !isStepComplete(state)) return state;
  const next = ONBOARDING_STEPS[index + 1] ?? 'complete';
  return { ...state, currentStep: next, completedAt: next === 'complete' ? now : state.completedAt };
}

export function previousOnboardingState(state: LocalOnboardingState): LocalOnboardingState {
  const index = ONBOARDING_STEPS.indexOf(state.currentStep);
  return { ...state, currentStep: ONBOARDING_STEPS[Math.max(0, index - 1)] ?? 'business', completedAt: undefined };
}

export function suggestedTemplates(profile: LocalOnboardingProfile): readonly OnboardingTemplateSuggestion[] {
  if (!profile.businessType) return LOCAL_ONBOARDING_TEMPLATES;
  const matched = LOCAL_ONBOARDING_TEMPLATES.filter((template) => template.suitableFor.includes(profile.businessType!));
  return matched.length ? matched : LOCAL_ONBOARDING_TEMPLATES;
}

export function localMemberGuidance(teamSize?: TeamSize): string {
  if (teamSize === 'solo') return 'You can record yourself as the first local team member when you are ready.';
  return 'Add people locally after onboarding. This application does not send invitations or create accounts.';
}

export const LOCAL_DOAT_GUIDANCE = 'You can create a Doat locally after onboarding. It has no execution access until a supported local provider is available and it is assigned compatible work.';
