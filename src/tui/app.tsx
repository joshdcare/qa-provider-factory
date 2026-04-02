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
import { revertSessionToggles } from './flag-session.js';

type Screen = 'wizard' | 'execution';
let runId = 0;
const BATCH_COOLDOWN_MS = 10_000;
const MAX_USER_RETRIES = 3;
const RETRY_BACKOFF_MS = [15_000, 30_000, 60_000];

function isRetryableError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('403') || msg.includes('502')
    || msg.includes('VPN access required')
    || msg.includes('CREDIT_CARD_INVALID');
}

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
  const totalPerVertical = result.count;
  const isBatch = totalPerVertical > 1 || result.verticals.length > 1;
  let created = 0;
  let skipped = 0;

  for (const vertical of result.verticals) {
    for (let i = 0; i < totalPerVertical; i++) {
      if (isBatch) {
        emitter.info(`── ${vertical} ${i + 1}/${totalPerVertical} ──`);
      }

      let succeeded = false;

      for (let attempt = 0; attempt <= MAX_USER_RETRIES; attempt++) {
        if (attempt > 0) {
          const wait = RETRY_BACKOFF_MS[attempt - 1] ?? RETRY_BACKOFF_MS[RETRY_BACKOFF_MS.length - 1];
          emitter.info(`⏳ Retry ${attempt}/${MAX_USER_RETRIES} — waiting ${wait / 1000}s…`);
          await new Promise(resolve => setTimeout(resolve, wait));
          emitter.info(`── Retrying ${vertical} ${i + 1}/${totalPerVertical} (attempt ${attempt + 1}) ──`);
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

          emitter.userCreated({
            email: flowResult.email,
            password: flowResult.password,
            memberId: flowResult.memberId,
            vertical,
            runIndex: created + 1,
          });

          if (monitoring) {
            emitter.monitoringStart();
            const abortPromise = new Promise<void>(resolve => {
              monitoringAbortRef.current = resolve;
            });
            await Promise.race([monitoring, abortPromise]);
            monitoringAbortRef.current = null;
          }

          emitter.contextUpdate('vertical', vertical);
          succeeded = true;
          created++;
          break;
        } catch (err) {
          recorder.recordError('web-flow', err as Error);
          await recorder.finish({ email: '', password: '' });
          if (attempt < MAX_USER_RETRIES) {
            emitter.info(`⚠ Error: ${(err as Error).message.slice(0, 120)}`);
            continue;
          }
          emitter.info(`✗ ${vertical} ${i + 1}/${totalPerVertical} failed after ${MAX_USER_RETRIES + 1} attempts — skipping`);
          skipped++;
          break;
        }
      }

      const isLast = vertical === result.verticals[result.verticals.length - 1]
        && i === totalPerVertical - 1;
      if (!isLast && isBatch) {
        emitter.info(`Cooling down ${BATCH_COOLDOWN_MS / 1000}s before next user…`);
        await new Promise(resolve => setTimeout(resolve, BATCH_COOLDOWN_MS));
      }
    }
  }

  if (isBatch) {
    emitter.info(`── Batch complete: ${created} created, ${skipped} skipped ──`);
  }
}

async function runSingleMobileUser(
  result: WizardResult,
  envConfig: EnvConfig,
  emitter: RunEmitter,
  continueRef: React.MutableRefObject<(() => void) | null>,
  vertical: Vertical,
  runIndex: number,
): Promise<{ ctx: ProviderContext; failed: boolean; error?: Error; failedStep?: string }> {
  const { ApiClient } = await import('../api/client.js');
  const { getStepsUpTo } = await import('../steps/registry.js');
  const { authenticateClient } = await import('../api/auth.js');

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
  let stepError: Error | undefined;
  let failedStepName: string | undefined;
  for (const stepDef of steps) {
    const description = STEP_DESCRIPTIONS[stepDef.name] ?? stepDef.name;
    emitter.stepStart(stepDef.name, description);

    try {
      await stepDef.runner(client, ctx, payloads, envConfig, verticalConfig, emitter);
      emitter.stepComplete(stepDef.name);

      if (ctx.email) emitter.contextUpdate('email', ctx.email);
      if (ctx.memberId) emitter.contextUpdate('memberId', ctx.memberId);

      if (stepDef.name === 'account-created' && ctx.email) {
        emitter.auth('Authenticating for GraphQL...');
        try {
          await authenticateClient(ctx.email, envConfig, client);
          emitter.auth('Authenticated via session cookies');
        } catch {
          emitter.auth('⚠ Authentication failed — GraphQL steps may fail');
        }
      }

      if (result.executionMode === 'step-through') {
        await new Promise<void>((resolve) => { continueRef.current = resolve; });
      }
    } catch (err) {
      stepError = err as Error;
      failedStepName = stepDef.name;
      recorder.recordError(stepDef.name, stepError);
      emitter.stepError(stepDef.name, stepError.message);
      failed = true;
      break;
    }
  }

  await recorder.finish(ctx);
  if (!failed) {
    emitter.userCreated({
      email: ctx.email,
      password: ctx.password,
      memberId: ctx.memberId,
      uuid: ctx.uuid,
      vertical,
      runIndex,
    });
  }
  emitter.contextUpdate('vertical', vertical);
  return { ctx, failed, error: stepError, failedStep: failedStepName };
}

async function runMobileExecution(
  result: WizardResult,
  envConfig: EnvConfig,
  emitter: RunEmitter,
  continueRef: React.MutableRefObject<(() => void) | null>,
): Promise<void> {
  const totalPerVertical = result.count;
  const isBatch = totalPerVertical > 1 || result.verticals.length > 1;
  let created = 0;
  let skipped = 0;

  for (const vertical of result.verticals) {
    for (let i = 0; i < totalPerVertical; i++) {
      if (isBatch) {
        emitter.info(`── ${vertical} ${i + 1}/${totalPerVertical} ──`);
      }

      let succeeded = false;

      for (let attempt = 0; attempt <= MAX_USER_RETRIES; attempt++) {
        if (attempt > 0) {
          const wait = RETRY_BACKOFF_MS[attempt - 1] ?? RETRY_BACKOFF_MS[RETRY_BACKOFF_MS.length - 1];
          emitter.info(`⏳ Retry ${attempt}/${MAX_USER_RETRIES} — waiting ${wait / 1000}s…`);
          await new Promise(resolve => setTimeout(resolve, wait));
          emitter.info(`── Retrying ${vertical} ${i + 1}/${totalPerVertical} (attempt ${attempt + 1}) ──`);
        }

        try {
          const { failed, error } = await runSingleMobileUser(
            result, envConfig, emitter, continueRef, vertical, created + 1,
          );
          if (failed) {
            if (attempt < MAX_USER_RETRIES) {
              emitter.info(`⚠ Failed: ${error?.message.slice(0, 120) ?? 'unknown error'}`);
              continue;
            }
            emitter.info(`✗ ${vertical} ${i + 1}/${totalPerVertical} failed after ${MAX_USER_RETRIES + 1} attempts — skipping`);
            skipped++;
            break;
          }
          succeeded = true;
          created++;
          break;
        } catch (err) {
          if (attempt < MAX_USER_RETRIES) {
            emitter.info(`⚠ Error: ${(err as Error).message.slice(0, 120)}`);
            continue;
          }
          emitter.info(`✗ ${vertical} ${i + 1}/${totalPerVertical} failed after ${MAX_USER_RETRIES + 1} attempts — skipping`);
          skipped++;
          break;
        }
      }

      const isLast = vertical === result.verticals[result.verticals.length - 1]
        && i === totalPerVertical - 1;
      if (!isLast && isBatch) {
        emitter.info(`Cooling down ${BATCH_COOLDOWN_MS / 1000}s before next user…`);
        await new Promise(resolve => setTimeout(resolve, BATCH_COOLDOWN_MS));
      }
    }
  }

  if (isBatch) {
    emitter.info(`── Batch complete: ${created} created, ${skipped} skipped ──`);
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
    void revertSessionToggles().finally(() => exit());
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
