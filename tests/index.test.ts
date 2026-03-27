import { describe, it, expect } from 'vitest';
import { parseArgs } from '../src/index.js';

describe('parseArgs', () => {
  it('parses required --step flag with default platform (web)', () => {
    const opts = parseArgs(['--step', 'at-location']);
    expect(opts.step).toBe('at-location');
    expect(opts.tier).toBe('premium');
    expect(opts.vertical).toBe('childcare');
    expect(opts.env).toBe('dev');
    expect(opts.platform).toBe('web');
  });

  it('parses all flags including platform', () => {
    const opts = parseArgs([
      '--step', 'at-availability',
      '--tier', 'basic',
      '--vertical', 'childcare',
      '--platform', 'mobile',
      '--env', 'dev',
    ]);
    expect(opts.step).toBe('at-availability');
    expect(opts.tier).toBe('basic');
    expect(opts.platform).toBe('mobile');
  });

  it('accepts all web steps', () => {
    const webSteps = [
      'at-get-started', 'at-soft-intro-combined', 'at-vertical-selection',
      'at-location', 'at-preferences', 'at-family-count', 'at-account-creation',
      'at-family-connection', 'at-safety-screening', 'at-subscriptions',
      'at-basic-payment', 'at-premium-payment', 'at-app-download',
    ];
    for (const step of webSteps) {
      const opts = parseArgs(['--step', step, '--platform', 'web']);
      expect(opts.step).toBe(step);
    }
  });

  it('rejects invalid step', () => {
    expect(() => parseArgs(['--step', 'invalid'])).toThrow();
  });

  it('rejects mobile-only step on web platform', () => {
    expect(() => parseArgs(['--step', 'at-availability', '--platform', 'web'])).toThrow(
      /not valid for web/
    );
  });

  it('rejects web-only step on mobile platform', () => {
    expect(() => parseArgs(['--step', 'at-location', '--platform', 'mobile'])).toThrow(
      /not valid for mobile/
    );
  });

  it('rejects legacy steps that no longer exist', () => {
    expect(() => parseArgs(['--step', 'pre-upgrade'])).toThrow();
    expect(() => parseArgs(['--step', 'account-created'])).toThrow();
  });

  it('accepts all vertical names', () => {
    const verticals = ['childcare', 'seniorcare', 'petcare', 'housekeeping', 'tutoring'];
    for (const v of verticals) {
      const opts = parseArgs(['--step', 'at-location', '--vertical', v]);
      expect(opts.vertical).toBe(v);
    }
  });

  it('rejects invalid vertical', () => {
    expect(() => parseArgs(['--step', 'at-location', '--vertical', 'dogwalking'])).toThrow();
  });
});
