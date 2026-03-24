import type { ApiClient } from '../api/client.js';
import type { ProviderContext } from '../types.js';

export async function acceptDisclosure(
  client: ApiClient,
  ctx: ProviderContext,
  _payloads: any
): Promise<void> {
  const now = new Date().toISOString();
  const currentTime = `${now.split('T')[0]} ${now.split('T')[1].split('.')[0]}`;

  await client.restPost(
    '/platform/spi/enroll/backgroundCheckAccepted',
    ctx.authToken,
    {
      federalDisclosureAcceptedDate: currentTime,
      requestCopyOfBGC: 'false',
    },
    'form'
  );

  console.log('  ✓ Background check disclosure accepted');
}
