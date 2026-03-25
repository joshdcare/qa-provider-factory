import { describe, it, expect } from 'vitest';
import { getStepsUpTo, WEB_STEP_PIPELINE, MOBILE_STEP_PIPELINE } from '../src/steps/registry.js';

describe('Step Registry', () => {
  describe('web pipeline', () => {
    it('returns only account-created step for that target', () => {
      const steps = getStepsUpTo('account-created', 'web');
      expect(steps).toHaveLength(1);
      expect(steps[0].name).toBe('account-created');
    });

    it('returns cumulative steps up to upgraded', () => {
      const steps = getStepsUpTo('upgraded', 'web');
      expect(steps.map((s) => s.name)).toEqual([
        'account-created',
        'profile-complete',
        'pre-upgrade',
        'upgraded',
      ]);
    });

    it('returns all steps for fully-enrolled', () => {
      const steps = getStepsUpTo('fully-enrolled', 'web');
      expect(steps).toHaveLength(WEB_STEP_PIPELINE.length);
    });

    it('throws for unknown step', () => {
      expect(() => getStepsUpTo('unknown' as any, 'web')).toThrow();
    });

    it('throws for mobile-only step on web', () => {
      expect(() => getStepsUpTo('at-availability' as any, 'web')).toThrow(/web platform/i);
    });
  });

  describe('mobile pipeline', () => {
    it('returns cumulative steps up to at-availability', () => {
      const steps = getStepsUpTo('at-availability', 'mobile');
      expect(steps.map((s) => s.name)).toEqual([
        'account-created',
        'at-availability',
      ]);
    });

    it('puts availability before upgraded', () => {
      const steps = getStepsUpTo('upgraded', 'mobile');
      const names = steps.map((s) => s.name);
      expect(names.indexOf('at-availability')).toBeLessThan(names.indexOf('upgraded'));
    });

    it('returns all steps for fully-enrolled', () => {
      const steps = getStepsUpTo('fully-enrolled', 'mobile');
      expect(steps).toHaveLength(MOBILE_STEP_PIPELINE.length);
    });

    it('throws for web-only step on mobile', () => {
      expect(() => getStepsUpTo('pre-upgrade' as any, 'mobile')).toThrow(/mobile platform/i);
    });
  });
});
