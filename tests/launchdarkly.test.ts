import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LDClient } from '../src/api/launchdarkly.js';

const BASE = 'https://app.launchdarkly.com/api/v2';
const PROJECT = 'test-project';

function mockJsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

describe('LDClient', () => {
  let fetchImpl: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchImpl = vi.fn();
  });

  describe('searchFlags', () => {
    it('returns flags with variations and fallthroughVariationId', async () => {
      fetchImpl.mockResolvedValueOnce(
        mockJsonResponse({
          items: [
            {
              key: 'flag-a',
              name: 'Flag A',
              variations: [
                { _id: 'v1', name: 'control', value: 'control' },
                { _id: 'v2', name: 'test', value: 'test' },
              ],
              environments: {
                dev: { on: true, fallthrough: { variation: 1 } },
              },
            },
          ],
        })
      );

      const client = new LDClient('api-token', PROJECT, fetchImpl);
      const flags = await client.searchFlags('q', 'dev');

      expect(flags[0]).toEqual({
        key: 'flag-a',
        name: 'Flag A',
        on: true,
        variations: [
          { id: 'v1', name: 'control', value: 'control' },
          { id: 'v2', name: 'test', value: 'test' },
        ],
        fallthroughVariationId: 'v2',
      });
    });

    it('sets fallthroughVariationId to null for rollout-based fallthrough', async () => {
      fetchImpl.mockResolvedValueOnce(
        mockJsonResponse({
          items: [
            {
              key: 'flag-r',
              name: 'Rollout Flag',
              variations: [
                { _id: 'v1', name: 'off', value: false },
                { _id: 'v2', name: 'on', value: true },
              ],
              environments: {
                dev: {
                  on: true,
                  fallthrough: {
                    rollout: { variations: [{ variation: 0, weight: 50000 }, { variation: 1, weight: 50000 }] },
                  },
                },
              },
            },
          ],
        })
      );

      const client = new LDClient('api-token', PROJECT, fetchImpl);
      const flags = await client.searchFlags('q', 'dev');

      expect(flags[0].fallthroughVariationId).toBeNull();
    });

    it('omits filter when query is empty', async () => {
      fetchImpl.mockResolvedValueOnce(mockJsonResponse({ items: [] }));

      const client = new LDClient('api-token', PROJECT, fetchImpl);
      await client.searchFlags('', 'dev');

      const url = new URL(fetchImpl.mock.calls[0][0] as string);
      expect(url.searchParams.has('filter')).toBe(false);
    });

    it('throws on API error (401)', async () => {
      fetchImpl.mockResolvedValueOnce(
        mockJsonResponse({ message: 'Unauthorized' }, { status: 401 })
      );

      const client = new LDClient('bad-token', PROJECT, fetchImpl);
      await expect(client.searchFlags('q', 'dev')).rejects.toThrow(
        'LaunchDarkly API error (401): Unauthorized'
      );
    });
  });

  describe('toggleFlag', () => {
    it('sends correct PATCH body and returns updated flag', async () => {
      const flagKey = 'my-feature';
      const updated = {
        key: flagKey,
        name: 'My Feature',
        variations: [
          { _id: 'v1', name: 'off', value: false },
          { _id: 'v2', name: 'on', value: true },
        ],
        environments: {
          stg: { on: true, fallthrough: { variation: 0 } },
        },
      };
      fetchImpl.mockResolvedValueOnce(mockJsonResponse(updated));

      const client = new LDClient('api-token', PROJECT, fetchImpl);
      const result = await client.toggleFlag(flagKey, 'stg', true);

      expect(result).toEqual({
        key: flagKey,
        name: 'My Feature',
        on: true,
        variations: [
          { id: 'v1', name: 'off', value: false },
          { id: 'v2', name: 'on', value: true },
        ],
        fallthroughVariationId: 'v1',
      });

      expect(fetchImpl).toHaveBeenCalledTimes(1);
      const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE}/flags/${PROJECT}/${flagKey}`);
      expect(init.method).toBe('PATCH');
      expect(init.headers).toMatchObject({
        Authorization: 'api-token',
        'Content-Type':
          'application/json; domain-model=launchdarkly.semanticpatch',
      });
      expect(JSON.parse(init.body as string)).toEqual({
        environmentKey: 'stg',
        instructions: [{ kind: 'turnFlagOn' }],
      });
    });

    it('rejects production environment and does not call fetch', async () => {
      const client = new LDClient('api-token', PROJECT, fetchImpl);
      await expect(
        client.toggleFlag('flag-x', 'prod' as never, true)
      ).rejects.toThrow(/not allowed/i);

      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('throws on API error (429)', async () => {
      fetchImpl.mockResolvedValueOnce(
        mockJsonResponse({ message: 'Too Many Requests' }, { status: 429 })
      );

      const client = new LDClient('api-token', PROJECT, fetchImpl);
      await expect(client.toggleFlag('flag-y', 'dev', false)).rejects.toThrow(
        'LaunchDarkly API error (429): Too Many Requests'
      );
    });
  });

  describe('setFallthroughVariation', () => {
    it('sends correct semantic patch and returns updated flag', async () => {
      const updated = {
        key: 'my-flag',
        name: 'My Flag',
        variations: [
          { _id: 'v1', name: 'control', value: 'control' },
          { _id: 'v2', name: 'test', value: 'test' },
        ],
        environments: {
          dev: { on: true, fallthrough: { variation: 1 } },
        },
      };
      fetchImpl.mockResolvedValueOnce(mockJsonResponse(updated));

      const client = new LDClient('api-token', PROJECT, fetchImpl);
      const result = await client.setFallthroughVariation('my-flag', 'dev', 'v2');

      expect(result.fallthroughVariationId).toBe('v2');

      const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE}/flags/${PROJECT}/my-flag`);
      expect(init.method).toBe('PATCH');
      expect(init.headers).toMatchObject({
        'Content-Type': 'application/json; domain-model=launchdarkly.semanticpatch',
      });
      expect(JSON.parse(init.body as string)).toEqual({
        environmentKey: 'dev',
        instructions: [{ kind: 'updateFallthroughVariationOrRollout', variationId: 'v2' }],
      });
    });

    it('rejects unknown environment', async () => {
      const client = new LDClient('api-token', PROJECT, fetchImpl);
      await expect(
        client.setFallthroughVariation('flag', 'prod' as never, 'v1')
      ).rejects.toThrow(/not allowed/i);
      expect(fetchImpl).not.toHaveBeenCalled();
    });
  });

});
