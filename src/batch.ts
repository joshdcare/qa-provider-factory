import { writeFileSync } from 'node:fs';

export interface BatchResult {
  email: string;
  password: string;
  memberId: string;
  uuid: string;
  vertical: string;
  tier: string;
}

export function formatResultsTable(results: BatchResult[]): string {
  if (results.length === 0) return '  (no results)';

  const headers = ['#', 'Email', 'Password', 'MemberId', 'UUID', 'Vertical', 'Tier'];
  const rows = results.map((r, i) => [
    String(i + 1),
    r.email,
    r.password,
    r.memberId,
    r.uuid || '(unknown)',
    r.vertical,
    r.tier,
  ]);

  const widths = headers.map((h, col) =>
    Math.max(h.length, ...rows.map(r => r[col].length))
  );

  const pad = (s: string, w: number) => s.padEnd(w);
  const sep = widths.map(w => '─'.repeat(w)).join('──');

  const lines = [
    '  ' + headers.map((h, i) => pad(h, widths[i])).join('  '),
    '  ' + sep,
    ...rows.map(r => '  ' + r.map((c, i) => pad(c, widths[i])).join('  ')),
  ];

  return lines.join('\n');
}

export function writeCsv(results: BatchResult[], step: string, platform: string): string {
  const now = new Date();
  const ts = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    '-',
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
  ].join('');

  const filename = `batch-${ts}.csv`;

  const headers = ['#', 'Email', 'Password', 'MemberId', 'UUID', 'Vertical', 'Tier', 'Step', 'Platform'];
  const rows = results.map((r, i) => [
    String(i + 1),
    r.email,
    r.password,
    r.memberId,
    r.uuid || '',
    r.vertical,
    r.tier,
    step,
    platform,
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(r => r.map(c => `"${c}"`).join(',')),
  ].join('\n');

  writeFileSync(filename, csvContent + '\n');
  return filename;
}
