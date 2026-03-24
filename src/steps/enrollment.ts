import mysql from 'mysql2/promise';
import type { ApiClient } from '../api/client.js';
import type { ProviderContext, EnvConfig } from '../types.js';
import { NOTIFICATION_SETTING_CREATE } from '../api/graphql.js';

const GET_SCREENING_ID = `
  SELECT BCE.SCREENING_ID, BCE.PACKAGE_ID,
    LOWER(INSERT(INSERT(INSERT(INSERT(HEX(BCE.BRAVO_BACKGROUND_CHECK_ID), 9, 0, '-'), 14, 0, '-'), 19, 0, '-'), 24, 0, '-')) AS BRAVO_BGC_ID
  FROM BACKGROUND_CHECK BC, BACKGROUND_CHECK_EXECUTION BCE
  WHERE BC.ID = BCE.BACKGROUND_CHECK_ID AND BC.MEMBER_ID = ?
`;

export async function completeEnrollment(
  client: ApiClient,
  ctx: ProviderContext,
  payloads: any,
  envConfig?: EnvConfig
): Promise<void> {
  await client.restGet(
    '/platform/spi/util/feature/ssnCheck',
    ctx.authToken
  );

  await client.restPost(
    '/platform/spi/provider/ssnCheck/updateAccount',
    ctx.authToken,
    payloads.legalInfoInput,
    'json'
  );

  await client.restPost(
    '/platform/spi/provider/ssnCheck/updateAccount',
    ctx.authToken,
    payloads.legalAddressInput,
    'json'
  );

  await client.restPost(
    '/platform/spi/infoVerification/ssnTrace',
    ctx.authToken,
    payloads.ssnInput,
    'json'
  );

  await client.retryRequest(
    () =>
      client.graphql(NOTIFICATION_SETTING_CREATE, {
        input: payloads.notificationSettingCreateInput,
      }),
    3,
    'Notification setting create'
  );

  const eligibilityResponse = await client.restGet(
    `/platform/spi/backgroundcheck/createEligibilityCheckForMember/${ctx.memberId}`,
    ctx.authToken,
    {
      'X-Care.com-OS': 'Android',
      'X-Care.com-AppVersion': '19.2',
      'X-Care.com-AppBuildNr': '8000',
    }
  );

  console.log('  ✓ Eligibility check created, waiting for processing...');
  await new Promise((resolve) => setTimeout(resolve, 4000));

  if (!envConfig) {
    throw new Error('EnvConfig required for fully-enrolled step (DB connection)');
  }

  const connection = await mysql.createConnection({
    host: envConfig.db.host,
    user: envConfig.db.user,
    password: envConfig.db.password,
    database: envConfig.db.database,
  });

  try {
    const [rows] = await connection.execute(GET_SCREENING_ID, [ctx.memberId]);
    const screening = (rows as any[])[0];
    if (!screening) {
      throw new Error(`No screening record found for member ${ctx.memberId}`);
    }

    const now = new Date().toISOString();
    const sterlingPayload = {
      type: 'screening',
      payload: {
        id: screening.SCREENING_ID,
        packageId: screening.PACKAGE_ID,
        packageName: 'Preliminary Member Check',
        accountName: 'Care.com',
        accountId: '82704',
        billCode: '',
        jobPosition: 'Preliminary Member Check',
        candidateId: screening.BRAVO_BGC_ID ?? eligibilityResponse?.data?.screeningId,
        status: 'Complete',
        result: 'Clear',
        links: {
          admin: {
            web: 'https://qasecure.sterlingdirect.com/gateway/OneClick.aspx',
          },
        },
        reportItems: [
          {
            id: '17631573',
            type: 'Enhanced Nationwide Criminal Search',
            status: 'Complete',
            result: 'Clear',
            updatedAt: now,
            estimatedCompletionTime: now,
          },
          {
            id: '17631574',
            type: 'DOJ Sex Offender Search',
            status: 'Complete',
            result: 'Clear',
            updatedAt: now,
            estimatedCompletionTime: now,
          },
        ],
        submittedAt: now,
        updatedAt: now,
      },
    };

    const sterlingRes = await fetch(
      `${envConfig.sterlingCallbackUrl}/updateExecution`,
      {
        method: 'POST',
        headers: {
          Authorization: 'Basic QXBpVXNlckNhcmU6U3RlcmxpbmcyMDIwIQ==',
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(sterlingPayload),
      }
    );
    const sterlingResult = await sterlingRes.json();
    if (!sterlingResult?.success) {
      console.warn('Sterling callback may not have succeeded:', sterlingResult);
    }
  } finally {
    await connection.end();
  }

  console.log('  ✓ Fully enrolled (background check cleared)');
}
