#!/usr/bin/env node
import 'dotenv/config';
import { Command, CommanderError } from 'commander';
import { ALL_STEPS, WEB_STEPS, MOBILE_STEPS, ENV_CONFIGS } from './types.js';
import type { Step, Tier, Vertical, Platform, CliOptions, ProviderContext } from './types.js';
import { ApiClient } from './api/client.js';
import { getAccessToken } from './api/auth.js';
import { getStepsUpTo } from './steps/registry.js';

export function parseArgs(argv: string[]): CliOptions {
  const program = new Command();
  program.exitOverride();
  program
    .requiredOption(
      '--step <step>',
      `Enrollment checkpoint`,
      (value: string) => {
        const allSteps = [...ALL_STEPS];
        if (!allSteps.includes(value as any)) {
          throw new Error(
            `Invalid step "${value}". Valid: ${allSteps.join(', ')}`
          );
        }
        return value as Step;
      }
    )
    .option('--tier <tier>', 'Subscription tier', 'premium')
    .option('--vertical <vertical>', 'Service vertical', 'childcare')
    .option('--platform <platform>', 'Target platform (web, mobile)', 'web')
    .option('--env <env>', 'Target environment', 'dev');

  program.parse(argv, { from: 'user' });
  const opts = program.opts() as CliOptions;

  const validPlatforms = ['web', 'mobile'];
  if (!validPlatforms.includes(opts.platform)) {
    throw new Error(`Invalid platform "${opts.platform}". Valid: ${validPlatforms.join(', ')}`);
  }

  const validSteps = opts.platform === 'mobile' ? MOBILE_STEPS : WEB_STEPS;
  if (!validSteps.includes(opts.step as any)) {
    throw new Error(
      `Step "${opts.step}" is not valid for ${opts.platform} platform. Valid steps: ${[...validSteps].join(', ')}`
    );
  }

  return opts;
}

async function loadPayloads(vertical: Vertical) {
  switch (vertical) {
    case 'childcare':
      return import('./payloads/childcare.js');
    default:
      throw new Error(`Unsupported vertical: ${vertical}`);
  }
}

async function run(opts: CliOptions): Promise<void> {
  const envConfig = ENV_CONFIGS[opts.env];
  if (!envConfig) {
    throw new Error(`Unknown environment: ${opts.env}`);
  }

  if (!envConfig.apiKey) {
    throw new Error('CZEN_API_KEY environment variable is required');
  }

  const client = new ApiClient(envConfig.baseUrl, envConfig.apiKey);
  const payloads = await loadPayloads(opts.vertical);

  const ctx: ProviderContext = {
    email: '',
    password: 'letmein1',
    memberId: '',
    authToken: '',
    tier: opts.tier as Tier,
    vertical: payloads.providerCreateDefaults.serviceType,
  };

  const steps = getStepsUpTo(opts.step, opts.platform);

  console.log(`\nCreating provider at step: ${opts.step} (${opts.platform})\n`);

  for (const step of steps) {
    if (step.name !== 'account-created' && !ctx.accessToken) {
      console.log('  ⏳ Acquiring access token...');
      ctx.accessToken = await getAccessToken(ctx.email, envConfig.baseUrl);
      client.setAccessToken(ctx.accessToken);
    }

    try {
      await step.runner(client, ctx, payloads, envConfig);
    } catch (err) {
      console.error(`\n✗ Failed at step: ${step.name}`);
      console.error(`  Error: ${(err as Error).message}`);
      if (ctx.email) {
        console.log('\n  Partial provider created:');
        console.log(`    Email:    ${ctx.email}`);
        console.log(`    Password: ${ctx.password}`);
        if (ctx.memberId) console.log(`    MemberId: ${ctx.memberId}`);
      }
      process.exit(1);
    }
  }

  console.log(`\n✓ Provider created at step: ${opts.step} (${opts.platform})\n`);
  console.log(`  Email:      ${ctx.email}`);
  console.log(`  Password:   ${ctx.password}`);
  console.log(`  MemberId:   ${ctx.memberId}`);
  console.log(`  UUID:       ${ctx.uuid ?? '(set MYSQL_DB_PASS_DEV to retrieve)'}`);
  console.log(`  Vertical:   ${ctx.vertical}`);

  const stepsWithAvailability: Step[] = ['profile-complete', 'pre-upgrade', 'upgraded', 'at-disclosure', 'fully-enrolled'];
  if (stepsWithAvailability.includes(opts.step)) {
    console.log('');
    console.log('  ℹ Availability: Full-time preference is set. Detailed day/time schedule');
    console.log('    is not visible in "Your Services & Availability" on first login.');
    console.log('    Tap "Edit" > save once in the app to populate the calendar view.');
  }
  console.log('');
}

const isMainModule = process.argv[1]?.includes('index');
if (isMainModule) {
  try {
    const opts = parseArgs(process.argv.slice(2));
    run(opts).catch((err) => {
      console.error('Fatal error:', (err as Error).message);
      process.exit(1);
    });
  } catch (err) {
    if (err instanceof CommanderError) {
      process.exit(err.exitCode);
    }
    console.error('Fatal error:', (err as Error).message);
    process.exit(1);
  }
}
