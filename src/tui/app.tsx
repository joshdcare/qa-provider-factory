import React, { useState, useCallback, useRef } from 'react';
import { Box, useApp } from 'ink';
import { Wizard, type WizardResult } from './wizard.js';
import { Execution } from './execution.js';
import { RunEmitter } from './emitter.js';
import { getStepsForPlatform } from './wizard.js';
import type { Tier, Vertical, ProviderContext, EnvConfig, Step } from '../types.js';
import { ENV_CONFIGS } from '../types.js';
import type { VerticalConfig } from '../verticals.js';
import { VERTICAL_REGISTRY } from '../verticals.js';
import { STEP_DESCRIPTIONS } from './step-descriptions.js';

type Screen = 'wizard' | 'execution';

async function loadPayloads(vertical: Vertical): Promise<any> {
  switch (vertical) {
    case 'childcare':
      return import('../payloads/childcare.js');
    case 'seniorcare':
      return import('../payloads/seniorcare.js');
    case 'petcare':
      return import('../payloads/petcare.js');
    case 'housekeeping':
      return import('../payloads/housekeeping.js');
    case 'tutoring':
      return import('../payloads/tutoring.js');
  }
}

async function runWebExecution(
  result: WizardResult,
  envConfig: EnvConfig,
  emitter: RunEmitter,
  continueRef: React.MutableRefObject<(() => void) | null>,
): Promise<void> {
  const { runWebEnrollmentFlow } = await import('../steps/web-flow.js');

  for (let i = 0; i < result.count; i++) {
    for (const vertical of result.verticals) {
      if (result.count > 1 || result.verticals.length > 1) {
        emitter.info(`── Run ${i + 1}/${result.count} · ${vertical} ──`);
      }

      const verticalConfig = VERTICAL_REGISTRY[vertical];

      const onStepComplete =
        result.executionMode === 'step-through'
          ? () => new Promise<void>((resolve) => { continueRef.current = resolve; })
          : undefined;

      await runWebEnrollmentFlow(
        result.step,
        result.tier,
        envConfig,
        verticalConfig,
        verticalConfig.serviceId,
        result.autoClose,
        emitter,
        onStepComplete,
      );

      emitter.contextUpdate('vertical', vertical);
    }
  }
}

async function runMobileExecution(
  result: WizardResult,
  envConfig: EnvConfig,
  emitter: RunEmitter,
  continueRef: React.MutableRefObject<(() => void) | null>,
): Promise<void> {
  const { ApiClient } = await import('../api/client.js');
  const { getStepsUpTo } = await import('../steps/registry.js');
  const { getAccessToken } = await import('../api/auth.js');

  for (let i = 0; i < result.count; i++) {
    for (const vertical of result.verticals) {
      if (result.count > 1 || result.verticals.length > 1) {
        emitter.info(`── Run ${i + 1}/${result.count} · ${vertical} ──`);
      }

      const client = new ApiClient(envConfig.baseUrl, envConfig.apiKey);
      client.setEmitter(emitter);

      const verticalConfig = VERTICAL_REGISTRY[vertical];
      const payloads = await loadPayloads(vertical);
      const steps = getStepsUpTo(result.step, 'mobile');

      const ctx: ProviderContext = {
        email: '',
        password: '',
        memberId: '',
        authToken: '',
        tier: result.tier,
        vertical: verticalConfig.serviceId,
      };

      for (const stepDef of steps) {
        const description = STEP_DESCRIPTIONS[stepDef.name] ?? stepDef.name;
        emitter.stepStart(stepDef.name, description);

        try {
          await stepDef.runner(client, ctx, payloads, envConfig, verticalConfig, emitter);
          emitter.stepComplete(stepDef.name);

          if (ctx.email) emitter.contextUpdate('email', ctx.email);
          if (ctx.memberId) emitter.contextUpdate('memberId', ctx.memberId);

          if (stepDef.name === 'account-created' && ctx.email) {
            emitter.auth('Obtaining access token...');
            const accessToken = await getAccessToken(ctx.email, envConfig.baseUrl);
            ctx.accessToken = accessToken;
            client.setAccessToken(accessToken);
            emitter.auth('Access token acquired');
          }

          if (result.executionMode === 'step-through') {
            await new Promise<void>((resolve) => { continueRef.current = resolve; });
          }
        } catch (err) {
          emitter.stepError(stepDef.name, (err as Error).message);
          return;
        }
      }

      emitter.contextUpdate('vertical', vertical);
    }
  }
}

async function runExecution(
  result: WizardResult,
  envConfig: EnvConfig,
  emitter: RunEmitter,
  continueRef: React.MutableRefObject<(() => void) | null>,
): Promise<void> {
  if (result.platform === 'web') {
    await runWebExecution(result, envConfig, emitter, continueRef);
  } else {
    await runMobileExecution(result, envConfig, emitter, continueRef);
  }
}

export function App(): React.ReactElement {
  const { exit } = useApp();
  const [screen, setScreen] = useState<Screen>('wizard');
  const [config, setConfig] = useState<WizardResult | null>(null);
  const emitterRef = useRef<RunEmitter>(new RunEmitter());
  const continueRef = useRef<(() => void) | null>(null);

  const handleWizardComplete = useCallback((result: WizardResult) => {
    setConfig(result);
    setScreen('execution');

    const emitter = emitterRef.current;
    const envConfig = ENV_CONFIGS[result.env];

    setTimeout(() => {
      runExecution(result, envConfig, emitter, continueRef).catch((err) => {
        emitter.stepError('fatal', (err as Error).message);
      });
    }, 100);
  }, []);

  const handleStepContinue = useCallback(() => {
    continueRef.current?.();
    continueRef.current = null;
  }, []);

  const handleRetry = useCallback(() => {
    // Placeholder — could re-run last failed step
  }, []);

  const handleQuit = useCallback(() => {
    exit();
  }, [exit]);

  if (screen === 'wizard' || !config) {
    return <Wizard onComplete={handleWizardComplete} />;
  }

  const steps = getStepsForPlatform(config.platform);

  return (
    <Execution
      emitter={emitterRef.current}
      steps={steps}
      platform={config.platform}
      verticals={config.verticals}
      tier={config.tier}
      env={config.env}
      executionMode={config.executionMode}
      onStepContinue={handleStepContinue}
      onRetry={handleRetry}
      onQuit={handleQuit}
    />
  );
}
