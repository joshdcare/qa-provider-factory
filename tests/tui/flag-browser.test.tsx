import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { FlagBrowser } from '../../src/tui/flag-browser.js';

const searchFlagsMock = vi.fn();
const toggleFlagMock = vi.fn();
const setFallthroughVariationMock = vi.fn();

vi.mock('../../src/api/launchdarkly.js', () => ({
  LDClient: class {
    searchFlags = searchFlagsMock;
    toggleFlag = toggleFlagMock;
    setFallthroughVariation = setFallthroughVariationMock;
  },
}));

describe('FlagBrowser', () => {
  let originalToken: string | undefined;
  let originalProject: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    originalToken = process.env.LD_API_TOKEN;
    originalProject = process.env.LD_PROJECT_KEY;
    searchFlagsMock.mockResolvedValue([]);
    toggleFlagMock.mockImplementation(async (_key: string, _env: string, _state: boolean) => ({
      key: 'k', name: 'n', on: true, variations: [], fallthroughVariationId: null, fallthroughRollout: null,
    }));
    setFallthroughVariationMock.mockResolvedValue({
      key: 'k', name: 'n', on: true, variations: [], fallthroughVariationId: null, fallthroughRollout: null,
    });
  });

  afterEach(() => {
    if (originalToken !== undefined) process.env.LD_API_TOKEN = originalToken;
    else delete process.env.LD_API_TOKEN;
    if (originalProject !== undefined) process.env.LD_PROJECT_KEY = originalProject;
    else delete process.env.LD_PROJECT_KEY;
  });

  it('renders header with environment name', async () => {
    process.env.LD_API_TOKEN = 'test-token';
    process.env.LD_PROJECT_KEY = 'test-project';

    const inst = render(<FlagBrowser env="dev" />);

    await vi.waitFor(
      () => {
        expect(inst.lastFrame()).toContain('Feature Flags');
        expect(inst.lastFrame()).toContain('dev');
      },
      { timeout: 3000 }
    );

    await vi.waitFor(
      () => {
        expect(searchFlagsMock).toHaveBeenCalledWith('', 'dev');
      },
      { timeout: 3000 }
    );

    inst.unmount();
  });

  it('shows missing config message when LD_API_TOKEN is not set', async () => {
    delete process.env.LD_API_TOKEN;
    delete process.env.LD_PROJECT_KEY;
    searchFlagsMock.mockClear();

    const inst = render(<FlagBrowser env="stg" />);
    const frame = inst.lastFrame()!;

    expect(frame).toContain('LD_API_TOKEN');
    expect(frame).toContain('LD_PROJECT_KEY');
    expect(searchFlagsMock).not.toHaveBeenCalled();
    inst.unmount();
  });

  it('opens detail view on Enter and shows variations', async () => {
    process.env.LD_API_TOKEN = 'test-token';
    process.env.LD_PROJECT_KEY = 'test-project';

    searchFlagsMock.mockResolvedValue([
      {
        key: 'my-flag',
        name: 'My Flag',
        on: true,
        variations: [
          { id: 'v1', name: 'control', value: 'control' },
          { id: 'v2', name: 'test', value: 'test' },
        ],
        fallthroughVariationId: 'v1',
        fallthroughRollout: null,
      },
    ]);

    const inst = render(<FlagBrowser env="dev" />);

    await vi.waitFor(
      () => { expect(inst.lastFrame()).toContain('my-flag'); },
      { timeout: 3000 }
    );

    inst.stdin.write('\r');

    await vi.waitFor(
      () => {
        const frame = inst.lastFrame()!;
        expect(frame).toContain('Fallthrough variation');
        expect(frame).toContain('control');
        expect(frame).toContain('test');
        expect(frame).toContain('← current');
      },
      { timeout: 3000 }
    );

    inst.unmount();
  });

  it('sets fallthrough variation on Enter in detail view', async () => {
    process.env.LD_API_TOKEN = 'test-token';
    process.env.LD_PROJECT_KEY = 'test-project';

    const flag = {
      key: 'my-flag',
      name: 'My Flag',
      on: true,
      variations: [
        { id: 'v1', name: 'control', value: 'control' },
        { id: 'v2', name: 'test', value: 'test' },
      ],
      fallthroughVariationId: 'v1',
      fallthroughRollout: null,
    };
    searchFlagsMock.mockResolvedValue([flag]);
    setFallthroughVariationMock.mockResolvedValue({ ...flag, fallthroughVariationId: 'v2' });

    const inst = render(<FlagBrowser env="dev" />);

    await vi.waitFor(
      () => { expect(inst.lastFrame()).toContain('my-flag'); },
      { timeout: 3000 }
    );

    inst.stdin.write('\r');

    await vi.waitFor(
      () => { expect(inst.lastFrame()).toContain('Fallthrough variation'); },
      { timeout: 3000 }
    );

    await new Promise(r => setTimeout(r, 50));

    inst.stdin.write('\x1B[B'); // down arrow

    await vi.waitFor(
      () => { expect(inst.lastFrame()).toMatch(/▸.*test/); },
      { timeout: 3000 }
    );

    await new Promise(r => setTimeout(r, 50));
    inst.stdin.write('\r');     // enter

    await vi.waitFor(
      () => {
        expect(setFallthroughVariationMock).toHaveBeenCalledWith('my-flag', 'dev', 'v2');
      },
      { timeout: 3000 }
    );

    inst.unmount();
  });
});
