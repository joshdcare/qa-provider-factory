import { LD_ENV_MAP, type Env } from '../types.js';

const LD_API_BASE = 'https://app.launchdarkly.com/api/v2';

export interface LDVariation {
  id: string;
  name?: string;
  value: unknown;
}

export interface LDFlag {
  key: string;
  name: string;
  on: boolean;
  variations: LDVariation[];
  fallthroughVariationId: string | null;
}

type FetchImpl = typeof fetch;

function getErrorMessage(status: number, bodyText: string): string {
  try {
    const parsed = JSON.parse(bodyText) as { message?: string };
    if (parsed.message) return parsed.message;
  } catch {
    // ignore
  }
  return bodyText || `HTTP ${status}`;
}

async function throwIfNotOk(res: Response): Promise<void> {
  if (res.ok) return;
  const text = await res.text();
  const message = getErrorMessage(res.status, text);
  throw new Error(`LaunchDarkly API error (${res.status}): ${message}`);
}

function mapItemToFlag(
  item: {
    key: string;
    name: string;
    variations?: Array<{ _id: string; name?: string; value: unknown }>;
    environments?: Record<string, { on?: boolean; fallthrough?: { variation?: number; rollout?: unknown } }>;
  },
  envKey: string
): LDFlag {
  const envData = item.environments?.[envKey];
  const on = envData?.on ?? false;

  const variations: LDVariation[] = (item.variations ?? []).map(v => ({
    id: v._id,
    name: v.name,
    value: v.value,
  }));

  let fallthroughVariationId: string | null = null;
  const ft = envData?.fallthrough;
  if (ft && typeof ft.variation === 'number' && variations[ft.variation]) {
    fallthroughVariationId = variations[ft.variation].id;
  }

  return { key: item.key, name: item.name, on, variations, fallthroughVariationId };
}

export class LDClient {
  constructor(
    private readonly token: string,
    private readonly projectKey: string,
    private readonly defaultFetch: FetchImpl = globalThis.fetch.bind(globalThis)
  ) {}

  async searchFlags(
    query: string,
    ldEnv: Env,
    fetchImpl: FetchImpl = this.defaultFetch
  ): Promise<LDFlag[]> {
    const envKey = LD_ENV_MAP[ldEnv];
    const url = new URL(`${LD_API_BASE}/flags/${encodeURIComponent(this.projectKey)}`);
    url.searchParams.set('env', envKey);
    if (query !== '') {
      url.searchParams.set('filter', `query:${query}`);
    }
    url.searchParams.set('limit', '20');
    url.searchParams.set('sort', 'name');

    const res = await fetchImpl(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: this.token,
      },
    });

    await throwIfNotOk(res);
    const data = (await res.json()) as { items?: Array<Record<string, unknown>> };
    const items = data.items ?? [];
    return items.map((item) =>
      mapItemToFlag(
        item as {
          key: string;
          name: string;
          variations?: Array<{ _id: string; name?: string; value: unknown }>;
          environments?: Record<string, { on?: boolean; fallthrough?: { variation?: number; rollout?: unknown } }>;
        },
        envKey
      )
    );
  }

  async toggleFlag(
    flagKey: string,
    ldEnv: string,
    newState: boolean,
    fetchImpl: FetchImpl = this.defaultFetch
  ): Promise<LDFlag> {
    if (!(ldEnv in LD_ENV_MAP)) {
      throw new Error('Toggling in that environment is not allowed');
    }
    const envKey = LD_ENV_MAP[ldEnv as Env];
    const url = `${LD_API_BASE}/flags/${encodeURIComponent(this.projectKey)}/${encodeURIComponent(flagKey)}`;
    const body = JSON.stringify({
      environmentKey: envKey,
      instructions: [{ kind: newState ? 'turnFlagOn' : 'turnFlagOff' }],
    });

    const res = await fetchImpl(url, {
      method: 'PATCH',
      headers: {
        Authorization: this.token,
        'Content-Type': 'application/json; domain-model=launchdarkly.semanticpatch',
      },
      body,
    });

    await throwIfNotOk(res);
    const item = (await res.json()) as {
      key: string;
      name: string;
      variations?: Array<{ _id: string; name?: string; value: unknown }>;
      environments?: Record<string, { on?: boolean; fallthrough?: { variation?: number; rollout?: unknown } }>;
    };
    return mapItemToFlag(item, envKey);
  }

  async setFallthroughVariation(
    flagKey: string,
    ldEnv: string,
    variationId: string,
    fetchImpl: FetchImpl = this.defaultFetch
  ): Promise<LDFlag> {
    if (!(ldEnv in LD_ENV_MAP)) {
      throw new Error('Toggling in that environment is not allowed');
    }
    const envKey = LD_ENV_MAP[ldEnv as Env];
    const url = `${LD_API_BASE}/flags/${encodeURIComponent(this.projectKey)}/${encodeURIComponent(flagKey)}`;
    const body = JSON.stringify({
      environmentKey: envKey,
      instructions: [{ kind: 'updateFallthroughVariationOrRollout', variationId }],
    });

    const res = await fetchImpl(url, {
      method: 'PATCH',
      headers: {
        Authorization: this.token,
        'Content-Type': 'application/json; domain-model=launchdarkly.semanticpatch',
      },
      body,
    });

    await throwIfNotOk(res);
    const item = (await res.json()) as {
      key: string;
      name: string;
      variations?: Array<{ _id: string; name?: string; value: unknown }>;
      environments?: Record<string, { on?: boolean; fallthrough?: { variation?: number; rollout?: unknown } }>;
    };
    return mapItemToFlag(item, envKey);
  }

}
