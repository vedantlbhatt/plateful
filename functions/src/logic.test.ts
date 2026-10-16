import assert from 'node:assert/strict';
import { test } from 'node:test';
import { alertBody, alertBuildings } from './config';
import { pickNextStudent } from './recipients';

test('alert text matches "[Food], [Building room], [N] plates left, [tags]"', () => {
  assert.equal(
    alertBody({ food: 'Chipotle burritos', building: 'klaus', room: '1116', platesLeft: 12, tags: ['vegetarian', 'halal'] }),
    'Chipotle burritos, Klaus 1116, 12 plates left, Vegetarian, Halal',
  );
  assert.equal(alertBody({ building: 'coc', platesLeft: 1 }), 'Free food, College of Computing, 1 plate left');
});

test('adjacency is symmetric', () => {
  assert.ok(alertBuildings('klaus').includes('coc'));
  assert.ok(alertBuildings('coc').includes('klaus'));
  assert.equal(alertBuildings('klaus')[0], 'klaus');
});

test('next student prefers the exact building, skips claimants and token-less users', () => {
  const s = (uid: string, buildings: string[], createdAtMs: number, pushToken: string | null = 'tok') => ({ uid, buildings, createdAtMs, pushToken });
  const pick = pickNextStudent(
    [s('a', ['coc'], 1), s('b', ['klaus'], 3), s('c', ['klaus'], 2), s('d', ['klaus'], 0, null)],
    'klaus',
    new Set(['c']),
  );
  assert.equal(pick?.uid, 'b');
  assert.equal(pickNextStudent([s('a', ['coc'], 1)], 'klaus', new Set(['a'])), null);
});
