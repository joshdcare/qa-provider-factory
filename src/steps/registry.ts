import type { ApiClient } from '../api/client.js';
import type { ProviderContext, Step, Platform, EnvConfig } from '../types.js';
import type { VerticalConfig } from '../verticals.js';
import type { RunEmitter } from '../tui/emitter.js';
import { MOBILE_STEPS } from '../types.js';
import { createAccountMobile } from './account.js';
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
    envConfig?: EnvConfig,
    verticalConfig?: VerticalConfig,
    emitter?: RunEmitter
  ) => Promise<void>;
}

async function noop(): Promise<void> {}

export const MOBILE_STEP_PIPELINE: StepDefinition[] = [
  { name: 'account-created', runner: createAccountMobile },
  { name: 'at-build-profile', runner: noop },
  { name: 'at-availability', runner: mobilePreAvailability },
  { name: 'profile-complete', runner: mobileCompleteProfile },
  { name: 'upgraded', runner: mobileUpgrade },
  { name: 'at-disclosure', runner: noop },
  { name: 'fully-enrolled', runner: mobileFullyEnrolled },
];

export function getStepsUpTo(targetStep: Step, platform: Platform): StepDefinition[] {
  if (platform === 'web') {
    throw new Error(
      'Web platform uses browser-based enrollment. Use runWebEnrollmentFlow() instead.'
    );
  }

  const pipeline = MOBILE_STEP_PIPELINE;
  const index = pipeline.findIndex((s) => s.name === targetStep);
  if (index === -1) {
    throw new Error(
      `Unknown step "${targetStep}" for mobile platform. Valid steps: ${[...MOBILE_STEPS].join(', ')}`
    );
  }
  return pipeline.slice(0, index + 1);
}
