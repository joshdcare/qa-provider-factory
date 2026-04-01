import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import { LDClient, type LDFlag, type LDVariation, type LDRollout } from '../api/launchdarkly.js';
import type { Env } from '../types.js';
import { COLORS } from './theme.js';
import { recordSnapshot, getSessionToggleCount } from './flag-session.js';

export interface FlagBrowserProps {
  env: Env;
  onClose?: () => void;
}

function getLdConfig(): { ok: true; token: string; projectKey: string } | { ok: false; missing: string[] } {
  const token = process.env.LD_API_TOKEN;
  const projectKey = process.env.LD_PROJECT_KEY;
  if (!token || !projectKey) {
    const missing: string[] = [];
    if (!token) missing.push('LD_API_TOKEN');
    if (!projectKey) missing.push('LD_PROJECT_KEY');
    return { ok: false, missing };
  }
  return { ok: true, token, projectKey };
}

function variationDisplayName(v: LDVariation, index: number): string {
  if (v.name) return v.name;
  const valStr = JSON.stringify(v.value);
  if (valStr.length <= 40) return valStr;
  return `Variation ${index}`;
}

const NAME_COL_WIDTH = 36;

function padName(name: string): string {
  const truncated = name.length > NAME_COL_WIDTH ? `${name.slice(0, NAME_COL_WIDTH - 1)}…` : name;
  return truncated.padEnd(NAME_COL_WIDTH, ' ');
}

export function FlagBrowser({ env, onClose }: FlagBrowserProps): React.ReactElement {
  const { exit } = useApp();
  const config = getLdConfig();
  const client = useMemo(
    () => config.ok ? new LDClient(config.token, config.projectKey) : null,
    [config.ok, config.ok ? config.token : '', config.ok ? config.projectKey : '']
  );

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [flags, setFlags] = useState<LDFlag[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [togglingKey, setTogglingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toggledKey, setToggledKey] = useState<string | null>(null);
  const [view, setView] = useState<'list' | 'detail'>('list');
  const [detailFlag, setDetailFlag] = useState<LDFlag | null>(null);
  const [variationIndex, setVariationIndex] = useState(0);
  const [settingVariation, setSettingVariation] = useState(false);

  const searchSeq = useRef(0);
  const toggledTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  const loadFlags = useCallback(async () => {
    if (!client) return;
    const seq = ++searchSeq.current;
    setLoading(true);
    setError(null);
    try {
      const next = await client.searchFlags(debouncedQuery, env);
      if (seq !== searchSeq.current) return;
      setFlags(next);
      setSelectedIndex(i => {
        if (next.length === 0) return 0;
        return Math.min(i, next.length - 1);
      });
    } catch (e) {
      if (seq !== searchSeq.current) return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (seq === searchSeq.current) setLoading(false);
    }
  }, [client, debouncedQuery, env]);

  useEffect(() => {
    if (!client) return;
    void loadFlags();
  }, [client, debouncedQuery, env, loadFlags]);

  const activeFlag = view === 'detail' ? detailFlag : (flags[selectedIndex] ?? null);

  const handleToggle = useCallback(async () => {
    if (!client || !activeFlag || togglingKey) return;
    setTogglingKey(activeFlag.key);
    setError(null);
    try {
      const origFtVar = activeFlag.variations.find(v => v.id === activeFlag.fallthroughVariationId);
      recordSnapshot(activeFlag.key, activeFlag.on, activeFlag.fallthroughVariationId, env, origFtVar?.name ?? null, activeFlag.fallthroughRollout);
      const newState = !activeFlag.on;
      await client.toggleFlag(activeFlag.key, env, newState);
      setTogglingKey(null);
      setToggledKey(activeFlag.key);
      if (toggledTimeoutRef.current) clearTimeout(toggledTimeoutRef.current);
      toggledTimeoutRef.current = setTimeout(() => {
        setToggledKey(null);
        toggledTimeoutRef.current = null;
      }, 2000);
      await loadFlags();
      if (view === 'detail') {
        setDetailFlag(prev => prev ? { ...prev, on: newState } : prev);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setTogglingKey(null);
    }
  }, [client, env, activeFlag, loadFlags, togglingKey, view]);

  const handleSetVariation = useCallback(async () => {
    if (!client || !detailFlag || settingVariation) return;
    const variation = detailFlag.variations[variationIndex];
    if (!variation || (variation.id === detailFlag.fallthroughVariationId && !detailFlag.fallthroughRollout)) return;
    setSettingVariation(true);
    setError(null);
    try {
      const origFtVar = detailFlag.variations.find(v => v.id === detailFlag.fallthroughVariationId);
      recordSnapshot(detailFlag.key, detailFlag.on, detailFlag.fallthroughVariationId, env, origFtVar?.name ?? null, detailFlag.fallthroughRollout);
      await client.setFallthroughVariation(detailFlag.key, env, variation.id);
      setToggledKey(detailFlag.key);
      if (toggledTimeoutRef.current) clearTimeout(toggledTimeoutRef.current);
      toggledTimeoutRef.current = setTimeout(() => {
        setToggledKey(null);
        toggledTimeoutRef.current = null;
      }, 2000);
      await loadFlags();
      setDetailFlag(prev => {
        if (!prev) return prev;
        return { ...prev, fallthroughVariationId: variation.id, fallthroughRollout: null };
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSettingVariation(false);
    }
  }, [client, env, detailFlag, variationIndex, loadFlags, settingVariation]);

  useInput((input, key) => {
    if (!config.ok) {
      if (key.escape) { if (onClose) onClose(); else exit(); }
      if (input === 'q' && onClose === undefined) exit();
      return;
    }

    if (view === 'detail' && detailFlag) {
      if (key.escape) {
        setView('list');
        setDetailFlag(null);
        void loadFlags();
        return;
      }
      if (key.upArrow) {
        setVariationIndex(i => Math.max(0, i - 1));
        return;
      }
      if (key.downArrow) {
        setVariationIndex(i => Math.min(detailFlag.variations.length - 1, i + 1));
        return;
      }
      if (key.return) {
        void handleSetVariation();
        return;
      }
      if (input === 't') {
        void handleToggle();
        return;
      }
      return;
    }

    if (key.escape) { if (onClose) onClose(); else exit(); return; }
    if (input === 'q' && onClose === undefined) { exit(); return; }
    if (key.upArrow) { setSelectedIndex(i => Math.max(0, i - 1)); return; }
    if (key.downArrow) { setSelectedIndex(i => Math.min(flags.length - 1, i + 1)); return; }

    if (key.return) {
      if (flags.length > 0) {
        const flag = flags[selectedIndex];
        setDetailFlag(flag);
        const ftIdx = flag.variations.findIndex(v => v.id === flag.fallthroughVariationId);
        setVariationIndex(ftIdx >= 0 ? ftIdx : 0);
        setView('detail');
      }
      return;
    }

    if (key.backspace || key.delete) { setQuery(q => q.slice(0, -1)); return; }
    if (input && !key.ctrl && !key.meta && input.length === 1) { setQuery(q => q + input); }
  });

  useEffect(() => () => {
    if (toggledTimeoutRef.current) clearTimeout(toggledTimeoutRef.current);
  }, []);

  const listFooter = onClose === undefined
    ? '↑↓ select · enter: details · esc: close · q: quit'
    : '↑↓ select · enter: details · esc: close';

  const detailFooter = '↑↓ select · enter: set variation · t: toggle on/off · esc: back';

  const footer = view === 'detail' ? detailFooter : listFooter;

  if (!config.ok) {
    return (
      <Box flexDirection="column" height="100%">
        <Box borderStyle="single" borderColor={COLORS.chrome} paddingX={1}>
          <Text color={COLORS.banner} bold>██ Feature Flags</Text>
          <Box flexGrow={1} />
          <Text color={COLORS.contextValue}>{env}</Text>
        </Box>
        <Box flexGrow={1} borderStyle="single" borderColor={COLORS.chrome} paddingX={1} flexDirection="column">
          <Text color={COLORS.stepError}>LaunchDarkly is not configured.</Text>
          <Text color={COLORS.dimText}>Set the following environment variable(s):</Text>
          {config.missing.map(v => (
            <Text key={v} color={COLORS.stepRunning}>• {v}</Text>
          ))}
        </Box>
        <Box borderStyle="single" borderColor={COLORS.chrome} paddingX={1}>
          <Text color={COLORS.dimText}>{footer}</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" height="100%">
      <Box borderStyle="single" borderColor={COLORS.chrome} paddingX={1}>
        <Text color={COLORS.banner} bold>██ Feature Flags</Text>
        <Box flexGrow={1} />
        <Text color={COLORS.contextValue}>{env}</Text>
      </Box>

      <Box flexGrow={1} flexDirection="column" borderStyle="single" borderColor={COLORS.chrome} paddingX={1}>
        {view === 'list' && (
          <>
            <Box>
              <Text color={COLORS.dimText}>Search: </Text>
              <Text color={COLORS.contextValue}>{query}</Text>
              <Text color={COLORS.contextValue}>█</Text>
            </Box>

            {error && (
              <Box marginTop={1}>
                <Text color={COLORS.stepError}>{error}</Text>
              </Box>
            )}

            <Box marginTop={1} flexDirection="column">
              {loading && flags.length === 0 && (
                <Text color={COLORS.stepRunning}>Loading…</Text>
              )}
              {loading && flags.length > 0 && (
                <Text color={COLORS.dimText}>Refreshing…</Text>
              )}
              {flags.map((f, i) => {
                const selected = i === selectedIndex;
                const prefix = selected ? '▸' : ' ';
                const stateDot = f.on ? '●' : '○';
                const isBusy = togglingKey === f.key;
                const stateLabel = isBusy ? '...' : f.on ? 'ON' : 'OFF';
                const stateColor = isBusy ? COLORS.stepRunning : f.on ? COLORS.stepComplete : COLORS.dimText;
                const showToggled = toggledKey === f.key && !isBusy;
                const ftVariation = f.variations.find(v => v.id === f.fallthroughVariationId);
                const ftLabel = ftVariation
                  ? variationDisplayName(ftVariation, f.variations.indexOf(ftVariation))
                  : f.fallthroughRollout ? 'rollout' : '';
                return (
                  <Box key={f.key}>
                    <Text color={selected ? COLORS.stepRunning : COLORS.dimText}>
                      {prefix} {stateDot} {padName(f.key)}
                    </Text>
                    <Text color={stateColor}> {stateLabel}</Text>
                    {ftLabel && <Text color={COLORS.dimText}> [{ftLabel}]</Text>}
                    {showToggled && (
                      <Text color={COLORS.stepComplete}>  Toggled</Text>
                    )}
                  </Box>
                );
              })}
            </Box>

            {getSessionToggleCount() > 0 && (
              <Box marginTop={1}>
                <Text color={COLORS.dimText}>
                  Session: {getSessionToggleCount()} flag(s) changed — will revert on exit
                </Text>
              </Box>
            )}
          </>
        )}

        {view === 'detail' && detailFlag && (
          <Box flexDirection="column">
            <Text color={COLORS.contextValue} bold>{detailFlag.key}</Text>
            <Text color={detailFlag.on ? COLORS.stepComplete : COLORS.dimText}>
              {detailFlag.on ? '● ON' : '○ OFF'}
            </Text>
            {detailFlag.fallthroughRollout && (
              <Text color={COLORS.dimText}>Currently: percentage rollout</Text>
            )}

            {error && (
              <Box marginTop={1}><Text color={COLORS.stepError}>{error}</Text></Box>
            )}

            <Box marginTop={1} flexDirection="column">
              <Text color={COLORS.dimText}>Fallthrough variation (served when flag is ON):</Text>
              {detailFlag.variations.map((v, i) => {
                const selected = i === variationIndex;
                const isCurrent = v.id === detailFlag.fallthroughVariationId;
                const rolloutWeight = detailFlag.fallthroughRollout?.weights[v.id];
                const prefix = selected ? '▸' : ' ';
                const valStr = JSON.stringify(v.value).slice(0, 30);
                const isBusy = settingVariation && selected;
                return (
                  <Box key={v.id}>
                    <Text color={selected ? COLORS.stepRunning : COLORS.dimText}>
                      {prefix} {variationDisplayName(v, i).padEnd(36)} {valStr}
                    </Text>
                    {isBusy && <Text color={COLORS.stepRunning}> ...</Text>}
                    {isCurrent && !isBusy && <Text color={COLORS.stepComplete}> ← current</Text>}
                    {rolloutWeight !== undefined && !isBusy && !isCurrent && (
                      <Text color={COLORS.dimText}> {(rolloutWeight / 1000).toFixed(1)}%</Text>
                    )}
                    {toggledKey === detailFlag.key && selected && !isBusy && !isCurrent && (
                      <Text color={COLORS.stepComplete}> ✓</Text>
                    )}
                  </Box>
                );
              })}
            </Box>

            {getSessionToggleCount() > 0 && (
              <Box marginTop={1}>
                <Text color={COLORS.dimText}>
                  Session: {getSessionToggleCount()} flag(s) changed — will revert on exit
                </Text>
              </Box>
            )}
          </Box>
        )}
      </Box>

      <Box borderStyle="single" borderColor={COLORS.chrome} paddingX={1}>
        <Text color={COLORS.dimText}>{footer}</Text>
      </Box>
    </Box>
  );
}
