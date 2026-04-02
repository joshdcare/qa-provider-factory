import React, { useState } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import SelectInput from 'ink-select-input';
import TextInput from 'ink-text-input';
import type { Platform, Step, Tier, Vertical, Env } from '../types.js';
import { WEB_STEPS, MOBILE_STEPS, ALL_VERTICALS, ALL_ENVS } from '../types.js';
import { STEP_DESCRIPTIONS } from './step-descriptions.js';
import { COLORS } from './theme.js';
import { FlagBrowser } from './flag-browser.js';
import { revertSessionToggles, getSessionToggleEntries } from './flag-session.js';

export interface WizardResult {
  platform: Platform;
  verticals: Vertical[];
  step: Step;
  tier: Tier;
  count: number;
  autoClose: boolean;
  env: Env;
  executionMode: 'run-all' | 'step-through';
}

export function getStepsForPlatform(platform: Platform): readonly Step[] {
  return platform === 'web' ? WEB_STEPS : MOBILE_STEPS;
}

interface EnvWarning {
  var: string;
  reason: string;
}

export function validateEnvVars(platform: Platform, step: Step, env: Env): EnvWarning[] {
  const warnings: EnvWarning[] = [];

  const apiKeyVar = env === 'stg' ? 'CZEN_API_KEY_STG' : 'CZEN_API_KEY';
  if (platform === 'mobile' && !process.env[apiKeyVar]) {
    warnings.push({ var: apiKeyVar, reason: 'Required for all mobile flows.' });
  }

  const dbPassVar = env === 'stg' ? 'MYSQL_DB_PASS_STG' : 'MYSQL_DB_PASS_DEV';
  if (platform === 'mobile' && step === 'fully-enrolled' && !process.env[dbPassVar]) {
    warnings.push({ var: dbPassVar, reason: 'Required for fully-enrolled (Sterling BGC callback).' });
  }

  return warnings;
}

type WizardStage = 'env' | 'platform' | 'vertical' | 'step' | 'flags' | 'tier' | 'options' | 'confirm';

const ALL_STAGES: WizardStage[] = ['env', 'platform', 'vertical', 'step', 'flags', 'tier', 'options', 'confirm'];

const STEPS_NEEDING_TIER: ReadonlySet<Step> = new Set<Step>([
  'at-basic-payment', 'at-premium-payment', 'at-app-download',
  'upgraded', 'at-disclosure', 'fully-enrolled',
]);

const STAGE_LABELS: Record<WizardStage, string> = {
  env: 'Environment',
  platform: 'Platform',
  vertical: 'Vertical',
  step: 'Step',
  flags: 'Flags',
  tier: 'Tier',
  options: 'Options',
  confirm: 'Confirm',
};

const ENV_LABELS: Record<Env, string> = {
  dev: 'Dev (dev.carezen.net)',
  stg: 'Staging (stg.carezen.net)',
};

interface WizardProps {
  onComplete: (result: WizardResult) => void;
}

export function Wizard({ onComplete }: WizardProps): React.ReactElement {
  const { exit } = useApp();
  const [stage, setStage] = useState<WizardStage>('env');
  const [env, setEnv] = useState<Env>('dev');
  const [platform, setPlatform] = useState<Platform>('web');
  const [verticals, setVerticals] = useState<Vertical[]>(['childcare']);
  const [step, setStep] = useState<Step>('at-location');
  const [tier, setTier] = useState<Tier>('premium');
  const [count, setCount] = useState('1');
  const [autoClose] = useState(false);
  const [highlightedStep, setHighlightedStep] = useState<Step | null>(null);
  const [showFlags, setShowFlags] = useState(false);

  const needsTier = STEPS_NEEDING_TIER.has(step);
  const skip = new Set<WizardStage>();
  if (!needsTier) skip.add('tier');
  const stages = ALL_STAGES.filter(s => !skip.has(s));

  useInput((input, key) => {
    if (showFlags) return;
    if (key.escape) {
      const idx = stages.indexOf(stage);
      if (idx > 0) setStage(stages[idx - 1]);
    }
    if (input === 'q' && stage !== 'options') {
      void revertSessionToggles().finally(() => exit());
    }
  });

  const currentIdx = stages.indexOf(stage);

  return (
    <Box flexDirection="column" height="100%">
      <Box borderStyle="single" borderColor={COLORS.chrome} paddingX={1}>
        <Text color={COLORS.banner} bold>██ JUMPER</Text>
        <Box flexGrow={1} />
        <Text color={COLORS.dimText}>Configuration</Text>
      </Box>

      <Box flexGrow={1} flexDirection="row">
        <Box flexDirection="column" width={24} borderStyle="single" borderColor={COLORS.chrome} paddingX={1}>
          <Text color={COLORS.dimText} dimColor>SETUP</Text>
          {stages.map((s, i) => {
            const icon = i < currentIdx ? '✓' : i === currentIdx ? '▸' : '○';
            const color = i < currentIdx ? COLORS.stepComplete : i === currentIdx ? COLORS.stepRunning : COLORS.stepPending;
            return (
              <Text key={s} color={color}>
                {icon} {STAGE_LABELS[s]}
              </Text>
            );
          })}
        </Box>

        <Box flexDirection="column" flexGrow={1} borderStyle="single" borderColor={COLORS.chrome} paddingX={1}>
          {renderStage()}
        </Box>
      </Box>

      <Box borderStyle="single" borderColor={COLORS.chrome} paddingX={1}>
        <Text color={COLORS.dimText}>↑↓ select · enter: confirm · esc: back · q: quit</Text>
        <Box flexGrow={1} />
        <Text color={COLORS.dimText}>Step {currentIdx + 1}/{stages.length}</Text>
      </Box>
    </Box>
  );

  function renderStage(): React.ReactElement {
    switch (stage) {
      case 'env':
        return (
          <Box flexDirection="column">
            <Text color={COLORS.stepRunning} bold>Which environment?</Text>
            <Text color={COLORS.dimText}>Select the target environment for provider creation</Text>
            <Box marginTop={1}>
              <SelectInput
                items={ALL_ENVS.map(e => ({ label: ENV_LABELS[e], value: e }))}
                onSelect={(item) => { setEnv(item.value as Env); setStage('platform'); }}
              />
            </Box>
          </Box>
        );

      case 'flags': {
        const nextStage = needsTier ? 'tier' : 'options';
        return (
          <Box flexDirection="column">
            <Text color={COLORS.stepRunning} bold>Feature Flags</Text>
            <Text color={COLORS.dimText}>Review or toggle LaunchDarkly flags for {env} before running</Text>
            {showFlags ? (
              <Box marginTop={1}>
                <FlagBrowser env={env} onClose={() => setShowFlags(false)} />
              </Box>
            ) : (
              <Box marginTop={1}>
                <SelectInput
                  items={[
                    { label: 'Continue', value: 'continue' },
                    { label: 'Manage feature flags', value: 'flags' },
                  ]}
                  onSelect={(item) => {
                    if (item.value === 'flags') {
                      setShowFlags(true);
                    } else {
                      setStage(nextStage);
                    }
                  }}
                />
              </Box>
            )}
          </Box>
        );
      }

      case 'platform':
        return (
          <Box flexDirection="column">
            <Text color={COLORS.stepRunning} bold>Which platform?</Text>
            <Text color={COLORS.dimText}>Web uses Playwright browser automation. Mobile uses API calls.</Text>
            <Box marginTop={1}>
              <SelectInput
                items={[
                  { label: 'Web (Playwright browser)', value: 'web' as Platform },
                  { label: 'Mobile (API-driven)', value: 'mobile' as Platform },
                ]}
                onSelect={(item) => { setPlatform(item.value); setStage('vertical'); }}
              />
            </Box>
          </Box>
        );

      case 'vertical':
        return (
          <Box flexDirection="column">
            <Text color={COLORS.stepRunning} bold>Which vertical(s)?</Text>
            <Text color={COLORS.dimText}>Select one or use "All" for batch runs</Text>
            <Box marginTop={1}>
              <SelectInput
                items={[
                  ...ALL_VERTICALS.map(v => ({ label: v, value: v as string })),
                  { label: 'All verticals', value: 'all' },
                ]}
                onSelect={(item) => {
                  if (item.value === 'all') {
                    setVerticals([...ALL_VERTICALS]);
                  } else {
                    setVerticals([item.value as Vertical]);
                  }
                  setStage('step');
                }}
              />
            </Box>
          </Box>
        );

      case 'step': {
        const steps = getStepsForPlatform(platform);
        return (
          <Box flexDirection="column">
            <Text color={COLORS.stepRunning} bold>Which enrollment step?</Text>
            <Text color={COLORS.dimText}>The provider will be created up to this checkpoint</Text>
            <Box marginTop={1}>
              <SelectInput
                items={steps.map(s => ({ label: s, value: s }))}
                onSelect={(item) => {
                  const selected = item.value as Step;
                  setStep(selected);
                  setStage('flags');
                }}
                onHighlight={(item) => { setHighlightedStep(item.value as Step); }}
              />
            </Box>
            {highlightedStep && (
              <Box marginTop={1} borderStyle="single" borderColor={COLORS.chrome} paddingX={1}>
                <Text color={COLORS.banner}>ℹ </Text>
                <Text color={COLORS.dimText}>{STEP_DESCRIPTIONS[highlightedStep]}</Text>
              </Box>
            )}
          </Box>
        );
      }

      case 'tier':
        return (
          <Box flexDirection="column">
            <Text color={COLORS.stepRunning} bold>Which tier?</Text>
            <Text color={COLORS.dimText}>Premium includes subscription + background check flow</Text>
            <Box marginTop={1}>
              <SelectInput
                items={[
                  { label: 'Premium', value: 'premium' as Tier },
                  { label: 'Basic', value: 'basic' as Tier },
                ]}
                onSelect={(item) => { setTier(item.value); setStage('options'); }}
              />
            </Box>
          </Box>
        );

      case 'options':
        return (
          <Box flexDirection="column">
            <Text color={COLORS.stepRunning} bold>Options</Text>
            <Text color={COLORS.dimText}>Defaults shown — change only what you need</Text>
            <Box marginTop={1} flexDirection="column">
              <Box>
                <Text>Count (1-50): </Text>
                <TextInput value={count} onChange={setCount} onSubmit={() => setStage('confirm')} />
              </Box>
              <Text color={COLORS.dimText}>Press enter to continue</Text>
            </Box>
          </Box>
        );

      case 'confirm': {
        const warnings = validateEnvVars(platform, step, env);
        const parsedCount = parseInt(count, 10);
        const countValid = !isNaN(parsedCount) && parsedCount >= 1 && parsedCount <= 50;
        const toggledFlags = getSessionToggleEntries();
        return (
          <Box flexDirection="column">
            <Text color={COLORS.stepRunning} bold>Ready to launch</Text>
            <Box marginTop={1} flexDirection="column">
              <Text><Text color={COLORS.dimText}>Platform    </Text><Text color={COLORS.contextValue}>{platform}</Text></Text>
              <Text><Text color={COLORS.dimText}>Vertical    </Text><Text color={COLORS.contextValue}>{verticals.join(', ')}</Text></Text>
              <Text><Text color={COLORS.dimText}>Step        </Text><Text color={COLORS.contextValue}>{step}</Text></Text>
              <Text><Text color={COLORS.dimText}>Tier        </Text><Text color={COLORS.contextValue}>{tier}</Text></Text>
              <Text><Text color={COLORS.dimText}>Count       </Text><Text color={COLORS.contextValue}>{count} per vertical{verticals.length > 1 ? ` (${parseInt(count, 10) * verticals.length} total)` : ''}</Text></Text>
              <Text><Text color={COLORS.dimText}>Environment </Text><Text color={COLORS.contextValue}>{env}</Text></Text>
            </Box>
            {toggledFlags.length > 0 && (
              <Box marginTop={1} flexDirection="column">
                <Text color={COLORS.banner} bold>Flags changed this session (will revert on exit):</Text>
                {toggledFlags.map(f => (
                  <Box key={f.key} flexDirection="column">
                    <Text>
                      <Text color={COLORS.dimText}>  </Text>
                      <Text color={f.originalOn ? COLORS.stepError : COLORS.stepComplete}>
                        {f.originalOn ? '● OFF' : '● ON '}
                      </Text>
                      <Text color={COLORS.dimText}> ← </Text>
                      <Text color={f.originalOn ? COLORS.stepComplete : COLORS.stepError}>
                        {f.originalOn ? 'ON' : 'OFF'}
                      </Text>
                      <Text color={COLORS.contextValue}>  {f.key}</Text>
                    </Text>
                    {f.originalFallthroughName && (
                      <Text>
                        <Text color={COLORS.dimText}>{'                 variation: '}</Text>
                        <Text color={COLORS.contextValue}>{f.originalFallthroughName}</Text>
                        <Text color={COLORS.dimText}>{' → changed'}</Text>
                      </Text>
                    )}
                  </Box>
                ))}
              </Box>
            )}
            {warnings.length > 0 && (
              <Box marginTop={1} flexDirection="column">
                <Text color={COLORS.stepError} bold>⚠ Missing environment variables:</Text>
                {warnings.map(w => (
                  <Text key={w.var} color={COLORS.stepError}>  {w.var} — {w.reason}</Text>
                ))}
              </Box>
            )}
            {!countValid && (
              <Box marginTop={1}>
                <Text color={COLORS.stepError}>⚠ Count must be 1-50. Go back to fix.</Text>
              </Box>
            )}
            <Box marginTop={1}>
              <SelectInput
                items={[
                  { label: 'Run all steps automatically', value: 'run-all' },
                  { label: 'Step through one at a time', value: 'step-through' },
                  { label: '← Go back and edit', value: 'back' },
                ]}
                onSelect={(item) => {
                  if (item.value === 'back') {
                    setStage('platform');
                  } else if (countValid && warnings.length === 0) {
                    onComplete({
                      platform, verticals, step, tier, env,
                      count: parsedCount,
                      autoClose,
                      executionMode: item.value as 'run-all' | 'step-through',
                    });
                  }
                }}
              />
            </Box>
          </Box>
        );
      }
    }
  }
}
