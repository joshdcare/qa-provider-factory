import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import type { RunEmitter, RunEvent } from './emitter.js';
import { COLORS } from './theme.js';

interface LogEntry {
  event: RunEvent;
  timestamp: number;
}

interface LogFilters {
  browser: boolean;
  network: boolean;
  navigation: boolean;
  system: boolean;
}

interface LogPanelProps {
  emitter: RunEmitter;
  detailMode: boolean;
}

function isBrowserEvent(e: RunEvent): boolean {
  return e.type === 'field-fill' || e.type === 'button-click' || e.type === 'checkbox';
}

function isNetworkEvent(e: RunEvent): boolean {
  return e.type === 'network-request' || e.type === 'network-response';
}

function isNavigationEvent(e: RunEvent): boolean {
  return e.type === 'navigation';
}

function isSystemEvent(e: RunEvent): boolean {
  return e.type === 'info' || e.type === 'auth' || e.type === 'db-query';
}

export function LogPanel({ emitter, detailMode }: LogPanelProps): React.ReactElement {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [filters, setFilters] = useState<LogFilters>({
    browser: true, network: true, navigation: true, system: true,
  });
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [scrollOffset, setScrollOffset] = useState(0);

  useEffect(() => {
    const handler = (event: RunEvent) => {
      setEntries(prev => [...prev, { event, timestamp: Date.now() }]);
    };
    emitter.on('event', handler);
    return () => { emitter.off('event', handler); };
  }, [emitter]);

  useInput((input, key) => {
    if (input === 'f') setShowFilterMenu(prev => !prev);
    if (input === '1') setFilters(prev => ({ ...prev, browser: !prev.browser }));
    if (input === '2') setFilters(prev => ({ ...prev, network: !prev.network }));
    if (input === '3') setFilters(prev => ({ ...prev, navigation: !prev.navigation }));
    if (input === '4') setFilters(prev => ({ ...prev, system: !prev.system }));
    if (key.upArrow) setScrollOffset(prev => Math.max(0, prev - 1));
    if (key.downArrow) setScrollOffset(prev => prev + 1);
  });

  const filtered = entries.filter(({ event }) => {
    if (isBrowserEvent(event) && !filters.browser) return false;
    if (isNetworkEvent(event) && !filters.network) return false;
    if (isNavigationEvent(event) && !filters.navigation) return false;
    if (isSystemEvent(event) && !filters.system) return false;
    return true;
  });

  const visible = filtered.slice(Math.max(0, filtered.length - 30 + scrollOffset));

  return (
    <Box flexDirection="column" flexGrow={1}>
      {showFilterMenu && (
        <Box flexDirection="column" marginBottom={1}>
          <Text color={COLORS.dimText}>Filters (toggle with 1-4):</Text>
          <Text color={filters.browser ? COLORS.browserAction : COLORS.dimText}>
            {filters.browser ? '●' : '○'} 1: Browser actions
          </Text>
          <Text color={filters.network ? COLORS.networkCall : COLORS.dimText}>
            {filters.network ? '●' : '○'} 2: Network calls
          </Text>
          <Text color={filters.navigation ? COLORS.navigation : COLORS.dimText}>
            {filters.navigation ? '●' : '○'} 3: Navigation
          </Text>
          <Text color={filters.system ? COLORS.systemEvent : COLORS.dimText}>
            {filters.system ? '●' : '○'} 4: System events
          </Text>
        </Box>
      )}
      {visible.map((entry, i) => (
        <LogLine key={i} entry={entry} detailMode={detailMode} />
      ))}
    </Box>
  );
}

function LogLine({ entry, detailMode }: { entry: LogEntry; detailMode: boolean }): React.ReactElement {
  const { event } = entry;

  switch (event.type) {
    case 'field-fill':
      return <Text color={COLORS.browserAction}>⌨ Filled → {event.field} → "{event.value}"</Text>;
    case 'button-click':
      return <Text color={COLORS.stepComplete}>🖱 Clicked → "{event.label}"</Text>;
    case 'checkbox':
      return <Text color="#c4b5fd">☑ {event.checked ? 'Checked' : 'Unchecked'} → {event.label}</Text>;
    case 'navigation':
      return <Text color={COLORS.navigation}>🔗 Navigated → {event.url}</Text>;
    case 'network-request':
      return (
        <Box flexDirection="column">
          <Text color={COLORS.networkCall}>→ {event.method} {event.url}</Text>
          {detailMode && event.body && <Text color={COLORS.dimText}>  {event.body.slice(0, 200)}</Text>}
        </Box>
      );
    case 'network-response':
      return (
        <Box flexDirection="column">
          <Text color={COLORS.networkCall}>← {event.status} <Text color={COLORS.dimText}>({event.duration}ms)</Text></Text>
          {detailMode && event.body && <Text color={COLORS.dimText}>  {event.body.slice(0, 200)}</Text>}
        </Box>
      );
    case 'step-start':
      return <Text color={COLORS.stepRunning} bold>{event.step}</Text>;
    case 'step-complete':
      return <Text color={COLORS.stepComplete}>✓ {event.step} complete</Text>;
    case 'step-error':
      return <Text color={COLORS.stepError}>✗ {event.step}: {event.error}</Text>;
    case 'auth':
      return <Text color={COLORS.systemEvent}>🔑 {event.message}</Text>;
    case 'db-query':
      return <Text color={COLORS.systemEvent}>🗄 {event.query}</Text>;
    case 'info':
      return <Text color={COLORS.systemEvent}>{event.message}</Text>;
    case 'context-update':
      return <Text color={COLORS.dimText}>{event.key}: {event.value}</Text>;
  }
}
