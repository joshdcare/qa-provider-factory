#!/usr/bin/env node
import 'dotenv/config';
import { Command, CommanderError } from 'commander';
import { ALL_STEPS, WEB_STEPS, MOBILE_STEPS, ENV_CONFIGS } from './types.js';
import type { Step, Tier, Vertical, Platform, CliOptions, ProviderContext } from './types.js';
import { ApiClient } from './api/client.js';
import { getAccessToken } from './api/auth.js';
import { getStepsUpTo } from './steps/registry.js';
import { VERTICAL_REGISTRY } from './verticals.js';

const BANNER = 'QA Provider Factory — create test providers at enrollment checkpoints.';

function createEnrollmentCommand(): Command {
  const cmd = new Command('run');
  cmd
    .requiredOption(
      '--step <step>',
      `Enrollment checkpoint (see steps below)`,
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
    .option('--tier <tier>', 'Subscription tier (basic, premium)', 'premium')
    .option(
      '--vertical <vertical>',
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
    .option('--platform <platform>', 'Target platform (web, mobile)', 'web')
    .option('--env <env>', 'Target environment', 'dev')
    .option('--no-auto-close', 'Keep browser open after logging credentials (web only)')
    .addHelpText('after', `
Steps by platform:

  Web (--platform web):
${[...WEB_STEPS].map(s => `    ${s}`).join('\n')}

  Mobile (--platform mobile):
${[...MOBILE_STEPS].map(s => `    ${s}`).join('\n')}

Examples:
  $ jumper --step at-location --platform web
  $ jumper --step at-availability --platform mobile
  $ jumper --step fully-enrolled --platform mobile --tier basic
`);
  return cmd;
}

function createRootProgram(): Command {
  const program = new Command();
  program.name('jumper');
  program
    .command('start')
    .description('Launch interactive TUI for guided enrollment')
    .action(async () => {
      const { render } = await import('ink');
      const React = await import('react');
      const { App } = await import('./tui/app.js');
      render(React.createElement(App));
    });
  program.addCommand(createEnrollmentCommand(), { isDefault: true, hidden: true });
  return program;
}

export function parseArgs(argv: string[]): CliOptions {
  const program = new Command();
  program.exitOverride();
  program.addCommand(createEnrollmentCommand(), { isDefault: true, hidden: true });
  program.parse(argv, { from: 'user' });
  const enroll = program.commands.find((c) => c.name() === 'run');
  if (!enroll) {
    throw new Error('internal: enrollment command missing');
  }
  const opts = enroll.opts() as CliOptions;

  const validPlatforms = ['web', 'mobile'];
  if (!validPlatforms.includes(opts.platform)) {
    throw new Error(`Invalid platform "${opts.platform}". Valid: ${validPlatforms.join(', ')}`);
  }

  const validSteps = opts.platform === 'mobile' ? MOBILE_STEPS : WEB_STEPS;
  if (!(validSteps as readonly Step[]).includes(opts.step)) {
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

async function runInteractiveCli(argv: string[]): Promise<void> {
  const program = createRootProgram();
  program.exitOverride();
  await program.parseAsync(argv, { from: 'user' });
}

const scriptPath = process.argv[1] ?? '';
const isMainModule = scriptPath.includes('index') || scriptPath.endsWith('jumper');
if (isMainModule) {
  const argv = process.argv.slice(2);
  if (process.argv.length <= 2) {
    console.log(BANNER);
    console.log('  Run `jumper start` for guided mode.\n');
  }
  if (argv[0] === 'start') {
    runInteractiveCli(argv).catch((err) => {
      if (err instanceof CommanderError) {
        process.exit(err.exitCode);
      }
      console.error('Fatal error:', (err as Error).message);
      process.exit(1);
    });
  } else {
    try {
      const opts = parseArgs(argv);
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
}
