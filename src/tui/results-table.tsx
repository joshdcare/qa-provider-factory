import React from 'react';
import { Box, Text } from 'ink';
import { COLORS } from './theme.js';

export interface BatchResult {
  email: string;
  password: string;
  memberId: string;
  uuid: string;
  vertical: string;
  tier: string;
}

interface ResultsTableProps {
  results: BatchResult[];
  total: number;
  failed: number;
}

export function ResultsTable({ results, total, failed }: ResultsTableProps): React.ReactElement {
  return (
    <Box flexDirection="column" paddingX={1}>
      <Text color={COLORS.stepRunning} bold>
        Batch Results: {results.length}/{total} created
        {failed > 0 ? <Text color={COLORS.stepError}> ({failed} failed)</Text> : ''}
      </Text>
      <Box marginTop={1} flexDirection="column">
        <Text color={COLORS.dimText}>
          {'Email'.padEnd(30)} {'MemberId'.padEnd(10)} {'Vertical'.padEnd(14)} Tier
        </Text>
        {results.map((r, i) => (
          <Text key={i}>
            <Text color={COLORS.contextValue}>{r.email.padEnd(30)}</Text>
            {' '}
            <Text>{r.memberId.padEnd(10)}</Text>
            {' '}
            <Text>{r.vertical.padEnd(14)}</Text>
            {' '}
            <Text>{r.tier}</Text>
          </Text>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text color={COLORS.dimText}>Press t to close this view</Text>
      </Box>
    </Box>
  );
}
