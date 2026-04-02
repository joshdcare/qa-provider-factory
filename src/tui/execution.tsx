import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import type { RunEmitter, RunEvent, CreatedUser } from './emitter.js';
import type { Step, Platform, Tier, Vertical, Env } from '../types.js';
import { LogPanel, type LogEntry } from './log-panel.js';
import { STEP_DESCRIPTIONS } from './step-descriptions.js';
import { COLORS } from './theme.js';
import { FlagBrowser } from './flag-browser.js';

type StepStatus = 'pending' | 'running' | 'complete' | 'error';

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const SPINNER_INTERVAL = 80;

function useSpinner(active: boolean): string {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => {
      setFrame(prev => (prev + 1) % SPINNER_FRAMES.length);
    }, SPINNER_INTERVAL);
    return () => clearInterval(timer);
  }, [active]);
  return active ? SPINNER_FRAMES[frame] : '⠋';
}

function eventToLine(event: RunEvent): string | null {
  switch (event.type) {
    case 'step-start': return `▸ ${event.step}`;
    case 'step-complete': return `✓ ${event.step}`;
    case 'step-error': return `✗ ${event.step}: ${event.error}`;
    case 'network-request': return `→ ${event.method} ${event.url}`;
    case 'network-response': return `← ${event.status} (${event.duration}ms)`;
    case 'field-fill': return `⌨ ${event.field}`;
    case 'button-click': return `🖱 ${event.label}`;
    case 'navigation': return `🔗 ${event.url}`;
    case 'info': return event.message;
    case 'monitoring-start': return '👁 Monitoring browser...';
    default: return null;
  }
}

interface ExecutionProps {
  emitter: RunEmitter;
  steps: readonly Step[];
  platform: Platform;
  verticals: Vertical[];
  tier: Tier;
  env: Env;
  executionMode: 'run-all' | 'step-through';
  onStepContinue: () => void;
  onRetry: () => void;
  onQuit: () => void;
  onCreateAnother: () => void;
  onNewConfig: () => void;
  onAbortMonitoring: () => void;
}

export function Execution({
  emitter, steps, platform, verticals, tier, env,
  executionMode, onStepContinue, onRetry, onQuit,
  onCreateAnother, onNewConfig, onAbortMonitoring,
}: ExecutionProps): React.ReactElement {
  useApp();
  const [stepStatuses, setStepStatuses] = useState<Map<string, StepStatus>>(
    () => new Map(steps.map(s => [s, 'pending']))
  );
  const [currentStep, setCurrentStep] = useState<string>(steps[0]);
  const [viewingStep, setViewingStep] = useState<string>(steps[0]);
  const [detailMode, setDetailMode] = useState(false);
  const [logsExpanded, setLogsExpanded] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [monitoring, setMonitoring] = useState(false);
  const [done, setDone] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [context, setContext] = useState<Record<string, string>>({});
  const [createdUsers, setCreatedUsers] = useState<CreatedUser[]>([]);
  const [recentLines, setRecentLines] = useState<string[]>([]);
  const [menuIndex, setMenuIndex] = useState(0);
  const [startTime] = useState(Date.now());
  const [showFlags, setShowFlags] = useState(false);

  const spinnerChar = useSpinner(!done && !waiting && !logsExpanded);

  const logsByStepRef = useRef<Map<string, LogEntry[]>>(new Map([['_all', []]]));
  const activeStepRef = useRef<string>(steps[0]);
  const logsExpandedRef = useRef(logsExpanded);
  logsExpandedRef.current = logsExpanded;

  const monitoringRef = useRef(monitoring);
  monitoringRef.current = monitoring;

  const quitRequestedRef = useRef(false);
  const [logVersion, setLogVersion] = useState(0);

  const pendingLinesRef = useRef<string[]>([]);
  const logDirtyRef = useRef(false);

  useEffect(() => {
    const tick = () => {
      setElapsed(Date.now() - startTime);
      if (logDirtyRef.current) {
        logDirtyRef.current = false;
        setLogVersion(v => v + 1);
      }
      if (pendingLinesRef.current.length > 0) {
        const lines = pendingLinesRef.current.slice(-3);
        pendingLinesRef.current = [];
        setRecentLines(lines);
      }
    };
    const timer = setInterval(tick, 500);
    return () => clearInterval(timer);
  }, [startTime]);

  useEffect(() => {
    const addEntry = (event: RunEvent) => {
      const entry: LogEntry = { event, timestamp: Date.now() };
      const map = logsByStepRef.current;
      map.get('_all')!.push(entry);
      const step = activeStepRef.current;
      if (!map.has(step)) map.set(step, []);
      map.get(step)!.push(entry);
      logDirtyRef.current = true;
    };

    const handler = (event: RunEvent) => {
      if (event.type === 'step-start') {
        activeStepRef.current = event.step;
        setCurrentStep(event.step);
        setViewingStep(event.step);
        setStepStatuses(prev => new Map(prev).set(event.step, 'running'));
      } else if (event.type === 'step-complete') {
        setStepStatuses(prev => new Map(prev).set(event.step, 'complete'));
        if (executionMode === 'step-through') setWaiting(true);
      } else if (event.type === 'step-error') {
        setStepStatuses(prev => new Map(prev).set(event.step, 'error'));
        setWaiting(true);
      } else if (event.type === 'user-created') {
        setCreatedUsers(prev => [...prev, event.user]);
      } else if (event.type === 'context-update') {
        setContext(prev => ({ ...prev, [event.key]: event.value }));
      } else if (event.type === 'monitoring-start') {
        setMonitoring(true);
      } else if (event.type === 'run-complete') {
        setDone(true);
        logDirtyRef.current = true;
        if (quitRequestedRef.current) {
          setTimeout(() => { onQuit(); }, 0);
        }
      }

      const line = eventToLine(event);
      if (line) pendingLinesRef.current.push(line);

      addEntry(event);
    };
    emitter.on('event', handler);
    return () => { emitter.off('event', handler); };
  }, [emitter, executionMode]);

  const menuItems = ['Create another (same settings)', 'New configuration', 'Quit'] as const;

  useInput((input, key) => {
    if (showFlags) {
      if (key.escape || input === 'f') setShowFlags(false);
      return;
    }
    if (input === 'f' && !done) {
      setShowFlags(true);
      return;
    }
    if (done) {
      if (!logsExpanded) {
        if (key.upArrow) setMenuIndex(prev => Math.max(0, prev - 1));
        if (key.downArrow) setMenuIndex(prev => Math.min(menuItems.length - 1, prev + 1));
        if (key.return) {
          if (menuIndex === 0) onCreateAnother();
          else if (menuIndex === 1) onNewConfig();
          else { onQuit(); }
        }
      }
      if (input === 'l') {
        setLogVersion(v => v + 1);
        setLogsExpanded(prev => !prev);
      }
      if (input === 'd') setDetailMode(prev => !prev);
      if (input === 'q') { onQuit(); }
      if (key.escape && logsExpanded) setLogsExpanded(false);
      if (key.tab && !key.shift) {
        const idx = steps.indexOf(viewingStep as Step);
        if (idx < steps.length - 1) setViewingStep(steps[idx + 1]);
      }
      if (key.tab && key.shift) {
        const idx = steps.indexOf(viewingStep as Step);
        if (idx > 0) setViewingStep(steps[idx - 1]);
      }
      if (input === 'a') setViewingStep('_all');
      return;
    }
    if (input === 'd') setDetailMode(prev => !prev);
    if (input === 'l') {
      setLogVersion(v => v + 1);
      setLogsExpanded(prev => !prev);
    }
    if (input === 'q') {
      if (monitoring) {
        quitRequestedRef.current = true;
        onAbortMonitoring();
        return;
      }
      onQuit();
    }
    if (input === 'r' && waiting) { setWaiting(false); onRetry(); }
    if (key.return && waiting) { setWaiting(false); onStepContinue(); }
    if (key.escape) {
      if (logsExpanded) {
        setLogsExpanded(false);
      } else if (executionMode === 'run-all') {
        setWaiting(true);
      }
    }
    if (key.tab && !key.shift) {
      const idx = steps.indexOf(viewingStep as Step);
      if (idx < steps.length - 1) setViewingStep(steps[idx + 1]);
    }
    if (key.tab && key.shift) {
      const idx = steps.indexOf(viewingStep as Step);
      if (idx > 0) setViewingStep(steps[idx - 1]);
    }
    if (input === 'a') setViewingStep('_all');
  });

  const totalLogs = logsByStepRef.current.get('_all')?.length ?? 0;
  const viewingEntries = useMemo(() => {
    void logVersion;
    return (viewingStep === '_all'
      ? logsByStepRef.current.get('_all')
      : logsByStepRef.current.get(viewingStep)) ?? [];
  }, [logVersion, viewingStep]);
  const completedCount = Array.from(stepStatuses.values()).filter(s => s === 'complete').length;
  const elapsedStr = `${Math.floor(elapsed / 1000)}s`;
  const viewLabel = viewingStep === '_all' ? 'All steps' : viewingStep;

  return (
    <Box flexDirection="column">
      {/* Top bar */}
      <Box borderStyle="single" borderColor={COLORS.chrome} paddingX={1}>
        <Text color={COLORS.banner} bold>██ JUMPER</Text>
        <Box flexGrow={1} />
        {done
          ? <Text color={COLORS.stepComplete} bold>✓ Complete · {elapsedStr}</Text>
          : <Text color={COLORS.contextValue}>{platform} · {verticals.join(', ')} · {tier} · {env}</Text>
        }
      </Box>

      {/* Main area */}
      <Box flexDirection="row">
        {/* Left panel: steps + context */}
        <Box flexDirection="column" width={28} borderStyle="single" borderColor={COLORS.chrome} paddingX={1}>
          <Text color={COLORS.dimText} dimColor>STEPS <Text color={COLORS.dimText}>(tab to browse)</Text></Text>
          {steps.map(s => {
            const status = stepStatuses.get(s) ?? 'pending';
            const isViewing = viewingStep === s;
            const color = isViewing ? COLORS.banner
              : status === 'complete' ? COLORS.stepComplete
              : status === 'running' ? COLORS.stepRunning
              : status === 'error' ? COLORS.stepError
              : COLORS.stepPending;
            const stepLogs = logsByStepRef.current.get(s)?.length ?? 0;
            const icon = status === 'complete' ? '✓'
              : status === 'running' ? spinnerChar
              : status === 'error' ? '✗'
              : isViewing ? '►' : '○';
            return (
              <Text key={s} color={color} bold={isViewing}>
                {icon} {s}{stepLogs > 0 ? ` (${stepLogs})` : ''}
              </Text>
            );
          })}
          <Text color={viewingStep === '_all' ? COLORS.banner : COLORS.dimText} bold={viewingStep === '_all'}>
            {viewingStep === '_all' ? '►' : '○'} All steps ({totalLogs})
          </Text>

          <Box marginTop={1} flexDirection="column">
            <Text color={COLORS.dimText} dimColor>CONTEXT</Text>
            {Object.entries(context).filter(([k]) => !k.startsWith('_')).map(([k, v]) => (
              <Text key={k}><Text color={COLORS.dimText}>{k}: </Text><Text color={COLORS.contextValue}>{v}</Text></Text>
            ))}
          </Box>
        </Box>

        {/* Right panel */}
        <Box flexDirection="column" flexGrow={1} borderStyle="single" borderColor={COLORS.chrome} paddingX={1}>
          {done ? (
            <Box flexDirection="column">
              <Text color={COLORS.stepComplete} bold>All done! {completedCount}/{steps.length} steps · {elapsedStr}</Text>
              <Text color={COLORS.dimText}>{platform} · {verticals.join(', ')} · {tier} · {env}</Text>

              {createdUsers.length > 0 && (
                <Box marginTop={1} flexDirection="column">
                  <Text color={COLORS.stepComplete} bold>
                    Created User{createdUsers.length > 1 ? 's' : ''} ({createdUsers.length})
                  </Text>
                  {createdUsers.map((u, i) => (
                    <Box key={i} flexDirection="column" marginTop={i > 0 ? 1 : 0}>
                      {createdUsers.length > 1 && (
                        <Text color={COLORS.dimText}>  ── #{u.runIndex}{u.vertical ? ` · ${u.vertical}` : ''} ──</Text>
                      )}
                      <Text>  <Text color={COLORS.dimText}>Email:</Text>     <Text color={COLORS.contextValue} bold>{u.email}</Text></Text>
                      {u.password && <Text>  <Text color={COLORS.dimText}>Password:</Text>  <Text color={COLORS.contextValue} bold>{u.password}</Text></Text>}
                      {u.memberId && <Text>  <Text color={COLORS.dimText}>MemberId:</Text>  <Text color={COLORS.contextValue} bold>{u.memberId}</Text></Text>}
                      {u.uuid && <Text>  <Text color={COLORS.dimText}>UUID:</Text>      <Text color={COLORS.contextValue} bold>{u.uuid}</Text></Text>}
                      {u.vertical && createdUsers.length === 1 && (
                        <Text>  <Text color={COLORS.dimText}>Vertical:</Text>  <Text color={COLORS.contextValue}>{u.vertical}</Text></Text>
                      )}
                    </Box>
                  ))}
                </Box>
              )}

              <Box marginTop={1} flexDirection="column">
                <Text color={COLORS.stepRunning} bold>What next?</Text>
                {menuItems.map((label, i) => (
                  <Text key={label} color={i === menuIndex ? COLORS.banner : COLORS.dimText} bold={i === menuIndex}>
                    {i === menuIndex ? '❯ ' : '  '}{label}
                  </Text>
                ))}
              </Box>
            </Box>
          ) : monitoring ? (
            <Box flexDirection="column">
              <Text color={COLORS.stepRunning} bold>
                {spinnerChar} Monitoring browser...
              </Text>
              <Text color={COLORS.dimText}>
                Navigate the browser — activity appears in the logs below.
              </Text>
              <Text color={COLORS.dimText}>
                Close the browser or press q to finish.
              </Text>

              {createdUsers.length > 0 && (
                <Box marginTop={1} flexDirection="column">
                  <Text color={COLORS.stepComplete} bold>
                    Created User{createdUsers.length > 1 ? 's' : ''} ({createdUsers.length})
                  </Text>
                  {createdUsers.map((u, i) => (
                    <Box key={i} flexDirection="column" marginTop={i > 0 ? 1 : 0}>
                      {createdUsers.length > 1 && (
                        <Text color={COLORS.dimText}>  ── #{u.runIndex}{u.vertical ? ` · ${u.vertical}` : ''} ──</Text>
                      )}
                      <Text>  <Text color={COLORS.dimText}>Email:</Text>     <Text color={COLORS.contextValue} bold>{u.email}</Text></Text>
                      {u.password && <Text>  <Text color={COLORS.dimText}>Password:</Text>  <Text color={COLORS.contextValue} bold>{u.password}</Text></Text>}
                      {u.memberId && <Text>  <Text color={COLORS.dimText}>MemberId:</Text>  <Text color={COLORS.contextValue} bold>{u.memberId}</Text></Text>}
                      {u.uuid && <Text>  <Text color={COLORS.dimText}>UUID:</Text>      <Text color={COLORS.contextValue} bold>{u.uuid}</Text></Text>}
                    </Box>
                  ))}
                </Box>
              )}

              {!logsExpanded && recentLines.length > 0 && (
                <Box marginTop={1} flexDirection="column">
                  {recentLines.map((line, i) => (
                    <Text key={i} color={i === recentLines.length - 1 ? COLORS.systemEvent : COLORS.dimText}>{line}</Text>
                  ))}
                </Box>
              )}
            </Box>
          ) : (
            <Box flexDirection="column">
              <Text color={COLORS.stepRunning} bold>
                {stepStatuses.get(viewingStep) === 'running' ? `${spinnerChar} ` : ''}{viewLabel}
              </Text>
              <Text color={COLORS.dimText}>
                {viewingStep === '_all' ? 'Showing all logs' : STEP_DESCRIPTIONS[viewingStep as Step] ?? ''}
              </Text>
              {!logsExpanded && recentLines.length > 0 && (
                <Box marginTop={1} flexDirection="column">
                  {recentLines.map((line, i) => (
                    <Text key={i} color={i === recentLines.length - 1 ? COLORS.systemEvent : COLORS.dimText}>{line}</Text>
                  ))}
                </Box>
              )}
            </Box>
          )}

          {/* Log drawer — always present */}
          <Box flexDirection="column" borderStyle="single" borderColor={COLORS.chrome} paddingX={1} marginTop={1}>
            <Text color={COLORS.dimText}>
              {logsExpanded ? '▾' : '▸'} Logs: {viewLabel} ({viewingEntries.length}){!logsExpanded && ' — press l to expand'}
            </Text>
            {logsExpanded && (
              <LogPanel entries={viewingEntries} detailMode={detailMode} />
            )}
          </Box>
        </Box>
      </Box>

      {showFlags && (
        <Box borderStyle="single" borderColor={COLORS.chrome}>
          <FlagBrowser env={env} onClose={() => setShowFlags(false)} />
        </Box>
      )}

      {/* Bottom bar */}
      <Box borderStyle="single" borderColor={COLORS.chrome} paddingX={1}>
        {done ? (
          <Text color={COLORS.stepComplete}>✓ {completedCount}/{steps.length} steps</Text>
        ) : monitoring ? (
          <Text color={COLORS.stepRunning}>{spinnerChar} Monitoring</Text>
        ) : (
          <Text color={COLORS.stepRunning}>{spinnerChar} {currentStep}</Text>
        )}
        <Box flexGrow={1} />
        {done ? (
          <Text color={COLORS.dimText}>↑↓ select · enter: confirm · l: logs · tab: browse steps · q: quit</Text>
        ) : monitoring ? (
          <Text color={COLORS.dimText}>l: {logsExpanded ? 'hide' : 'show'} logs{logsExpanded ? ' · d: detail' : ''} · tab: browse steps · q: finish</Text>
        ) : waiting ? (
          <Text color={COLORS.stepRunning}>
            {stepStatuses.get(currentStep) === 'error' ? 'r: retry · q: quit' : 'enter: continue'}
          </Text>
        ) : (
          <Text color={COLORS.dimText}>
            tab: browse steps · a: all · l: {logsExpanded ? 'hide' : 'show'} logs{logsExpanded ? ' · d: detail' : ''} · f: flags · q: quit
          </Text>
        )}
        <Text color={COLORS.dimText}> · {completedCount}/{steps.length} · {elapsedStr}</Text>
      </Box>
    </Box>
  );
}
