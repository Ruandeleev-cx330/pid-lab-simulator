import { AppStore, sanitizeState, type StorageLike } from '../../src/persistence/store';

function storage(initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => {
      data[k] = v;
    }
  };
}

const entry = {
  challengeId: 'c1',
  projectId: 'dc-motor',
  difficulty: 'beginner',
  target: 200,
  gains: { kp: 0.05, ki: 0.1, kd: 0.001 },
  elapsed: 12,
  overshootPct: 3,
  settleTime: 2,
  iae: 40,
  completedAt: 1700000000000,
  configVersion: '1.0.0'
};

describe('persistence', () => {
  test('round trips settings and history', () => {
    const s = storage();
    const store = new AppStore(s);
    store.setDifficulty('dc-motor', 'advanced');
    store.setSpeed('dc-motor', 2);
    store.addHistory(entry);

    const reloaded = new AppStore(s);
    expect(reloaded.getDifficulty('dc-motor')).toBe('advanced');
    expect(reloaded.getSpeed('dc-motor')).toBe(2);
    expect(reloaded.getHistory('dc-motor')).toHaveLength(1);
    expect(reloaded.bestEntry('dc-motor', 'beginner')?.challengeId).toBe('c1');
  });

  test('corrupted JSON does not break the app', () => {
    const store = new AppStore(storage({ 'pid-lab.state.v1': '{not json' }));
    expect(store.getHistory()).toEqual([]);
    expect(store.getDifficulty('dc-motor')).toBeUndefined();
    // still writable
    store.addHistory(entry);
    expect(store.getHistory()).toHaveLength(1);
  });

  test('an unknown schema version is discarded', () => {
    const state = sanitizeState({ version: 99, settings: { difficulty: {} }, history: [entry] });
    expect(state.history).toEqual([]);
  });

  test('invalid entries are filtered out instead of poisoning the list', () => {
    const state = sanitizeState({
      version: 1,
      settings: { difficulty: { 'dc-motor': 'beginner' }, speed: { 'dc-motor': 'fast' } },
      history: [entry, { challengeId: 42 }, null, 'nope']
    });
    expect(state.history).toHaveLength(1);
    expect(state.settings.speed['dc-motor']).toBeUndefined();
  });

  test('a failing storage backend degrades to memory without throwing', () => {
    const broken: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      }
    };
    const store = new AppStore(broken);
    expect(() => store.addHistory(entry)).not.toThrow();
    expect(store.writeFailure).toBe(true);
    expect(store.getHistory()).toHaveLength(1);
  });

  test('history is capped', () => {
    const store = new AppStore(storage());
    for (let i = 0; i < 140; i += 1) store.addHistory({ ...entry, challengeId: `c${i}` });
    expect(store.getHistory().length).toBeLessThanOrEqual(120);
  });
});
