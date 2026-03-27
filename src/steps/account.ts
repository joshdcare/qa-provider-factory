import { nanoid } from 'nanoid';
import mysql from 'mysql2/promise';
import type { ApiClient } from '../api/client.js';
import type { ProviderContext, EnvConfig } from '../types.js';
import type { VerticalConfig } from '../verticals.js';
import { PROVIDER_CREATE } from '../api/graphql.js';

const GET_MEMBER_UUID = `
  SELECT BIN_TO_UUID(A.USER_UUID) AS UUID
  FROM AUTHENTICATION A
  JOIN MEMBER M ON M.AUTHENTICATION_ID = A.ID
  WHERE M.ID = ?
`;

export async function createAccount(
  client: ApiClient,
  ctx: ProviderContext,
  payloads: any,
  envConfig?: EnvConfig
): Promise<void> {
  const suffix = nanoid(6).toLowerCase();
  ctx.email = `prov-${suffix}@care.com`;
  ctx.password = 'letmein1';

  const input = {
    ...payloads.providerCreateDefaults,
    email: ctx.email,
    password: ctx.password,
  };

  const data = await client.retryRequest(
    () =>
      client.graphql<{ providerCreate: any }>(PROVIDER_CREATE, {
        submitValues: input,
      }),
    3,
    'Provider creation'
  );

  const result = data.providerCreate;
  if (!result.memberId) {
    throw new Error(
      `Provider creation failed: ${JSON.stringify(result.errors)}`
    );
  }

  ctx.memberId = result.memberId;
  ctx.authToken = result.authToken;

  if (envConfig?.db.password) {
    try {
      const connection = await mysql.createConnection({
        host: envConfig.db.host,
        user: envConfig.db.user,
        password: envConfig.db.password,
        database: envConfig.db.database,
      });
      try {
        const [rows] = await connection.execute(GET_MEMBER_UUID, [ctx.memberId]);
        const row = (rows as any[])[0];
        if (row?.UUID) {
          ctx.uuid = row.UUID;
        }
      } finally {
        await connection.end();
      }
    } catch (err) {
      console.warn(`  ⚠ Could not retrieve UUID (DB unavailable): ${(err as Error).message}`);
    }
  }

  console.log(`  ✓ Account created: ${ctx.email} (ID: ${ctx.memberId})`);
}

export async function createAccountMobile(
  client: ApiClient,
  ctx: ProviderContext,
  payloads: any,
  envConfig?: EnvConfig,
  verticalConfig?: VerticalConfig
): Promise<void> {
  const suffix = nanoid(6).toLowerCase();
  ctx.email = `prov-${suffix}@care.com`;
  ctx.password = 'letmein1';

  const liteResult = await client.restPostSpi(
    'enroll/lite',
    '',
    {
      firstName: payloads.providerNameUpdateInput.firstName,
      lastName: payloads.providerNameUpdateInput.lastName,
      email: ctx.email,
      password: ctx.password,
      primaryPhone: '2001004000',
      dateOfBirth: '1995-07-26T00:00',
      gender: 'F',
      memberInclination: 'SITTER',
      howDidYouHearAboutUs: 'HWDHABTUS005',
      legallyEligible: 'true',
    }
  );

  if (liteResult?.statusCode !== 200) {
    throw new Error(`enroll/lite failed: ${JSON.stringify(liteResult)}`);
  }

  ctx.authToken = liteResult.data?.auth?.authToken;
  ctx.memberId = String(liteResult.data?.enrollment?.memberId);

  const upgradeResult = await client.restPostSpi(
    'enroll/upgrade/provider',
    ctx.authToken,
    {
      addressLine1: payloads.p2pStripeAccountInput.addressLine1,
      city: payloads.p2pStripeAccountInput.city,
      state: payloads.p2pStripeAccountInput.state,
      zip: payloads.providerCreateDefaults.zipcode,
      serviceId: verticalConfig?.serviceId ?? 'CHILDCARE',
      subServiceId: verticalConfig?.subServiceId ?? 'babysitter',
    }
  );

  if (upgradeResult?.statusCode !== 200) {
    throw new Error(`enroll/upgrade/provider failed: ${JSON.stringify(upgradeResult)}`);
  }

  ctx.memberId = String(upgradeResult.data?.enrollment?.memberId ?? ctx.memberId);

  if (envConfig?.db.password) {
    try {
      const connection = await mysql.createConnection({
        host: envConfig.db.host,
        user: envConfig.db.user,
        password: envConfig.db.password,
        database: envConfig.db.database,
      });
      try {
        const [rows] = await connection.execute(GET_MEMBER_UUID, [ctx.memberId]);
        const row = (rows as any[])[0];
        if (row?.UUID) {
          ctx.uuid = row.UUID;
        }
      } finally {
        await connection.end();
      }
    } catch (err) {
      console.warn(`  ⚠ Could not retrieve UUID (DB unavailable): ${(err as Error).message}`);
    }
  }

  console.log(`  ✓ Account created (lite+upgrade): ${ctx.email} (ID: ${ctx.memberId})`);
}
