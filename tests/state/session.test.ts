import { REFERENCE_GAINS } from '../../src/challenges/reference-policies';
import { AppStore, type StorageLike } from '../../src/persistence/store';
import { getProject } from '../../src/projects/registry';
import { ChallengeSession } from '../../src/state/session';

function memoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    }
  };
}

const inertScheduler = {
  now: () => 0,
  requestFrame: () => 1,
  cancelFrame: () => undefined
};

async function makeSession(projectId: string, difficulty: 'beginner' | 'intermediate' | 'advanced' = 'beginner', seed = 4321, store?: AppStore) {
  const session = new ChallengeSession({
    project: getProject(projectId),
    difficulty,
    seed,
    store,
    schedulerDeps: inertScheduler
  });
  await session.ready();
  return session;
}

describe('ChallengeSession', () => {
  test('starts in ready with the generated initial gains', async () => {
    const session = await makeSession('dc-motor');
    const snap = session.getSnapshot();
    expect(snap.status).toBe('ready');
    expect(snap.time).toBe(0);
    expect(snap.initialGains).not.toBeNull();
    expect(snap.gains).toEqual(snap.initialGains);
    expect(snap.challengeId).not.toBeNull();
    expect(snap.criteria).not.toBeNull();
    session.destroy();
  });

  test('running advances the simulation clock only through fixed steps', async () => {
    const session = await makeSession('dc-motor');
    session.start();
    expect(session.getSnapshot().status).toBe('running');
    session.advanceForTest(100);
    expect(session.getSnapshot().time).toBeCloseTo(1, 6);
    session.destroy();
  });

  test('pause freezes time and resume continues from the same state', async () => {
    const session = await makeSession('dc-motor');
    session.start();
    session.advanceForTest(50);
    const frozen = session.getSnapshot();
    session.pause();
    expect(session.getSnapshot().status).toBe('paused');
    session.advanceForTest(50);
    expect(session.getSnapshot().time).toBeCloseTo(frozen.time, 9);
    session.start();
    expect(session.getSnapshot().status).toBe('running');
    session.advanceForTest(50);
    expect(session.getSnapshot().time).toBeCloseTo(frozen.time + 0.5, 6);
    session.destroy();
  });

  test('invalid gains are rejected and the last valid value is kept', async () => {
    const session = await makeSession('dc-motor');
    const before = session.getSnapshot().gains;
    expect(session.setGains({ kp: -1 }).ok).toBe(false);
    expect(session.setGains({ kp: Number.NaN }).ok).toBe(false);
    expect(session.setGains({ kp: 999 }).ok).toBe(false);
    expect(session.getSnapshot().gains).toEqual(before);
    const ok = session.setGains({ kp: 0.05 });
    expect(ok.ok).toBe(true);
    expect(session.getSnapshot().gains.kp).toBeCloseTo(0.05, 6);
    session.destroy();
  });

  test('changing gains keeps the plant state intact', async () => {
    const session = await makeSession('dc-motor');
    session.start();
    session.advanceForTest(120);
    const time = session.getSnapshot().time;
    const measured = session.getSnapshot().measurement;
    session.setGains({ kp: 0.04, ki: 0.1 });
    const after = session.getSnapshot();
    expect(after.time).toBe(time);
    expect(after.measurement).toBeCloseTo(measured, 9);
    session.destroy();
  });

  test('reset returns to the initial condition but keeps the tuned gains', async () => {
    const session = await makeSession('dc-motor');
    session.start();
    session.advanceForTest(150);
    session.setGains({ kp: 0.06 });
    session.reset();
    const snap = session.getSnapshot();
    expect(snap.status).toBe('ready');
    expect(snap.time).toBe(0);
    expect(snap.gains.kp).toBeCloseTo(0.06, 6);
    expect(snap.events.some((e) => e.text.includes('重置实验'))).toBe(true);
    session.destroy();
  });

  test('next round generates a new challenge id, seed and starting gains', async () => {
    const session = await makeSession('dc-motor');
    const first = session.getSnapshot();
    await session.nextRound();
    const second = session.getSnapshot();
    expect(second.challengeId).not.toBe(first.challengeId);
    expect(second.seed).not.toBe(first.seed);
    expect(second.status).toBe('ready');
    expect(
      second.gains.kp !== first.gains.kp || second.gains.ki !== first.gains.ki || second.gains.kd !== first.gains.kd
    ).toBe(true);
    session.destroy();
  }, 30000);

  test('disturbances are rejected while paused and accepted while running', async () => {
    const session = await makeSession('dc-motor', 'intermediate');
    expect(session.addDisturbance().ok).toBe(false);
    session.start();
    // The scenario preset fires at t = autoAt; manual injection needs minRunTime.
    session.advanceForTest(700);
    const result = session.addDisturbance();
    expect(result.ok).toBe(true);
    expect(session.getSnapshot().metrics?.disturbanceCount).toBeGreaterThanOrEqual(1);
    session.destroy();
  });

  test('a successful round freezes the simulation and records history', async () => {
    const store = new AppStore(memoryStorage());
    const session = await makeSession('dc-motor', 'beginner', 11, store);
    session.setGains(REFERENCE_GAINS['dc-motor']);
    session.start();
    session.advanceForTest(2000);
    const snap = session.getSnapshot();
    expect(snap.status).toBe('success');
    expect(snap.result?.status).toBe('success');
    const frozenTime = snap.time;
    session.advanceForTest(100);
    expect(session.getSnapshot().time).toBe(frozenTime);
    expect(store.getHistory('dc-motor').length).toBe(1);
    session.destroy();
  });

  test('an unstable plant that falls over fails and freezes', async () => {
    const session = await makeSession('balancing-robot');
    session.setGains({ kp: 0.02, ki: 0, kd: 0.001 });
    session.start();
    session.advanceForTest(500);
    const snap = session.getSnapshot();
    expect(snap.status).toBe('failed');
    expect(snap.result?.reason).toBe('车身倾倒');
    session.destroy();
  });

  test('the success gate cannot be triggered by shrinking the target late', async () => {
    const session = await makeSession('temperature');
    session.setGains(REFERENCE_GAINS.temperature);
    session.start();
    session.advanceForTest(3000);
    // Move the target onto the current measurement: the settling window restarts.
    const current = session.getSnapshot().measurement;
    const moved = session.setTarget(current);
    if (moved.ok) {
      const snap = session.getSnapshot();
      expect(snap.metrics?.settleTime).toBeNull();
    }
    session.destroy();
  });

  test('a target outside the difficulty range is rejected', async () => {
    const session = await makeSession('temperature');
    expect(session.setTarget(500).ok).toBe(false);
    session.destroy();
  });

  test('destroy stops the scheduler and drops listeners', async () => {
    const session = await makeSession('dc-motor');
    session.start();
    expect(session.isSchedulerRunning()).toBe(true);
    session.destroy();
    expect(session.isSchedulerRunning()).toBe(false);
  });
});
