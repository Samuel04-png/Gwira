import { describe, expect, it } from 'vitest';
import { LOCAL_DOAT_GUIDANCE, createLocalOnboardingState, isStepComplete, localMemberGuidance, nextOnboardingState, previousOnboardingState, suggestedTemplates } from '../../src/renderer/gwira/onboarding/onboardingModel.js';

describe('local onboarding model', () => {
  it('keeps incomplete onboarding resumable without advancing', () => {
    const initial = createLocalOnboardingState({ businessName: 'Gwira' });
    expect(nextOnboardingState(initial, '2026-01-01T00:00:00.000Z')).toBe(initial);
    expect(isStepComplete(initial)).toBe(false);
  });

  it('moves through validated local steps and records completion only at the end', () => {
    const business = createLocalOnboardingState({ businessName: 'Gwira', businessType: 'service', industry: 'Operations', teamSize: 'small', primaryObjective: 'Deliver work' });
    const organization = nextOnboardingState(business, '2026-01-01T00:00:00.000Z');
    const startingPoint = nextOnboardingState({ ...organization, profile: { ...organization.profile, organizationModel: 'functional' } }, '2026-01-01T00:00:00.000Z');
    const guidance = nextOnboardingState({ ...startingPoint, profile: { ...startingPoint.profile, selectedTemplateId: 'functional-team' } }, '2026-01-01T00:00:00.000Z');
    const complete = nextOnboardingState(guidance, '2026-01-01T00:00:00.000Z');
    expect([organization.currentStep, startingPoint.currentStep, guidance.currentStep, complete.currentStep]).toEqual(['organization', 'starting-point', 'team-guidance', 'complete']);
    expect(complete.completedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(previousOnboardingState(complete).currentStep).toBe('team-guidance');
  });

  it('offers honest local-only team and Doat guidance', () => {
    expect(suggestedTemplates({ businessName: 'Store', businessType: 'retail' }).length).toBeGreaterThan(0);
    expect(localMemberGuidance('small')).toContain('does not send invitations');
    expect(LOCAL_DOAT_GUIDANCE).toContain('supported local provider');
  });
});
