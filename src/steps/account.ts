import { nanoid } from 'nanoid';
import type { ApiClient } from '../api/client.js';
import type { ProviderContext } from '../types.js';
import { PROVIDER_CREATE } from '../api/graphql.js';

export async function createAccount(
  client: ApiClient,
  ctx: ProviderContext,
  payloads: any
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
  console.log(`  ✓ Account created: ${ctx.email} (ID: ${ctx.memberId})`);
}
