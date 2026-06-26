import assert from 'node:assert/strict';
import test from 'node:test';
import { pickNextDraftSquad, type DraftSquadPick } from '../src/lib/draftTeamRotation';

interface TestSquad {
  id: string;
}

const createSquads = (count: number) => (
  Array.from({ length: count }, (_, index) => ({ id: `team-${index + 1}` }))
);

test('draft rotation avoids repeats before the pool is exhausted', () => {
  const squads = createSquads(18);
  let usedTeamIds: string[] = [];
  const pickedIds: string[] = [];

  for (let index = 0; index < 10; index += 1) {
    const pick = pickNextDraftSquad(squads, usedTeamIds, pickedIds.at(-1) ?? null, () => 0);
    assert.ok(pick.squad);
    pickedIds.push(pick.squad.id);
    usedTeamIds = pick.usedTeamIds;
  }

  assert.equal(new Set(pickedIds).size, 10);
});

test('draft rotation does not repeat any team until every team has appeared', () => {
  const squads = createSquads(18);
  let usedTeamIds: string[] = [];
  const pickedIds: string[] = [];

  for (let index = 0; index < squads.length; index += 1) {
    const pick = pickNextDraftSquad(squads, usedTeamIds, pickedIds.at(-1) ?? null, () => 0);
    assert.ok(pick.squad);
    pickedIds.push(pick.squad.id);
    usedTeamIds = pick.usedTeamIds;
  }

  assert.equal(new Set(pickedIds).size, squads.length);
  assert.deepEqual(new Set(usedTeamIds), new Set(squads.map((squad) => squad.id)));
});

test('draft rotation starts a new cycle after all teams are seen', () => {
  const squads = createSquads(18);
  let usedTeamIds: string[] = [];
  let lastPickedId: string | null = null;

  for (let index = 0; index < squads.length; index += 1) {
    const pick: DraftSquadPick<TestSquad> = pickNextDraftSquad(squads, usedTeamIds, lastPickedId, () => 0);
    assert.ok(pick.squad);
    lastPickedId = pick.squad.id;
    usedTeamIds = pick.usedTeamIds;
  }

  const nextPick = pickNextDraftSquad(squads, usedTeamIds, lastPickedId, () => 0);
  assert.ok(nextPick.squad);
  assert.equal(nextPick.usedTeamIds.length, 1);
  assert.ok(squads.some((squad) => squad.id === nextPick.squad?.id));
});

test('draft rotation uses the same no-repeat rule for auto roll state updates', () => {
  const squads = createSquads(18);
  let autoUsedTeamIds: string[] = [];
  let lastPickedId: string | null = null;
  const pickedIds: string[] = [];

  for (let index = 0; index < 10; index += 1) {
    const pick: DraftSquadPick<TestSquad> = pickNextDraftSquad(squads, autoUsedTeamIds, lastPickedId, () => 0);
    assert.ok(pick.squad);
    pickedIds.push(pick.squad.id);
    lastPickedId = pick.squad.id;
    autoUsedTeamIds = pick.usedTeamIds;
  }

  assert.equal(new Set(pickedIds).size, 10);
});
