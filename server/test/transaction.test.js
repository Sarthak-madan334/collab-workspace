import test from 'node:test';
import assert from 'node:assert/strict';
import { transaction } from '../src/db.js';

const labeled = (label) => Object.assign(new Error(label), { hasErrorLabel: (value) => value === label });

test('unknown commit outcome retries commit without rerunning room creation', async () => {
  let tasks = 0;
  let commits = 0;
  const session = {
    startTransaction() {},
    async commitTransaction() { commits += 1; if (commits === 1) throw labeled('UnknownTransactionCommitResult'); },
    inTransaction: () => false,
    async endSession() {},
  };
  const result = await transaction({ startSession: () => session }, async () => { tasks += 1; return 'created'; }, 2);
  assert.equal(result, 'created');
  assert.equal(tasks, 1);
  assert.equal(commits, 2);
});

test('transient work error retries the whole transaction', async () => {
  let tasks = 0;
  let sessions = 0;
  const client = { startSession: () => {
    sessions += 1;
    return { startTransaction() {}, async commitTransaction() {}, inTransaction: () => true, async abortTransaction() {}, async endSession() {} };
  } };
  await transaction(client, async () => { tasks += 1; if (tasks === 1) throw labeled('TransientTransactionError'); }, 2);
  assert.equal(tasks, 2);
  assert.equal(sessions, 2);
});
