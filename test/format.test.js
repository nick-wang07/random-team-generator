import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatTeams, isWalt } from '../src/format.js';

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

const waltRoster = [
  { id: 'a', name: 'Nick' },
  { id: 'b', name: 'Walter' },
  { id: 'c', name: 'Ali' },
  { id: 'd', name: 'Sam' },
];

test('recognises every spelling of Walt, and nobody else', () => {
  for (const name of ['Walt', 'Walter', 'Walker', 'Walteezer', 'Waltezzer', 'walt', ' WALTER ']) {
    assert.equal(isWalt(name), true, `${name} should count as a Walt`);
  }
  for (const name of ['Nick', 'Sam', 'Ali', 'Wanda', 'Wallace', 'Al Walt', '', null]) {
    assert.equal(isWalt(name), false, `${name} should not count as a Walt`);
  }
});

test('teammates of a Walt are marked, and the Walt is spared', () => {
  const teams = [
    { name: 'Team A', members: ['a', 'b'] },
    { name: 'Team B', members: ['c', 'd'] },
  ];
  assert.equal(formatTeams(teams, waltRoster), [
    '**Team A**',
    '- Nick 😭',
    '- Walter',
    '',
    '**Team B**',
    '- Ali',
    '- Sam',
  ].join('\n'));
});

test('a Walt alone on a team commiserates with nobody', () => {
  const teams = [{ name: 'Team A', members: ['b'] }];
  assert.equal(formatTeams(teams, waltRoster), '**Team A**\n- Walter');
});

test('two Walts on one team spare each other', () => {
  const roster = [...waltRoster, { id: 'e', name: 'Walker' }];
  const teams = [{ name: 'Team A', members: ['b', 'e', 'a'] }];
  assert.equal(formatTeams(teams, roster), '**Team A**\n- Walter\n- Walker\n- Nick 😭');
});
