import { describe, it, expect } from 'vitest';
import { parseArgs } from '../src/index.js';

describe('parseArgs', () => {
  it('parses positional step with defaults (web, premium, childcare)', () => {
    const opts = parseArgs(['at-location']);
    expect(opts.step).toBe('at-location');
    expect(opts.tier).toBe('premium');
    expect(opts.vertical).toBe('childcare');
    expect(opts.env).toBe('dev');
    expect(opts.platform).toBe('web');
  });

  it('parses -m flag as mobile platform', () => {
    const opts = parseArgs(['at-availability', '-m']);
    expect(opts.step).toBe('at-availability');
    expect(opts.platform).toBe('mobile');
  });

  it('parses --mobile flag as mobile platform', () => {
    const opts = parseArgs(['at-availability', '--mobile']);
    expect(opts.platform).toBe('mobile');
  });

  it('parses all short flags', () => {
    const opts = parseArgs([
      'at-availability', '-m', '-t', 'basic', '-v', 'petcare', '-e', 'dev',
    ]);
    expect(opts.step).toBe('at-availability');
    expect(opts.platform).toBe('mobile');
    expect(opts.tier).toBe('basic');
    expect(opts.vertical).toBe('petcare');
    expect(opts.env).toBe('dev');
  });

  it('parses all long flags', () => {
    const opts = parseArgs([
      'at-availability',
      '--mobile',
      '--tier', 'basic',
      '--vertical', 'seniorcare',
      '--env', 'dev',
    ]);
    expect(opts.step).toBe('at-availability');
    expect(opts.platform).toBe('mobile');
    expect(opts.tier).toBe('basic');
    expect(opts.vertical).toBe('seniorcare');
  });

  it('accepts all web steps', () => {
    const webSteps = [
      'at-get-started', 'at-soft-intro-combined', 'at-vertical-selection',
      'at-location', 'at-preferences', 'at-family-count', 'at-account-creation',
      'at-family-connection', 'at-safety-screening', 'at-subscriptions',
      'at-basic-payment', 'at-premium-payment', 'at-app-download',
    ];
    for (const step of webSteps) {
      const opts = parseArgs([step]);
      expect(opts.step).toBe(step);
    }
  });

  it('rejects invalid step', () => {
    expect(() => parseArgs(['invalid'])).toThrow();
  });

  it('rejects mobile-only step without -m flag', () => {
    expect(() => parseArgs(['at-availability'])).toThrow(
      /not valid for web/
    );
  });

  it('rejects web-only step with -m flag', () => {
    expect(() => parseArgs(['at-location', '-m'])).toThrow(
      /not valid for mobile/
    );
  });

  it('rejects legacy steps that no longer exist', () => {
    expect(() => parseArgs(['pre-upgrade'])).toThrow();
    expect(() => parseArgs(['account-created'])).toThrow();
  });

  it('accepts all vertical names', () => {
    const verticals = ['childcare', 'seniorcare', 'petcare', 'housekeeping', 'tutoring'];
    for (const v of verticals) {
      const opts = parseArgs(['at-location', '-v', v]);
      expect(opts.vertical).toBe(v);
    }
  });

  it('rejects invalid vertical', () => {
    expect(() => parseArgs(['at-location', '-v', 'dogwalking'])).toThrow();
  });
});
