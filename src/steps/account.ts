import { nanoid } from 'nanoid';
import mysql from 'mysql2/promise';
import type { ApiClient } from '../api/client.js';
import type { ProviderContext, EnvConfig } from '../types.js';
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
