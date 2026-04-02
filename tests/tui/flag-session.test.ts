import { describe, it, expect, beforeEach, vi } from 'vitest';

const revertFlagMock = vi.fn();

vi.mock('../../src/api/launchdarkly.js', () => ({
  LDClient: class {
    revertFlag = revertFlagMock;
  },
}));

import {
  recordSnapshot,
  hasSessionToggles,
  getSessionToggleCount,
  getSessionToggleEntries,
  revertSessionToggles,
} from '../../src/tui/flag-session.js';

describe('flag-session', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const origToken = process.env.LD_API_TOKEN;
    const origProject = process.env.LD_PROJECT_KEY;
    delete process.env.LD_API_TOKEN;
    delete process.env.LD_PROJECT_KEY;
    return revertSessionToggles().then(() => {
      process.env.LD_API_TOKEN = origToken;
      process.env.LD_PROJECT_KEY = origProject;
    });
  });

  it('records first snapshot and ignores subsequent calls for same key', () => {
    recordSnapshot('flag-a', true, 'v1', 'dev');
    recordSnapshot('flag-a', false, 'v2', 'dev');

    const entries = getSessionToggleEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({
      key: 'flag-a',
      originalOn: true,
      originalFallthroughId: 'v1',
      originalFallthroughRollout: null,
      originalFallthroughName: null,
      env: 'dev',
    });
  });

  it('tracks multiple flags independently', () => {
    recordSnapshot('flag-a', true, 'v1', 'dev');
    recordSnapshot('flag-b', false, null, 'stg');

    expect(getSessionToggleCount()).toBe(2);
    expect(hasSessionToggles()).toBe(true);
  });

  it('returns entries with originalFallthroughId shape', () => {
    recordSnapshot('flag-a', true, 'v1', 'dev');
    const entries = getSessionToggleEntries();
    expect(entries[0]).toHaveProperty('originalFallthroughId', 'v1');
    expect(entries[0]).toHaveProperty('originalOn', true);
    expect(entries[0]).toHaveProperty('env', 'dev');
  });

  describe('revertSessionToggles', () => {
    beforeEach(() => {
      process.env.LD_API_TOKEN = 'test-token';
      process.env.LD_PROJECT_KEY = 'test-project';
      revertFlagMock.mockResolvedValue({ key: 'x', name: 'x', on: true, variations: [], fallthroughVariationId: null, fallthroughRollout: null });
    });

    it('calls revertFlag with variation and on/off state', async () => {
      recordSnapshot('flag-a', true, 'v1', 'dev');

      await revertSessionToggles();

      expect(revertFlagMock).toHaveBeenCalledWith('flag-a', 'dev', true, 'v1', null);
    });

    it('calls revertFlag with null fallthroughId when none was set', async () => {
      recordSnapshot('flag-a', false, null, 'dev');

      await revertSessionToggles();

      expect(revertFlagMock).toHaveBeenCalledWith('flag-a', 'dev', false, null, null);
    });

    it('clears session after revert', async () => {
      recordSnapshot('flag-a', true, 'v1', 'dev');

      await revertSessionToggles();

      expect(hasSessionToggles()).toBe(false);
      expect(getSessionToggleCount()).toBe(0);
    });

    it('continues reverting remaining flags when one fails', async () => {
      recordSnapshot('flag-a', true, 'v1', 'dev');
      recordSnapshot('flag-b', false, 'v2', 'stg');

      revertFlagMock.mockRejectedValueOnce(new Error('API error'));
      revertFlagMock.mockResolvedValueOnce({ key: 'x', name: 'x', on: false, variations: [], fallthroughVariationId: 'v2', fallthroughRollout: null });

      await revertSessionToggles();

      expect(revertFlagMock).toHaveBeenCalledTimes(2);
    });

    it('calls revertFlag with rollout for rollout flags', async () => {
      const rollout = { weights: { v1: 50000, v2: 50000 } };
      recordSnapshot('flag-r', true, null, 'dev', null, rollout);

      await revertSessionToggles();

      expect(revertFlagMock).toHaveBeenCalledWith('flag-r', 'dev', true, null, rollout);
    });
  });
});
