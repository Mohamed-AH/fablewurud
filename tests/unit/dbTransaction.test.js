/**
 * Unit tests for the transaction helper (code-audit finding H4).
 *
 * Exercises the standalone-topology fallback path — the branch that runs in
 * dev/test where transactions aren't supported. (Atlas replica-set behavior is
 * covered by the integration suite against a real cluster.)
 */

const { withTransaction, detectTransactionSupport } = require('../../utils/dbTransaction');

describe('dbTransaction helper', () => {
  it('detectTransactionSupport returns false with no live connection', async () => {
    // No mongoose connection open in this unit context → admin command throws → false
    const supported = await detectTransactionSupport();
    expect(supported).toBe(false);
  });

  it('withTransaction runs the callback with a null session on standalone', async () => {
    let received = 'unset';
    const result = await withTransaction(async (session) => {
      received = session;
      return 42;
    });
    expect(received).toBeNull();      // no session on standalone
    expect(result).toBe(42);          // returns the callback result
  });

  it('withTransaction propagates errors from the callback', async () => {
    await expect(
      withTransaction(async () => { throw new Error('boom'); })
    ).rejects.toThrow('boom');
  });

  it('withTransaction runs each set of writes (callback invoked)', async () => {
    const calls = [];
    await withTransaction(async () => { calls.push('a'); });
    await withTransaction(async () => { calls.push('b'); });
    expect(calls).toEqual(['a', 'b']);
  });
});
