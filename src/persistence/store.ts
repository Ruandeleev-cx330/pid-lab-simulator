/**
 * Local persistence (settings + challenge history).
 *
 * Everything is stored in the renderer with a versioned schema. Corrupted or
 * incompatible data is discarded without breaking the running simulation, and a
 * failed write never interrupts the physics - the store falls back to memory.
 */

export interface ProjectSettings {
  difficulty: Record<string, string>;
  speed: Record<string, number>;
}

export interface HistoryEntry {
  challengeId: string;
  projectId: string;
  difficulty: string;
  target: number;
  gains: { kp: number; ki: number; kd: number };
  elapsed: number;
  overshootPct: number;
  settleTime: number | null;
  iae: number;
  completedAt: number;
  configVersion: string;
}

export interface PersistedState {
  version: 1;
  settings: ProjectSettings;
  history: HistoryEntry[];
}

const STORAGE_KEY = 'pid-lab.state.v1';
const MAX_HISTORY = 120;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function memoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    }
  };
}

function resolveStorage(): StorageLike {
  try {
    if (typeof localStorage !== 'undefined') {
      const probe = '__pidlab_probe__';
      localStorage.setItem(probe, '1');
      localStorage.removeItem(probe);
      return localStorage;
    }
  } catch {
    /* private mode / disabled storage */
  }
  return memoryStorage();
}

const emptyState = (): PersistedState => ({
  version: 1,
  settings: { difficulty: {}, speed: {} },
  history: []
});

export function sanitizeState(raw: unknown): PersistedState {
  if (!raw || typeof raw !== 'object') return emptyState();
  const candidate = raw as Partial<PersistedState>;
  if (candidate.version !== 1) return emptyState();

  const settings: ProjectSettings = { difficulty: {}, speed: {} };
  if (candidate.settings && typeof candidate.settings === 'object') {
    const d = candidate.settings.difficulty;
    if (d && typeof d === 'object') {
      for (const [key, value] of Object.entries(d)) {
        if (typeof value === 'string') settings.difficulty[key] = value;
      }
    }
    const s = candidate.settings.speed;
    if (s && typeof s === 'object') {
      for (const [key, value] of Object.entries(s)) {
        if (typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 10) {
          settings.speed[key] = value;
        }
      }
    }
  }

  const history: HistoryEntry[] = [];
  if (Array.isArray(candidate.history)) {
    for (const item of candidate.history) {
      if (!item || typeof item !== 'object') continue;
      const e = item as Partial<HistoryEntry>;
      if (
        typeof e.challengeId === 'string' &&
        typeof e.projectId === 'string' &&
        typeof e.difficulty === 'string' &&
        typeof e.target === 'number' &&
        e.gains &&
        typeof e.gains.kp === 'number' &&
        typeof e.gains.ki === 'number' &&
        typeof e.gains.kd === 'number' &&
        typeof e.completedAt === 'number'
      ) {
        history.push({
          challengeId: e.challengeId,
          projectId: e.projectId,
          difficulty: e.difficulty,
          target: e.target,
          gains: { kp: e.gains.kp, ki: e.gains.ki, kd: e.gains.kd },
          elapsed: typeof e.elapsed === 'number' ? e.elapsed : 0,
          overshootPct: typeof e.overshootPct === 'number' ? e.overshootPct : 0,
          settleTime: typeof e.settleTime === 'number' ? e.settleTime : null,
          iae: typeof e.iae === 'number' ? e.iae : 0,
          completedAt: e.completedAt,
          configVersion: typeof e.configVersion === 'string' ? e.configVersion : 'unknown'
        });
      }
    }
  }

  return { version: 1, settings, history: history.slice(-MAX_HISTORY) };
}

export class AppStore {
  private storage: StorageLike;
  private state: PersistedState;
  private writeFailed = false;

  constructor(storage: StorageLike = resolveStorage()) {
    this.storage = storage;
    this.state = this.load();
  }

  private load(): PersistedState {
    try {
      const raw = this.storage.getItem(STORAGE_KEY);
      if (!raw) return emptyState();
      return sanitizeState(JSON.parse(raw));
    } catch {
      return emptyState();
    }
  }

  private persist(): void {
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(this.state));
      this.writeFailed = false;
    } catch {
      // Quota exceeded / storage disabled: keep working from memory.
      this.writeFailed = true;
    }
  }

  get writeFailure(): boolean {
    return this.writeFailed;
  }

  getState(): PersistedState {
    return this.state;
  }

  getDifficulty(projectId: string): string | undefined {
    return this.state.settings.difficulty[projectId];
  }

  setDifficulty(projectId: string, difficulty: string): void {
    this.state.settings.difficulty[projectId] = difficulty;
    this.persist();
  }

  getSpeed(projectId: string): number | undefined {
    return this.state.settings.speed[projectId];
  }

  setSpeed(projectId: string, speed: number): void {
    this.state.settings.speed[projectId] = speed;
    this.persist();
  }

  getHistory(projectId?: string): HistoryEntry[] {
    if (!projectId) return this.state.history.slice();
    return this.state.history.filter((h) => h.projectId === projectId);
  }

  bestEntry(projectId: string, difficulty: string): HistoryEntry | undefined {
    return this.state.history
      .filter((h) => h.projectId === projectId && h.difficulty === difficulty)
      .sort((a, b) => b.completedAt - a.completedAt)[0];
  }

  addHistory(entry: HistoryEntry): void {
    this.state.history.push(entry);
    if (this.state.history.length > MAX_HISTORY) {
      this.state.history = this.state.history.slice(-MAX_HISTORY);
    }
    this.persist();
  }

  clearHistory(): void {
    this.state.history = [];
    this.persist();
  }
}
