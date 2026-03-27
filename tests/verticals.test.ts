import { describe, it, expect } from 'vitest';
import { VERTICAL_REGISTRY } from '../src/verticals.js';
import type { Vertical } from '../src/types.js';

describe('VERTICAL_REGISTRY', () => {
  const ALL_VERTICALS: Vertical[] = [
    'childcare', 'seniorcare', 'petcare', 'housekeeping', 'tutoring',
  ];

  it('has an entry for every Vertical', () => {
    for (const v of ALL_VERTICALS) {
      expect(VERTICAL_REGISTRY[v]).toBeDefined();
    }
  });

  it('each entry has required fields', () => {
    for (const v of ALL_VERTICALS) {
      const cfg = VERTICAL_REGISTRY[v];
      expect(cfg.serviceId).toBeTruthy();
      expect(cfg.subServiceId).toBeTruthy();
      expect(cfg.webTilePattern).toBeInstanceOf(RegExp);
      expect(typeof cfg.webTestIdToken).toBe('string');
      expect(cfg.webTestIdToken.length).toBeGreaterThan(0);
    }
  });

  it('childcare config matches known values', () => {
    const cc = VERTICAL_REGISTRY.childcare;
    expect(cc.serviceId).toBe('CHILDCARE');
    expect(cc.subServiceId).toBe('babysitter');
    expect(cc.webTilePattern.test('Child Care')).toBe(true);
    expect(cc.webTestIdToken).toBe('childcare');
  });
});
