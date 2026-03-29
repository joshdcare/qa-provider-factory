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
import { RunRecorder } from '../recorder/run-recorder.js';

type Screen = 'wizard' | 'execution';
let runId = 0;

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
  monitoringAbortRef: React.MutableRefObject<(() => void) | null>,
): Promise<void> {
  const { runWebEnrollmentFlow } = await import('../steps/web-flow.js');

  for (let i = 0; i < result.count; i++) {
    for (const vertical of result.verticals) {
      if (result.count > 1 || result.verticals.length > 1) {
        emitter.info(`── Run ${i + 1}/${result.count} · ${vertical} ──`);
      }

      const verticalConfig = VERTICAL_REGISTRY[vertical];
      const recorder = new RunRecorder({
        platform: 'web',
        vertical,
        tier: result.tier,
        targetStep: result.step,
      });
      recorder.attach(emitter);

      const onStepComplete =
        result.executionMode === 'step-through'
          ? () => new Promise<void>((resolve) => { continueRef.current = resolve; })
          : undefined;

      try {
        const { result: flowResult, monitoring } = await runWebEnrollmentFlow(
          result.step,
          result.tier,
          envConfig,
          verticalConfig,
          verticalConfig.serviceId,
          result.autoClose,
          emitter,
          onStepComplete,
          recorder,
        );
        await recorder.finish({
          email: flowResult.email,
          password: flowResult.password,
          memberId: flowResult.memberId,
          vertical: flowResult.vertical,
        }, { keepBrowserOpen: !!monitoring });

        if (monitoring) {
          emitter.monitoringStart();
          const abortPromise = new Promise<void>(resolve => {
            monitoringAbortRef.current = resolve;
          });
          await Promise.race([monitoring, abortPromise]);
          monitoringAbortRef.current = null;
        }
      } catch (err) {
        recorder.recordError('web-flow', err as Error);
        await recorder.finish({ email: '', password: '' });
        throw err;
      }

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

      const recorder = new RunRecorder({
        platform: 'mobile',
        vertical,
        tier: result.tier,
        targetStep: result.step,
      });
      recorder.attach(emitter);

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

      let failed = false;
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
          recorder.recordError(stepDef.name, err as Error);
          emitter.stepError(stepDef.name, (err as Error).message);
          failed = true;
          break;
        }
      }

      await recorder.finish(ctx);
      emitter.contextUpdate('vertical', vertical);
      if (failed) return;
    }
  }
}

async function runExecution(
  result: WizardResult,
  envConfig: EnvConfig,
  emitter: RunEmitter,
  continueRef: React.MutableRefObject<(() => void) | null>,
  monitoringAbortRef: React.MutableRefObject<(() => void) | null>,
): Promise<void> {
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args: unknown[]) => emitter.info(args.join(' '));
  console.error = (...args: unknown[]) => emitter.info(`[error] ${args.join(' ')}`);

  try {
    if (result.platform === 'web') {
      await runWebExecution(result, envConfig, emitter, continueRef, monitoringAbortRef);
    } else {
      await runMobileExecution(result, envConfig, emitter, continueRef);
    }
  } catch (err) {
    emitter.stepError('fatal', (err as Error).message);
  } finally {
    console.log = originalLog;
    console.error = originalError;
    emitter.runComplete();
  }
}

export function App(): React.ReactElement {
  const { exit } = useApp();
  const [screen, setScreen] = useState<Screen>('wizard');
  const [config, setConfig] = useState<WizardResult | null>(null);
  const [key, setKey] = useState(0);
  const emitterRef = useRef<RunEmitter>(new RunEmitter());
  const continueRef = useRef<(() => void) | null>(null);
  const monitoringAbortRef = useRef<(() => void) | null>(null);

  const startRun = useCallback((result: WizardResult) => {
    const emitter = new RunEmitter();
    emitterRef.current = emitter;
    const envConfig = ENV_CONFIGS[result.env];

    setConfig(result);
    setScreen('execution');
    setKey(++runId);

    setTimeout(() => {
      runExecution(result, envConfig, emitter, continueRef, monitoringAbortRef);
    }, 100);
  }, []);

  const handleWizardComplete = useCallback((result: WizardResult) => {
    startRun(result);
  }, [startRun]);

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

  const handleCreateAnother = useCallback(() => {
    if (config) startRun(config);
  }, [config, startRun]);

  const handleNewConfig = useCallback(() => {
    setScreen('wizard');
    setConfig(null);
  }, []);

  if (screen === 'wizard' || !config) {
    return <Wizard onComplete={handleWizardComplete} />;
  }

  const steps = getStepsForPlatform(config.platform);

  return (
    <Execution
      key={key}
      emitter={emitterRef.current}
      steps={steps}
      platform={config.platform}
      verticals={config.verticals}
      tier={config.tier}
      env={config.env}
      executionMode={config.executionMode}
      onStepContinue={handleStepContinue}
      onAbortMonitoring={() => { monitoringAbortRef.current?.(); }}
      onRetry={handleRetry}
      onQuit={handleQuit}
      onCreateAnother={handleCreateAnother}
      onNewConfig={handleNewConfig}
    />
  );
}
