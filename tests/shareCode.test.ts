import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeShareCode, encodeShareCode, type SharedTeamSnapshot } from '../src/lib/shareCode';

const snapshot: SharedTeamSnapshot = {
  version: 1,
  formation: '4-3-3',
  mentality: 'Balanced',
  blindMode: false,
  captainId: 'gs7_00',
  squadName: 'Şampiyonların Rüyası',
  playerIds: ['gs1_00', 'gs7_00', null],
};

test('round-trips Turkish text with a URL-safe code', () => {
  const code = encodeShareCode(snapshot);

  assert.match(code, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(decodeShareCode(code), {
    ...snapshot,
    playerIds: [...snapshot.playerIds, ...Array(8).fill(null)],
  });
});

test('keeps legacy Latin-1 share links readable', () => {
  const legacySnapshot = { ...snapshot, squadName: 'Üç Büyükler' };
  const legacyCode = btoa(JSON.stringify(legacySnapshot))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

  assert.equal(decodeShareCode(legacyCode)?.squadName, legacySnapshot.squadName);
});

test('round-trips a version 2 competition selection', () => {
  const modernSnapshot: SharedTeamSnapshot = {
    ...snapshot,
    version: 2,
    competitionId: 'champions-league',
  };

  assert.equal(decodeShareCode(encodeShareCode(modernSnapshot))?.competitionId, 'champions-league');
});

test('rejects unsupported or malformed payloads', () => {
  const unsupported = {
    ...snapshot,
    formation: '1-1-8',
  };
  const unsupportedCode = encodeShareCode(unsupported as SharedTeamSnapshot);

  assert.equal(decodeShareCode(unsupportedCode), null);
  assert.equal(decodeShareCode('not+url-safe'), null);
  assert.equal(decodeShareCode(''), null);
});
