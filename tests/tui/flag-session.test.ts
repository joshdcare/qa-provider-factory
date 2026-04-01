import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

const toggleFlagMock = vi.fn();
const setFallthroughVariationMock = vi.fn();
const restoreFallthroughRolloutMock = vi.fn();

vi.mock('../../src/api/launchdarkly.js', () => ({
  LDClient: class {
    toggleFlag = toggleFlagMock;
    setFallthroughVariation = setFallthroughVariationMock;
    restoreFallthroughRollout = restoreFallthroughRolloutMock;
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
      toggleFlagMock.mockResolvedValue(undefined);
      setFallthroughVariationMock.mockResolvedValue(undefined);
      restoreFallthroughRolloutMock.mockResolvedValue(undefined);
    });

    it('calls setFallthroughVariation then toggleFlag per flag', async () => {
      recordSnapshot('flag-a', true, 'v1', 'dev');

      await revertSessionToggles();

      expect(setFallthroughVariationMock).toHaveBeenCalledWith('flag-a', 'dev', 'v1');
      expect(toggleFlagMock).toHaveBeenCalledWith('flag-a', 'dev', true);

      const ftOrder = setFallthroughVariationMock.mock.invocationCallOrder[0];
      const toggleOrder = toggleFlagMock.mock.invocationCallOrder[0];
      expect(ftOrder).toBeLessThan(toggleOrder);
    });

    it('skips setFallthroughVariation when originalFallthroughId is null', async () => {
      recordSnapshot('flag-a', false, null, 'dev');

      await revertSessionToggles();

      expect(setFallthroughVariationMock).not.toHaveBeenCalled();
      expect(toggleFlagMock).toHaveBeenCalledWith('flag-a', 'dev', false);
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

      toggleFlagMock.mockRejectedValueOnce(new Error('API error'));
      toggleFlagMock.mockResolvedValueOnce(undefined);

      await revertSessionToggles();

      expect(toggleFlagMock).toHaveBeenCalledTimes(2);
    });

    it('calls restoreFallthroughRollout for rollout flags', async () => {
      recordSnapshot('flag-r', true, null, 'dev', null, { weights: { v1: 50000, v2: 50000 } });

      await revertSessionToggles();

      expect(restoreFallthroughRolloutMock).toHaveBeenCalledWith('flag-r', 'dev', { weights: { v1: 50000, v2: 50000 } });
      expect(setFallthroughVariationMock).not.toHaveBeenCalled();
      expect(toggleFlagMock).toHaveBeenCalledWith('flag-r', 'dev', true);
    });
  });
});
