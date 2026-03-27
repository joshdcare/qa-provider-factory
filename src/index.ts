#!/usr/bin/env node
import 'dotenv/config';
import { Command, CommanderError } from 'commander';
import { ALL_STEPS, WEB_STEPS, MOBILE_STEPS, ENV_CONFIGS } from './types.js';
import type { Step, Tier, Vertical, Platform, CliOptions, ProviderContext } from './types.js';
import { ApiClient } from './api/client.js';
import { getAccessToken } from './api/auth.js';
import { getStepsUpTo } from './steps/registry.js';
import { VERTICAL_REGISTRY } from './verticals.js';

export function parseArgs(argv: string[]): CliOptions {
  const program = new Command();
  program.exitOverride();
  program
    .name('jumper')
    .description('Jump to any provider enrollment checkpoint in seconds')
    .argument('<step>', 'Enrollment checkpoint to jump to', (value: string) => {
      const allSteps = [...ALL_STEPS];
      if (!allSteps.includes(value as any)) {
        throw new Error(
          `Invalid step "${value}". Valid: ${allSteps.join(', ')}`
        );
      }
      return value as Step;
    })
    .option('-m, --mobile', 'Target mobile platform (default: web)')
    .option('-t, --tier <tier>', 'Subscription tier (basic, premium)', 'premium')
    .option(
      '-v, --vertical <vertical>',
      'Service vertical (childcare, seniorcare, petcare, housekeeping, tutoring)',
      (value: string) => {
        const valid = ['childcare', 'seniorcare', 'petcare', 'housekeeping', 'tutoring'];
        if (!valid.includes(value)) {
          throw new Error(`Invalid vertical "${value}". Valid: ${valid.join(', ')}`);
        }
        return value as Vertical;
      },
      'childcare'
    )
    .option('-e, --env <env>', 'Target environment', 'dev')
    .option('--no-auto-close', 'Keep browser open after logging credentials (web only)')
    .addHelpText('after', `
Steps by platform:

  Web (default):
${[...WEB_STEPS].map(s => `    ${s}`).join('\n')}

  Mobile (-m):
${[...MOBILE_STEPS].map(s => `    ${s}`).join('\n')}

Examples:
  $ jumper at-location
  $ jumper at-availability -m
  $ jumper fully-enrolled -m -t basic
  $ jumper at-premium-payment -v petcare
`);

  program.parse(argv, { from: 'user' });
  const step = program.processedArgs[0] as Step;
  const rawOpts = program.opts();

  const platform: Platform = rawOpts.mobile ? 'mobile' : 'web';

  const validSteps: readonly string[] = platform === 'mobile' ? MOBILE_STEPS : WEB_STEPS;
  if (!validSteps.includes(step)) {
    throw new Error(
      `Step "${step}" is not valid for ${platform} platform. Valid steps: ${[...validSteps].join(', ')}`
    );
  }

  return {
    step,
    tier: rawOpts.tier as Tier,
    vertical: rawOpts.vertical as Vertical,
    env: rawOpts.env,
    platform,
    autoClose: rawOpts.autoClose,
  };
}

async function loadPayloads(vertical: Vertical) {
  switch (vertical) {
    case 'childcare':
      return import('./payloads/childcare.js');
    case 'seniorcare':
      return import('./payloads/seniorcare.js');
    case 'petcare':
      return import('./payloads/petcare.js');
    case 'housekeeping':
      return import('./payloads/housekeeping.js');
    case 'tutoring':
      return import('./payloads/tutoring.js');
    default:
      throw new Error(`Unsupported vertical: ${vertical}`);
  }
}

async function runWebFlow(opts: CliOptions, envConfig: typeof ENV_CONFIGS[string]): Promise<void> {
  const { runWebEnrollmentFlow } = await import('./steps/web-flow.js');
  const verticalConfig = VERTICAL_REGISTRY[opts.vertical];
  const payloads = await loadPayloads(opts.vertical);
  console.log(`\nStarting web enrollment → ${opts.step} (${opts.vertical})\n`);
  await runWebEnrollmentFlow(opts.step, opts.tier as Tier, envConfig, verticalConfig, payloads.providerCreateDefaults.serviceType, opts.autoClose);
}

async function runMobileFlow(opts: CliOptions, envConfig: typeof ENV_CONFIGS[string]): Promise<void> {
  const client = new ApiClient(envConfig.baseUrl, envConfig.apiKey);
  const payloads = await loadPayloads(opts.vertical);
  const verticalConfig = VERTICAL_REGISTRY[opts.vertical];

  const ctx: ProviderContext = {
    email: '',
    password: 'letmein1',
    memberId: '',
    authToken: '',
    tier: opts.tier as Tier,
    vertical: payloads.providerCreateDefaults.serviceType,
  };

  const steps = getStepsUpTo(opts.step, opts.platform);
  console.log(`\nCreating provider at step: ${opts.step} (mobile)\n`);

  for (const step of steps) {
    if (step.name !== 'account-created' && !ctx.accessToken) {
      console.log('  ⏳ Acquiring access token...');
      ctx.accessToken = await getAccessToken(ctx.email, envConfig.baseUrl);
      client.setAccessToken(ctx.accessToken);
    }

    try {
      await step.runner(client, ctx, payloads, envConfig, verticalConfig);
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

  console.log(`\n✓ Provider created at step: ${opts.step} (mobile)\n`);
  console.log(`  Email:      ${ctx.email}`);
  console.log(`  Password:   ${ctx.password}`);
  console.log(`  MemberId:   ${ctx.memberId}`);
  console.log(`  UUID:       ${ctx.uuid ?? '(set MYSQL_DB_PASS_DEV to retrieve)'}`);
  console.log(`  Vertical:   ${ctx.vertical}`);

  const mobileStepsWithAvailability: Step[] = [
    'at-availability', 'profile-complete', 'upgraded', 'at-disclosure', 'fully-enrolled',
  ];
  if (mobileStepsWithAvailability.includes(opts.step)) {
    console.log('');
    console.log('  ℹ Availability: Full-time preference is set. Detailed day/time schedule');
    console.log('    is not visible in "Your Services & Availability" on first login.');
    console.log('    Tap "Edit" > save once in the app to populate the calendar view.');
  }
  console.log('');
}

async function run(opts: CliOptions): Promise<void> {
  const envConfig = ENV_CONFIGS[opts.env];
  if (!envConfig) {
    throw new Error(`Unknown environment: ${opts.env}`);
  }

  if (opts.platform === 'web') {
    await runWebFlow(opts, envConfig);
  } else {
    if (!envConfig.apiKey) {
      throw new Error('CZEN_API_KEY environment variable is required');
    }
    await runMobileFlow(opts, envConfig);
  }
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
