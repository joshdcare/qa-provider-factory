import { describe, it, expect } from 'vitest';
import { generateHtmlReport } from '../../src/recorder/html-template.js';
import type { RunReport } from '../../src/recorder/types.js';

function makeReport(overrides: Partial<RunReport> = {}): RunReport {
  return {
    meta: {
      timestamp: '2026-03-27T14:00:00.000Z',
      platform: 'mobile',
      vertical: 'childcare',
      tier: 'premium',
      targetStep: 'account-created',
      totalDuration: 2500,
      outcome: 'pass',
      ...overrides.meta,
    },
    context: {
      email: 'test@care.com',
      password: 'letmein1',
      memberId: null,
      uuid: null,
      authToken: null,
      accessToken: null,
      vertical: null,
      ...overrides.context,
    },
    steps: overrides.steps ?? [
      {
        name: 'account-created',
        status: 'pass',
        duration: 2500,
        startedAt: '2026-03-27T14:00:00.000Z',
        requests: [],
        screenshot: null,
        error: null,
      },
    ],
    errors: overrides.errors ?? [],
  };
}

describe('generateHtmlReport', () => {
  it('returns a self-contained HTML string', () => {
    const html = generateHtmlReport(makeReport());
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('</html>');
    expect(html).toContain('<style>');
    expect(html).not.toContain('<link rel="stylesheet"');
  });

  it('includes pass badge for passing runs', () => {
    const html = generateHtmlReport(makeReport());
    expect(html).toContain('PASS');
    expect(html).toContain('account-created');
  });

  it('includes fail badge and errors section for failing runs', () => {
    const html = generateHtmlReport(makeReport({
      meta: { outcome: 'fail' } as any,
      errors: [{
        step: 'account-created',
        message: 'enroll failed',
        stack: 'Error: enroll failed\n    at ...',
        timestamp: '2026-03-27T14:00:02.000Z',
      }],
    }));
    expect(html).toContain('FAIL');
    expect(html).toContain('enroll failed');
  });

  it('includes request/response details in collapsible sections', () => {
    const html = generateHtmlReport(makeReport({
      steps: [{
        name: 'account-created',
        status: 'pass',
        duration: 2500,
        startedAt: '2026-03-27T14:00:00.000Z',
        requests: [{
          method: 'POST',
          url: '/platform/spi/enroll/lite',
          status: 200,
          duration: 680,
          requestBody: '{"email":"x"}',
          responseBody: '{"data":{}}',
          timestamp: '2026-03-27T14:00:00.100Z',
        }],
        screenshot: null,
        error: null,
      }],
    }));
    expect(html).toContain('<details');
    expect(html).toContain('POST');
    expect(html).toContain('/platform/spi/enroll/lite');
  });

  it('embeds screenshots as base64 when provided', () => {
    const html = generateHtmlReport(makeReport(), {
      'screenshots/01_test.png': Buffer.from('fakepng'),
    });
    expect(html).toContain('data:image/png;base64,');
  });
});
