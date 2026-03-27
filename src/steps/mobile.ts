import type { ApiClient } from '../api/client.js';
import type { ProviderContext, EnvConfig } from '../types.js';
import type { VerticalConfig } from '../verticals.js';
import type { RunEmitter } from '../tui/emitter.js';
import { setupPayment, screeningUpgradeRest } from './upgrade.js';
import { acceptDisclosure } from './disclosure.js';
import { submitSsnTrace, createSitterBgCheck, completeBgc } from './enrollment.js';
import { getVantivPPRID } from './upgrade.js';
import { uploadPhoto } from './photo.js';
import {
  SAVE_MULTIPLE_VERTICAL,
  CAREGIVER_ATTRIBUTES_UPDATE,
  SET_PROVIDER_UNIVERSAL_AVAILABILITY,
  GET_MEMBER_IDS,
  UPDATE_PROVIDER_AVAILABILITY_PREFERENCE,
  ACKNOWLEDGE_AVAILABILITY,
} from '../api/graphql.js';

export async function mobilePreAvailability(
  client: ApiClient,
  ctx: ProviderContext,
  payloads: any,
  _envConfig?: EnvConfig,
  _verticalConfig?: VerticalConfig,
  emitter?: RunEmitter
): Promise<void> {
  await client.retryRequest(
    () =>
      client.graphql(SAVE_MULTIPLE_VERTICAL, {
        input: payloads.saveMultipleVerticalsInput,
      }),
    3,
    'Save multiple verticals'
  );

  await client.retryRequest(
    () =>
      client.graphql(CAREGIVER_ATTRIBUTES_UPDATE, {
        input: payloads.caregiverAttributesUpdateInput,
      }),
    3,
    'Caregiver attributes update'
  );

  console.log('  ✓ Profile set (verticals + attributes)');
  emitter?.info('Profile set (verticals + attributes)');
}

export async function mobileCompleteProfile(
  client: ApiClient,
  ctx: ProviderContext,
  payloads: any,
  _envConfig?: EnvConfig,
  _verticalConfig?: VerticalConfig,
  emitter?: RunEmitter
): Promise<void> {
  await client.restPostSpi('enroll/update/attribute', ctx.authToken, payloads.mobilePreferencesInput);
  console.log('  ✓ Enrollment PREFERENCES set');
  emitter?.info('Enrollment PREFERENCES set');

  await addAvailability(client, ctx, payloads, emitter);

  await client.retryRequest(
    () =>
      client.graphql(SET_PROVIDER_UNIVERSAL_AVAILABILITY, {
        input: payloads.providerUniversalAvailabilityInput,
      }),
    3,
    'Set provider universal availability'
  );
  console.log('  ✓ Universal availability set');
  emitter?.info('Universal availability set');

  await client.restPostSpi('enroll/update/attribute', ctx.authToken, payloads.mobileSkillsInput);
  console.log('  ✓ Enrollment SKILLS set');
  emitter?.info('Enrollment SKILLS set');

  const bioResult = await client.restPostSpi('enroll/update/bio', ctx.authToken, payloads.mobileBioInput);
  console.log('  ✓ Enrollment Bio set');
  emitter?.info('Enrollment Bio set');

  await uploadPhoto(client, ctx);

  console.log('  ✓ Profile complete');
  emitter?.info('Profile complete');
}

async function addAvailability(
  client: ApiClient,
  ctx: ProviderContext,
  payloads: any,
  emitter?: RunEmitter
): Promise<void> {
  const today = new Date();
  const end = new Date(today);
  end.setDate(end.getDate() + 7);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const payload = {
    startDateInLocal: fmt(today),
    endDateInLocal: fmt(end),
    additionalNotes: payloads.availabilityNotes ?? 'Available for work',
    currentSearchStatus: 'LOOKING',
    jobInterests: [
      { interestType: 'ONE_TIME', interestDetails: { min: '5', max: '10', unitType: 'PER_JOB', source: 'enrollment' }, status: 'ACTIVE' },
      { interestType: 'RECURRING', interestDetails: { min: '5', max: '10', unitType: 'PER_WEEK', source: 'enrollment' }, status: 'ACTIVE' },
    ],
    providerGeneralSchedule: {
      providerSchedule: {
        availabilityDayList: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'].map(day => ({
          dayOfWeek: day,
          timeSlotList: [{ startTime: '09:00:00', endTime: '17:00:00' }],
        })),
      },
      autoExtendSchedule: true,
    },
  };

  const result = await client.restPostSpi(
    `provider/${ctx.memberId}/availability`,
    ctx.authToken,
    payload,
    'json'
  );

  if (result?.statusCode !== 200) {
    throw new Error(`Availability set failed: ${JSON.stringify(result).slice(0, 300)}`);
  }
  console.log('  ✓ REST availability set (Mon-Fri 9am-5pm)');
  emitter?.info('REST availability set (Mon-Fri 9am-5pm)');

  const idsResult: any = await client.graphql(GET_MEMBER_IDS, {
    ids: [ctx.memberId],
    idType: 'MEMBER_ID',
  });
  const uuid: string | undefined = idsResult?.getMemberIds?.[0]?.uuid;
  if (!uuid) {
    console.warn('  ⚠ Could not resolve member UUID – skipping GraphQL availability mutations');
    return;
  }

  await client.retryRequest(
    () => client.graphql(UPDATE_PROVIDER_AVAILABILITY_PREFERENCE, {
      input: { providerId: uuid, jobType: 'FULL_TIME', overnight: false },
    }),
    3,
    'UpdateProviderAvailabilityPreference'
  );
  console.log('  ✓ Availability preference set (FULL_TIME)');
  emitter?.info('Availability preference set (FULL_TIME)');

  await client.retryRequest(
    () => client.graphql(ACKNOWLEDGE_AVAILABILITY, {
      input: { providerId: uuid },
    }),
    3,
    'AcknowledgeAvailability'
  );
  console.log('  ✓ Availability acknowledged');
  emitter?.info('Availability acknowledged');
}

export async function mobileUpgrade(
  client: ApiClient,
  ctx: ProviderContext,
  payloads: any,
  _envConfig?: EnvConfig,
  _verticalConfig?: VerticalConfig,
  _emitter?: RunEmitter
): Promise<void> {
  await acceptDisclosure(client, ctx, payloads);
  await setupPayment(client, ctx, payloads);
  await screeningUpgradeRest(client, ctx, payloads);
}

export async function mobileFullyEnrolled(
  client: ApiClient,
  ctx: ProviderContext,
  payloads: any,
  envConfig?: EnvConfig,
  _verticalConfig?: VerticalConfig,
  emitter?: RunEmitter
): Promise<void> {
  await submitSsnTrace(client, ctx, payloads);

  const infoCheck = await client.restGetSpi('infoVerification/check', ctx.authToken);
  console.log('    infoVerification/check:', JSON.stringify(infoCheck).slice(0, 300));
  emitter?.info(`infoVerification/check: ${JSON.stringify(infoCheck).slice(0, 300)}`);

  await client.restGetSpi('backgroundcheck/sitter/options', ctx.authToken);
  await client.restGetSpi('creditCard/subscription/profile', ctx.authToken);
  await client.restGetSpi('orderSummary/details/display?planFee=59&bgcType=ENHANCED', ctx.authToken);
  await client.restGetSpi('provider/showStateBGCDisclosure', ctx.authToken);
  console.log('  ✓ BGC pre-requisite endpoints called');
  emitter?.info('BGC pre-requisite endpoints called');

  const pprid = await getVantivPPRID();
  await createSitterBgCheck(client, ctx, payloads, pprid);

  await completeBgc(client, ctx, payloads, envConfig);
  console.log('  ✓ Fully enrolled');
  emitter?.info('Fully enrolled');
}
