/**
 * MongoDB transaction helper (code-audit finding H4).
 *
 * Multi-document counter updates (e.g. deleting a lecture decrements the
 * series + sheikh lectureCount then deletes the doc) were non-atomic and drifted
 * on partial failure. This wraps related writes in a transaction.
 *
 * Transactions require a replica set / mongos. Atlas provides this; a standalone
 * mongod (local dev, single-node docker, MongoMemoryServer in tests) does not.
 * We detect support once and gracefully fall back to non-transactional execution
 * there — preserving the prior behavior instead of crashing.
 *
 * Usage:
 *   await withTransaction(async (session) => {
 *     await A.updateOne(q, u, { session });   // session is null on standalone
 *     await B.deleteOne(q, { session });
 *   });
 */

const mongoose = require('mongoose');

let supportsTransactions = null; // null = not yet detected

/**
 * Detect whether the current topology supports transactions (replica set or
 * sharded cluster). Caches the result. Call once after the DB connects.
 */
async function detectTransactionSupport() {
  try {
    const admin = mongoose.connection.db.admin();
    const info = await admin.command({ hello: 1 });
    // setName => replica set; msg 'isdbgrid' => mongos (sharded)
    supportsTransactions = Boolean(info.setName || info.msg === 'isdbgrid');
  } catch (e) {
    supportsTransactions = false;
  }
  return supportsTransactions;
}

/**
 * Run `fn` inside a transaction when supported, otherwise run it directly.
 * @param {(session: import('mongoose').ClientSession|null) => Promise<any>} fn
 * @returns {Promise<any>}
 */
async function withTransaction(fn) {
  if (supportsTransactions === null) {
    await detectTransactionSupport();
  }

  if (!supportsTransactions) {
    // Standalone topology: no atomicity available, run sequentially (legacy behavior)
    return fn(null);
  }

  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    session.endSession();
  }
}

module.exports = { withTransaction, detectTransactionSupport };
