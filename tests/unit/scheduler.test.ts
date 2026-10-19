import { FixedStepScheduler } from '../../src/simulation/scheduler';

function harness(speed: number, maxStepsPerFrame = 60) {
  let steps = 0;
  let frames = 0;
  const queue: Array<(t: number) => void> = [];
  const scheduler = new FixedStepScheduler(
    {
      step: () => {
        steps += 1;
        return true;
      },
      onFrame: () => {
        frames += 1;
      },
      speed,
      maxStepsPerFrame
    },
    0.01,
    {
      now: () => 0,
      requestFrame: (cb) => {
        queue.push(cb);
        return queue.length;
      },
      cancelFrame: () => {
        queue.length = 0;
      }
    }
  );
  const frame = (t: number) => {
    const cb = queue.shift();
    if (!cb) throw new Error('no frame scheduled');
    cb(t);
  };
  return { scheduler, frame, get steps() { return steps; }, get frames() { return frames; } };
}

describe('FixedStepScheduler', () => {
  test('advances by fixed steps derived from wall clock time', () => {
    const h = harness(1);
    h.scheduler.start();
    h.frame(0);
    expect(h.steps).toBe(0);
    h.frame(16.7);
    expect(h.steps).toBe(1);
    h.frame(33.4);
    // 33.4 ms of wall clock is 3 full 10 ms simulation steps
    expect(h.steps).toBe(3);
  });

  test('speed multiplies the number of steps, never the step size', () => {
    const h = harness(5);
    h.scheduler.start();
    h.frame(0);
    h.frame(20);
    // 20ms * 5 = 100ms of simulation -> 10 steps of 10ms
    expect(h.steps).toBe(10);
  });

  test('a throttled frame is clamped instead of replaying the whole gap', () => {
    const h = harness(1);
    h.scheduler.start();
    h.frame(0);
    h.frame(5000);
    // 250ms clamp -> 25 steps
    expect(h.steps).toBe(25);
  });

  test('the per-frame step budget drops backlog and never blocks the UI', () => {
    const h = harness(1, 10);
    h.scheduler.start();
    h.frame(0);
    h.frame(1000);
    expect(h.steps).toBe(10);
    expect(h.scheduler.droppedFrames).toBe(1);
  });

  test('stop prevents further steps', () => {
    const h = harness(1);
    h.scheduler.start();
    h.frame(0);
    h.frame(16.7);
    h.scheduler.stop();
    expect(h.steps).toBe(1);
    expect(() => h.frame(33)).toThrow();
  });

  test('a step callback returning false stops the loop', () => {
    let steps = 0;
    const queue: Array<(t: number) => void> = [];
    const scheduler = new FixedStepScheduler(
      {
        step: () => {
          steps += 1;
          return steps < 3;
        },
        onFrame: () => undefined,
        speed: 1
      },
      0.01,
      { now: () => 0, requestFrame: (cb) => { queue.push(cb); return 1; }, cancelFrame: () => undefined }
    );
    scheduler.start();
    queue.shift()?.(0);
    queue.shift()?.(100);
    expect(steps).toBe(3);
    expect(scheduler.isRunning).toBe(false);
  });
});
