import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCell } from './sheet-formulas.js';

test('sheet formulas calculate arithmetic, references, and ranges', () => {
  const cells = { A1: '2', A2: '3', B1: '=A1+A2*4', B2: '=SUM(A1:A2)', B3: '=AVERAGE(A1:A2)' };
  assert.equal(evaluateCell('B1', cells), '14');
  assert.equal(evaluateCell('B2', cells), '5');
  assert.equal(evaluateCell('B3', cells), '2.5');
});

test('sheet formulas reject cycles and invalid expressions without running code', () => {
  assert.equal(evaluateCell('A1', { A1: '=B1', B1: '=A1' }), '#CYCLE!');
  assert.equal(evaluateCell('A1', { A1: '=window.alert(1)' }), '#ERROR!');
  assert.equal(evaluateCell('A1', { A1: '=1/0' }), '#DIV/0!');
});
