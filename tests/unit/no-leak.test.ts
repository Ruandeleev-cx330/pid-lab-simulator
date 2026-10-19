import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { REFERENCE_GAINS } from '../../src/challenges/reference-policies';
import { getProject } from '../../src/projects/registry';
import { generateChallenge } from '../../src/challenges/generator';

const UI_DIRS = ['src/app', 'src/components', 'src/visualization', 'src/persistence', 'src/state'];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

describe('internal reference policy stays internal', () => {
  test('no UI module imports the reference policy', () => {
    const offenders: string[] = [];
    for (const dir of UI_DIRS) {
      for (const file of walk(dir)) {
        const source = readFileSync(file, 'utf8');
        if (/reference-policies|REFERENCE_GAINS|referenceGainsFor/.test(source)) offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  test('a generated challenge does not carry any reference gain', () => {
    for (const id of Object.keys(REFERENCE_GAINS)) {
      const project = getProject(id);
      const challenge = generateChallenge(project, 'beginner', 2024);
      const serialized = JSON.stringify(challenge);
      const reference = REFERENCE_GAINS[id];
      // The exact reference numbers must not appear in the challenge payload that
      // is handed to the renderer.
      expect(serialized).not.toContain(`"kp":${reference.kp}`);
      expect(serialized).not.toContain(`"kd":${reference.kd}`);
      expect(Object.keys(challenge)).not.toContain('referenceGains');
    }
  }, 60000);

  test('the reference values themselves are not part of the exported result shape', async () => {
    const { AppStore } = await import('../../src/persistence/store');
    const store = new AppStore({ getItem: () => null, setItem: () => undefined });
    const payload = JSON.stringify({ history: store.getHistory() });
    expect(payload).not.toContain('reference');
    expect(payload).not.toContain('answer');
  });
});
