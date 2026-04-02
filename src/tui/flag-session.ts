import type { Env } from '../types.js';
import type { LDRollout } from '../api/launchdarkly.js';

interface ToggleRecord {
  originalOn: boolean;
  originalFallthroughId: string | null;
  originalFallthroughRollout: LDRollout | null;
  originalFallthroughName: string | null;
  env: Env;
}

const sessionToggles = new Map<string, ToggleRecord>();

export function recordSnapshot(
  flagKey: string,
  originalOn: boolean,
  originalFallthroughId: string | null,
  env: Env,
  originalFallthroughName?: string | null,
  originalFallthroughRollout?: LDRollout | null
): void {
  if (!sessionToggles.has(flagKey)) {
    const rec: ToggleRecord = {
      originalOn,
      originalFallthroughId,
      originalFallthroughRollout: originalFallthroughRollout ?? null,
      originalFallthroughName: originalFallthroughName ?? null,
      env,
    };
    sessionToggles.set(flagKey, rec);
    process.stderr.write(
      `[session] snapshot ${flagKey}: on=${originalOn} ftId=${originalFallthroughId} rollout=${originalFallthroughRollout !== null && originalFallthroughRollout !== undefined}\n`
    );
  }
}

export function hasSessionToggles(): boolean {
  return sessionToggles.size > 0;
}

export function getSessionToggleCount(): number {
  return sessionToggles.size;
}

export function getSessionToggleEntries(): Array<{
  key: string;
  originalOn: boolean;
  originalFallthroughId: string | null;
  originalFallthroughRollout: LDRollout | null;
  originalFallthroughName: string | null;
  env: Env;
}> {
  return [...sessionToggles.entries()].map(([key, rec]) => ({
    key,
    originalOn: rec.originalOn,
    originalFallthroughId: rec.originalFallthroughId,
    originalFallthroughRollout: rec.originalFallthroughRollout,
    originalFallthroughName: rec.originalFallthroughName,
    env: rec.env,
  }));
}

let reverting = false;

export async function revertSessionToggles(): Promise<void> {
  if (sessionToggles.size === 0 || reverting) return;
  reverting = true;

  const token = process.env.LD_API_TOKEN;
  const projectKey = process.env.LD_PROJECT_KEY;
  if (!token || !projectKey) {
    sessionToggles.clear();
    reverting = false;
    return;
  }

  const { LDClient } = await import('../api/launchdarkly.js');
  const client = new LDClient(token, projectKey);

  const entries = [...sessionToggles.entries()];
  sessionToggles.clear();

  process.stderr.write(`\nReverting ${entries.length} flag(s)…\n`);

  const results = await Promise.allSettled(
    entries.map(async ([flagKey, { originalOn, originalFallthroughId, originalFallthroughRollout, env }]) => {
      try {
        const parts: string[] = [];
        if (originalFallthroughRollout !== null) parts.push('rollout');
        else if (originalFallthroughId !== null) parts.push(`variation=${originalFallthroughId}`);
        parts.push(originalOn ? 'ON' : 'OFF');
        process.stderr.write(`  ${flagKey}: reverting → ${parts.join(' + ')}…\n`);

        const result = await client.revertFlag(
          flagKey, env, originalOn, originalFallthroughId, originalFallthroughRollout
        );

        const actualFtId = result.fallthroughVariationId;
        const actualOn = result.on;
        const onMatch = actualOn === originalOn;
        const ftMatch = originalFallthroughRollout !== null
          ? result.fallthroughRollout !== null
          : actualFtId === originalFallthroughId;

        if (onMatch && ftMatch) {
          process.stderr.write(`  ${flagKey}: ✓ verified\n`);
        } else {
          process.stderr.write(
            `  ${flagKey}: ⚠ MISMATCH — on=${actualOn} (want ${originalOn}), ` +
            `ftId=${actualFtId} (want ${originalFallthroughId})\n`
          );
        }
      } catch (err) {
        process.stderr.write(`  ${flagKey}: FAILED — ${err}\n`);
        throw err;
      }
    }),
  );

  const failed = results.filter(r => r.status === 'rejected');
  if (failed.length === 0) {
    process.stderr.write(`✓ All flags reverted.\n`);
  }
  reverting = false;
}
