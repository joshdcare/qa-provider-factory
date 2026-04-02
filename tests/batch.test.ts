import { describe, it, expect, afterEach } from 'vitest';
import { unlinkSync, existsSync, readFileSync } from 'node:fs';
import { formatResultsTable, writeCsv, type BatchResult } from '../src/batch.js';

const sampleResults: BatchResult[] = [
  { email: 'prov-aaa@care.com', password: 'letmein1', memberId: '1001', uuid: 'uuid-1', vertical: 'CHILD_CARE', tier: 'premium' },
  { email: 'prov-bbb@care.com', password: 'letmein1', memberId: '1002', uuid: 'uuid-2', vertical: 'CHILD_CARE', tier: 'premium' },
  { email: 'prov-ccc@care.com', password: 'letmein1', memberId: '1003', uuid: '', vertical: 'PET_CARE', tier: 'basic' },
];

describe('formatResultsTable', () => {
  it('returns "(no results)" for empty array', () => {
    expect(formatResultsTable([])).toBe('  (no results)');
  });

  it('formats a table with headers and rows', () => {
    const table = formatResultsTable(sampleResults);
    expect(table).toContain('#');
    expect(table).toContain('Email');
    expect(table).toContain('MemberId');
    expect(table).toContain('prov-aaa@care.com');
    expect(table).toContain('prov-bbb@care.com');
    expect(table).toContain('prov-ccc@care.com');
  });

  it('shows (unknown) for missing UUID', () => {
    const table = formatResultsTable(sampleResults);
    expect(table).toContain('(unknown)');
  });

  it('numbers rows starting from 1', () => {
    const table = formatResultsTable(sampleResults);
    expect(table).toContain('1');
    expect(table).toContain('2');
    expect(table).toContain('3');
  });
});

describe('writeCsv', () => {
  const written: string[] = [];

  afterEach(() => {
    for (const f of written) {
      if (existsSync(f)) unlinkSync(f);
    }
    written.length = 0;
  });

  it('writes a CSV file and returns the filename', () => {
    const filename = writeCsv(sampleResults, 'fully-enrolled', 'mobile');
    written.push(filename);

    expect(filename).toMatch(/^batch-\d{8}-\d{4}\.csv$/);
    expect(existsSync(filename)).toBe(true);
  });

  it('CSV contains headers and all rows', () => {
    const filename = writeCsv(sampleResults, 'fully-enrolled', 'mobile');
    written.push(filename);

    const content = readFileSync(filename, 'utf-8');
    const lines = content.trim().split('\n');
    expect(lines[0]).toBe('#,Email,Password,MemberId,UUID,Vertical,Tier,Step,Platform');
    expect(lines).toHaveLength(4); // header + 3 rows
    expect(lines[1]).toContain('prov-aaa@care.com');
    expect(lines[3]).toContain('fully-enrolled');
    expect(lines[3]).toContain('mobile');
  });
});
