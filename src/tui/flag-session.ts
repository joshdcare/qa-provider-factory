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
    sessionToggles.set(flagKey, {
      originalOn,
      originalFallthroughId,
      originalFallthroughRollout: originalFallthroughRollout ?? null,
      originalFallthroughName: originalFallthroughName ?? null,
      env,
    });
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

export async function revertSessionToggles(): Promise<void> {
  if (sessionToggles.size === 0) return;

  const token = process.env.LD_API_TOKEN;
  const projectKey = process.env.LD_PROJECT_KEY;
  if (!token || !projectKey) {
    sessionToggles.clear();
    return;
  }

  const { LDClient } = await import('../api/launchdarkly.js');
  const client = new LDClient(token, projectKey);

  const entries = [...sessionToggles.entries()];
  sessionToggles.clear();

  await Promise.allSettled(
    entries.map(async ([flagKey, { originalOn, originalFallthroughId, originalFallthroughRollout, env }]) => {
      if (originalFallthroughRollout !== null) {
        await client.restoreFallthroughRollout(flagKey, env, originalFallthroughRollout);
      } else if (originalFallthroughId !== null) {
        await client.setFallthroughVariation(flagKey, env, originalFallthroughId);
      }
      await client.toggleFlag(flagKey, env, originalOn);
    }),
  );
}
