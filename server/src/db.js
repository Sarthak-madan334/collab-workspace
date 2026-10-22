import { MongoClient } from 'mongodb';

export async function connectDatabase(config) {
  const client = new MongoClient(config.mongoUri, { maxPoolSize: 20, serverSelectionTimeoutMS: 10000 });
  try {
    await client.connect();
    const db = client.db(config.dbName);
    await db.command({ ping: 1 });
    await Promise.all([
      db.collection('users').createIndex({ emailNormalized: 1 }, { unique: true }),
      db.collection('users').createIndex({ googleSub: 1 }, { unique: true, partialFilterExpression: { googleSub: { $type: 'string' } } }),
      db.collection('users').createIndex({ githubId: 1 }, { unique: true, partialFilterExpression: { githubId: { $type: 'string' } } }),
      db.collection('sessions').createIndex({ tokenHash: 1 }, { unique: true }),
      db.collection('sessions').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      db.collection('sessions').createIndex({ userId: 1 }),
      db.collection('rooms').createIndex({ inviteCode: 1 }, { unique: true }),
      db.collection('rooms').createIndex({ ownerId: 1 }),
      db.collection('memberships').createIndex({ roomId: 1, userId: 1 }, { unique: true }),
      db.collection('memberships').createIndex({ userId: 1, joinedAt: -1, _id: -1 }),
      db.collection('memberships').createIndex({ userId: 1, kind: 1, joinedAt: -1 }),
      db.collection('notes').createIndex({ roomId: 1 }, { unique: true }),
      db.collection('versions').createIndex({ roomId: 1, revision: -1 }, { unique: true }),
      db.collection('versions').createIndex({ roomId: 1, operationId: 1 }, { unique: true }),
      db.collection('files').createIndex({ roomId: 1, updatedAt: -1 }),
      db.collection('fileOperations').createIndex({ fileId: 1, operationId: 1 }, { unique: true }),
      db.collection('fileVersions').createIndex({ fileId: 1, revision: -1 }, { unique: true }),
      db.collection('fileVersions').createIndex({ fileId: 1, operationId: 1 }, { unique: true }),
      db.collection('fileAssignments').createIndex({ fileId: 1, areaId: 1 }, { unique: true }),
    ]);
    return { client, db };
  } catch (err) {
    await client.close().catch(() => {});
    throw err;
  }
}

export async function transaction(client, task, attempts = 4) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const session = client.startSession();
    try {
      session.startTransaction({ readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
      const result = await task(session);
      for (let commitAttempt = 0; commitAttempt < attempts; commitAttempt += 1) {
        try {
          await session.commitTransaction();
          break;
        } catch (err) {
          if (!err?.hasErrorLabel?.('UnknownTransactionCommitResult') || commitAttempt === attempts - 1) throw err;
          await new Promise((resolve) => setTimeout(resolve, 30 * 2 ** commitAttempt + Math.floor(Math.random() * 20)));
        }
      }
      return result;
    } catch (err) {
      if (!err?.hasErrorLabel?.('UnknownTransactionCommitResult') && session.inTransaction()) await session.abortTransaction().catch(() => {});
      const retryable = err?.hasErrorLabel?.('TransientTransactionError') && !err?.hasErrorLabel?.('UnknownTransactionCommitResult');
      if (!retryable || attempt === attempts - 1) throw err;
      await new Promise((resolve) => setTimeout(resolve, 30 * 2 ** attempt + Math.floor(Math.random() * 20)));
    } finally {
      await session.endSession();
    }
  }
}
