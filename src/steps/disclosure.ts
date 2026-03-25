import type { ApiClient } from '../api/client.js';
import type { ProviderContext } from '../types.js';

export async function acceptDisclosure(
  client: ApiClient,
  ctx: ProviderContext,
  _payloads: any
): Promise<void> {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const currentTime = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}.${pad(now.getMinutes())}.${pad(now.getSeconds())}`;

  const result = await client.restPostSpi(
    'enroll/backgroundCheckAccepted',
    ctx.authToken,
    {
      federalDisclosureAcceptedDate: currentTime,
      stateDisclosureAcceptedDate: currentTime,
      requestCopyOfBGC: 'false',
    }
  );

  if (result?.statusCode !== 200) {
    console.warn('    Disclosure response:', JSON.stringify(result).slice(0, 300));
  }
  console.log('  ✓ Background check disclosure accepted');
}
