import type { ApiClient } from '../api/client.js';
import type { ProviderContext, Step, Platform, EnvConfig } from '../types.js';
import { WEB_STEPS, MOBILE_STEPS } from '../types.js';
import { createAccount, createAccountMobile } from './account.js';
import { setupProfile, completeProfile, webCompleteProfile } from './profile.js';
import { setupPayment, upgradeSubscription } from './upgrade.js';
import { acceptDisclosure } from './disclosure.js';
import { completeEnrollment } from './enrollment.js';
import {
  mobilePreAvailability,
  mobileUpgrade,
  mobileCompleteProfile,
  mobileFullyEnrolled,
} from './mobile.js';

export interface StepDefinition {
  name: Step;
  runner: (
    client: ApiClient,
    ctx: ProviderContext,
    payloads: any,
    envConfig?: EnvConfig
  ) => Promise<void>;
}

async function noop(): Promise<void> {}

export const WEB_STEP_PIPELINE: StepDefinition[] = [
  { name: 'account-created', runner: createAccount },
  { name: 'profile-complete', runner: webCompleteProfile },
  { name: 'pre-upgrade', runner: setupPayment },
  { name: 'upgraded', runner: upgradeSubscription },
  { name: 'at-disclosure', runner: acceptDisclosure },
  { name: 'fully-enrolled', runner: completeEnrollment },
];

export const MOBILE_STEP_PIPELINE: StepDefinition[] = [
  { name: 'account-created', runner: createAccountMobile },
  { name: 'at-build-profile', runner: noop },
  { name: 'at-availability', runner: mobilePreAvailability },
  { name: 'profile-complete', runner: mobileCompleteProfile },
  { name: 'upgraded', runner: mobileUpgrade },
  { name: 'at-disclosure', runner: noop },
  { name: 'fully-enrolled', runner: mobileFullyEnrolled },
];

function getPipeline(platform: Platform): StepDefinition[] {
  return platform === 'mobile' ? MOBILE_STEP_PIPELINE : WEB_STEP_PIPELINE;
}

function getValidSteps(platform: Platform): readonly string[] {
  return platform === 'mobile' ? MOBILE_STEPS : WEB_STEPS;
}

export function getStepsUpTo(targetStep: Step, platform: Platform = 'web'): StepDefinition[] {
  const pipeline = getPipeline(platform);
  const validSteps = getValidSteps(platform);
  const index = pipeline.findIndex((s) => s.name === targetStep);
  if (index === -1) {
    throw new Error(
      `Unknown step "${targetStep}" for ${platform} platform. Valid steps: ${validSteps.join(', ')}`
    );
  }
  return pipeline.slice(0, index + 1);
}
