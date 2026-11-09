const { test } = require('node:test');
const assert = require('node:assert');
const { RequestQueue } = require('../src/utils/requestQueue');

test('RequestQueue enforces >= 1100ms spacing across 5 simultaneous requests', async () => {
  const queue = new RequestQueue(1100, 'TestQueue');
  const executionStartTimes = [];

  const task = (id) => async () => {
    executionStartTimes.push(Date.now());
    return `result-${id}`;
  };

  // Launch 5 concurrent calls simultaneously
  const promises = [1, 2, 3, 4, 5].map(id => queue.enqueue(task(id)));
  const results = await Promise.all(promises);

  assert.deepStrictEqual(results, ['result-1', 'result-2', 'result-3', 'result-4', 'result-5']);
  assert.strictEqual(executionStartTimes.length, 5);

  for (let i = 1; i < executionStartTimes.length; i++) {
    const spacing = executionStartTimes[i] - executionStartTimes[i - 1];
    assert.ok(
      spacing >= 1050, // Allowing minor 50ms timer jitter
      `Expected spacing >= 1050ms between request ${i} and ${i + 1}, got ${spacing}ms`
    );
  }
});

test('RequestQueue rejects caller aborted while waiting in queue without stalling subsequent requests', async () => {
  const queue = new RequestQueue(50, 'AbortTestQueue');
  const executed = [];

  // Task 1: Runs immediately
  const p1 = queue.enqueue(async () => {
    await new Promise(r => setTimeout(r, 60));
    executed.push(1);
    return 'p1';
  });

  // Task 2: Aborted while waiting in queue
  const ac2 = new AbortController();
  const p2 = queue.enqueue(async () => {
    executed.push(2);
    return 'p2';
  }, { signal: ac2.signal });

  const p2Expect = assert.rejects(p2, { name: 'AbortError' });
  // Abort task 2 while it is waiting in queue behind task 1
  ac2.abort();

  // Task 3: Normal task that should run after task 1
  const p3 = queue.enqueue(async () => {
    executed.push(3);
    return 'p3';
  });

  const r1 = await p1;
  assert.strictEqual(r1, 'p1');

  await p2Expect;

  const r3 = await p3;
  assert.strictEqual(r3, 'p3');

  // Verify task 2 was never executed
  assert.deepStrictEqual(executed, [1, 3]);
});

test('RequestQueue does not stall when a task throws an error or times out', async () => {
  const queue = new RequestQueue(30, 'ErrorTestQueue');

  // Task 1: Fails with Error
  const p1 = queue.enqueue(async () => {
    throw new Error('Simulated upstream network failure');
  });

  // Task 2: Succeeds
  const p2 = queue.enqueue(async () => {
    return 'success-after-error';
  });

  await assert.rejects(p1, { message: 'Simulated upstream network failure' });
  const r2 = await p2;
  assert.strictEqual(r2, 'success-after-error');
});
