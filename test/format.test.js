import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatTeams } from '../src/format.js';

const roster = [
  { id: 'a', name: 'Nick' },
  { id: 'b', name: 'Sam' },
  { id: 'c', name: 'Ali' },
];

test('formats each team as a heading with its members listed below', () => {
  const teams = [
    { name: 'Team A', members: ['a', 'c'] },
    { name: 'Team B', members: ['b'] },
  ];
  assert.equal(formatTeams(teams, roster), [
    '**Team A**',
    '- Nick',
    '- Ali',
    '',
    '**Team B**',
    '- Sam',
  ].join('\n'));
});

test('an empty team still gets a heading', () => {
  assert.equal(formatTeams([{ name: 'Team A', members: [] }], roster), '**Team A**');
});

test('an unknown id falls back to a placeholder rather than crashing', () => {
  const teams = [{ name: 'Team A', members: ['ghost'] }];
  assert.equal(formatTeams(teams, roster), '**Team A**\n- (unknown)');
});
