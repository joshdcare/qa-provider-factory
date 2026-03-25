import type { ApiClient } from '../api/client.js';
import type { ProviderContext } from '../types.js';
import { uploadPhoto } from './photo.js';
import {
  PROVIDER_NAME_UPDATE,
  SAVE_MULTIPLE_VERTICAL,
  CAREGIVER_ATTRIBUTES_UPDATE,
  PROVIDER_JOB_INTEREST_UPDATE,
  UNIVERSAL_PROVIDER_ATTRIBUTES_UPDATE,
  SET_PROVIDER_UNIVERSAL_AVAILABILITY,
  CAREGIVER_SERVICE_BIOGRAPHY_UPDATE,
  GET_MEMBER_IDS,
  UPDATE_PROVIDER_AVAILABILITY_PREFERENCE,
  ACKNOWLEDGE_AVAILABILITY,
} from '../api/graphql.js';

export async function setupProfile(
  client: ApiClient,
  ctx: ProviderContext,
  payloads: any
): Promise<void> {
  await client.retryRequest(
    () =>
      client.graphql(PROVIDER_NAME_UPDATE, {
        input: payloads.providerNameUpdateInput,
      }),
    3,
    'Provider name update'
  );

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

  await client.retryRequest(
    () =>
      client.graphql(PROVIDER_JOB_INTEREST_UPDATE, {
        input: payloads.providerJobInterestUpdateInput,
      }),
    3,
    'Provider job interest update'
  );

  console.log('  ✓ Profile set up (availability not set)');
}

export async function completeProfile(
  client: ApiClient,
  ctx: ProviderContext,
  payloads: any
): Promise<void> {
  await client.retryRequest(
    () =>
      client.graphql(UNIVERSAL_PROVIDER_ATTRIBUTES_UPDATE, {
        input: payloads.universalProviderAttributesUpdateInput,
      }),
    3,
    'Universal provider attributes update'
  );

  await client.retryRequest(
    () =>
      client.graphql(SET_PROVIDER_UNIVERSAL_AVAILABILITY, {
        input: payloads.providerUniversalAvailabilityInput,
      }),
    3,
    'Set provider availability'
  );

  const idsResult: any = await client.graphql(GET_MEMBER_IDS, {
    ids: [ctx.memberId],
    idType: 'MEMBER_ID',
  });
  const uuid: string | undefined = idsResult?.getMemberIds?.[0]?.uuid;
  if (uuid) {
    await client.retryRequest(
      () => client.graphql(UPDATE_PROVIDER_AVAILABILITY_PREFERENCE, {
        input: { providerId: uuid, jobType: 'FULL_TIME', overnight: false },
      }),
      3,
      'UpdateProviderAvailabilityPreference'
    );

    await client.retryRequest(
      () => client.graphql(ACKNOWLEDGE_AVAILABILITY, {
        input: { providerId: uuid },
      }),
      3,
      'AcknowledgeAvailability'
    );
    console.log('  ✓ Availability preference (FULL_TIME) + acknowledged');
  } else {
    console.warn('  ⚠ Could not resolve UUID – availability acknowledgment skipped');
  }

  await client.retryRequest(
    () =>
      client.graphql(CAREGIVER_SERVICE_BIOGRAPHY_UPDATE, {
        input: payloads.providerBiographyInput,
      }),
    3,
    'Caregiver biography update'
  );

  await client.retryRequest(
    () =>
      client.graphql(CAREGIVER_ATTRIBUTES_UPDATE, {
        input: payloads.caregiverAttributesSecondUpdateInput,
      }),
    3,
    'Caregiver attributes second update'
  );

  console.log('  ✓ Profile complete (availability + biography set)');
}

export async function webCompleteProfile(
  client: ApiClient,
  ctx: ProviderContext,
  payloads: any
): Promise<void> {
  await setupProfile(client, ctx, payloads);
  await completeProfile(client, ctx, payloads);
  await uploadPhoto(client, ctx);
}
