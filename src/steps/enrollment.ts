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

export async function submitSsnTrace(
  client: ApiClient,
  ctx: ProviderContext,
  payloads: any
): Promise<void> {
  const featureRes = await client.restGetSpi(
    'util/feature/ssnCheck',
    ctx.authToken
  );
  console.log('    SSN feature check:', JSON.stringify(featureRes).slice(0, 200));

  const acct1 = await client.restPostSpi(
    'provider/ssnCheck/updateAccount',
    ctx.authToken,
    payloads.legalInfoInput,
    'json'
  );
  console.log('    Legal info update:', JSON.stringify(acct1).slice(0, 200));

  const acct2 = await client.restPostSpi(
    'provider/ssnCheck/updateAccount',
    ctx.authToken,
    payloads.legalAddressInput,
    'json'
  );
  console.log('    Address update:', JSON.stringify(acct2).slice(0, 200));

  const ssnRes = await client.restPostSpi(
    'infoVerification/ssnTrace',
    ctx.authToken,
    payloads.ssnInput,
    'json'
  );
  console.log('    SSN trace:', JSON.stringify(ssnRes).slice(0, 200));

  await client.retryRequest(
    () =>
      client.graphql(NOTIFICATION_SETTING_CREATE, {
        input: payloads.notificationSettingCreateInput,
      }),
    3,
    'Notification setting create'
  );

  console.log('  ✓ SSN trace + legal info submitted');
}

export async function createSitterBgCheck(
  client: ApiClient,
  ctx: ProviderContext,
  payloads: any,
  pprid: string
): Promise<void> {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const dateTime = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}.${pad(now.getMinutes())}.${pad(now.getSeconds())}`;

  const ssn = payloads.ssnInput.ssn;

  const result = await client.restPostSpi(
    'backgroundcheck/sitter/createBackgroundCheck',
    ctx.authToken,
    {
      addressLine1: payloads.legalAddressInput.addressLine1,
      addressLine2: '',
      bgcType: 'ENHANCED',
      city: payloads.legalAddressInput.city,
      state: payloads.legalAddressInput.state,
      ZIP: payloads.legalAddressInput.zip,
      DOBDay: '26',
      DOBMonth: '07',
      DOBYear: '1995',
      firstName: 'Martina',
      firstNameOnCard: 'Martina',
      lastName: 'Goodram',
      lastNameOnCard: 'Goodram',
      middleName: '',
      maidenName: 'Goodram',
      driverLicenseNumber: '',
      ssn1: ssn.slice(0, 3),
      ssn2: ssn.slice(3, 5),
      ssn3: ssn.slice(5),
      retypeSsn1: ssn.slice(0, 3),
      retypeSsn2: ssn.slice(3, 5),
      retypeSsn3: ssn.slice(5),
      stateLicenseIssued: payloads.legalAddressInput.state,
      federalDisclosureAccepted: 'true',
      requestCopyOfBGC: 'false',
      stateDisclosureAccepted: 'false',
      providerInitiated: 'true',
      'attr-member.BGCPurchaseStateDisclosureDate': dateTime,
      creditCardFieldsRequired: 'false',
      billingZIP: payloads.legalAddressInput.zip,
      payPageResponseRegistrationId: pprid,
      lastFourDigits: '1111',
      firstSixDigits: '411111',
      usingVantivEprotectIframe: 'true',
      expirationMonth: '10',
      expirationYear: '30',
      cardType: 'Visa',
    }
  );

  if (result?.statusCode !== 200) {
    console.warn('    createSitterBGCheck response:', JSON.stringify(result).slice(0, 300));
    throw new Error(`createSitterBGCheck failed: ${JSON.stringify(result).slice(0, 300)}`);
  }
  console.log('  ✓ Background check created');
}

export async function createEligibilityCheck(
  client: ApiClient,
  ctx: ProviderContext
): Promise<void> {
  let eligibilityResponse: any;
  for (let attempt = 1; attempt <= 5; attempt++) {
    eligibilityResponse = await client.restGetSpi(
      `backgroundcheck/createEligibilityCheckForMember/${ctx.memberId}`,
      ctx.authToken
    );
    if (eligibilityResponse?.statusCode === 200) break;
    console.log(`    Eligibility attempt ${attempt}/5: ${JSON.stringify(eligibilityResponse).slice(0, 300)}`);
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  if (eligibilityResponse?.statusCode !== 200) {
    throw new Error(`Eligibility check failed after 5 attempts: ${JSON.stringify(eligibilityResponse).slice(0, 300)}`);
  }

  ctx._eligibilityResponse = eligibilityResponse;
  console.log('  ✓ Eligibility check created');
}

export async function runScreening(
  client: ApiClient,
  ctx: ProviderContext,
  payloads: any,
  envConfig?: EnvConfig
): Promise<void> {
  await submitSsnTrace(client, ctx, payloads);

  const infoCheck = await client.restGetSpi('infoVerification/check', ctx.authToken);
  console.log('    infoVerification/check:', JSON.stringify(infoCheck).slice(0, 300));

  await client.restGetSpi('backgroundcheck/sitter/options', ctx.authToken);
  await client.restGetSpi('creditCard/subscription/profile', ctx.authToken);
  console.log('  ✓ BGC pre-requisite endpoints called');

  const { getVantivPPRID } = await import('./upgrade.js');
  const pprid = await getVantivPPRID();
  await createSitterBgCheck(client, ctx, payloads, pprid);
}

export async function completeBgc(
  client: ApiClient,
  ctx: ProviderContext,
  payloads: any,
  envConfig?: EnvConfig
): Promise<void> {
  console.log('  ⏳ Waiting for screening to process...');

  if (!envConfig) {
    throw new Error('EnvConfig required for BGC completion (DB connection)');
  }

  const connection = await mysql.createConnection({
    host: envConfig.db.host,
    user: envConfig.db.user,
    password: envConfig.db.password,
    database: envConfig.db.database,
  });

  try {
    let screening: any = null;
    for (let attempt = 1; attempt <= 5; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      const [rows] = await connection.execute(GET_SCREENING_ID, [ctx.memberId]);
      screening = (rows as any[])[0];
      if (screening?.SCREENING_ID) break;
      screening = null;
      console.log(`    Retry ${attempt}/5 – screening ID not yet assigned...`);
    }

    if (!screening?.SCREENING_ID) {
      console.log('  ⚠ BGC submitted but SCREENING_ID not yet assigned (KENNECT processing pending)');
      console.log('    BGC clearance will happen asynchronously. Member is enrolled with pending BGC.');
      return;
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
        candidateId: screening.BRAVO_BGC_ID ?? ctx._eligibilityResponse?.data?.screeningId,
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
    if (sterlingResult?.success) {
      console.log('  ✓ Background check cleared (Sterling callback sent)');
    } else {
      console.warn('  ⚠ Sterling callback response:', JSON.stringify(sterlingResult));
    }
  } finally {
    await connection.end();
  }
}

export async function completeEnrollment(
  client: ApiClient,
  ctx: ProviderContext,
  payloads: any,
  envConfig?: EnvConfig
): Promise<void> {
  await runScreening(client, ctx, payloads, envConfig);
  await completeBgc(client, ctx, payloads, envConfig);
  console.log('  ✓ Fully enrolled');
}
