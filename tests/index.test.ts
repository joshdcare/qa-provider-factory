import { describe, it, expect } from 'vitest';
import { parseArgs } from '../src/index.js';

describe('parseArgs', () => {
  it('parses required --step flag with default platform', () => {
    const opts = parseArgs(['--step', 'upgraded']);
    expect(opts.step).toBe('upgraded');
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

  it('rejects invalid step', () => {
    expect(() => parseArgs(['--step', 'invalid'])).toThrow();
  });

  it('rejects web-only step on mobile platform', () => {
    expect(() => parseArgs(['--step', 'pre-upgrade', '--platform', 'mobile'])).toThrow(
      /not valid for mobile/
    );
  });

  it('rejects removed step on both platforms', () => {
    expect(() => parseArgs(['--step', 'at-upgrade'])).toThrow();
    expect(() => parseArgs(['--step', 'at-upgrade', '--platform', 'mobile'])).toThrow();
  });

  it('rejects mobile-only step on web platform', () => {
    expect(() => parseArgs(['--step', 'at-availability', '--platform', 'web'])).toThrow(
      /not valid for web/
    );
  });
});
