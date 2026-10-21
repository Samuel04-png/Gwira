import React from 'react';
import type { LocalOnboardingState, OnboardingStep } from './onboardingModel.js';
import { ONBOARDING_STEPS, isStepComplete } from './onboardingModel.js';

const labels: Record<OnboardingStep, string> = { business: 'Business', organization: 'Organization', 'starting-point': 'Starting point', 'team-guidance': 'Team guidance', complete: 'Complete' };

export function OnboardingChecklist({ state }: { state: LocalOnboardingState }): React.ReactElement {
  const currentIndex = ONBOARDING_STEPS.indexOf(state.currentStep);
  return <ol className="gwira-onboarding-checklist" aria-label="Onboarding progress">
    {ONBOARDING_STEPS.map((step, index) => <li key={step} aria-current={step === state.currentStep ? 'step' : undefined} data-status={index < currentIndex || (step === state.currentStep && isStepComplete(state, step)) ? 'complete' : step === state.currentStep ? 'current' : 'pending'}>{labels[step]}</li>)}
  </ol>;
}
