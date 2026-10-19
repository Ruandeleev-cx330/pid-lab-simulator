import { ChallengeGenerationError, generateChallenge } from '../src/challenges/generator';
import { getProject } from '../src/projects/registry';
import type { Difficulty } from '../src/projects/types';

const id = process.argv[2] ?? 'dc-motor';
const difficulty = (process.argv[3] ?? 'beginner') as Difficulty;
const project = getProject(id);

try {
  generateChallenge(project, difficulty, 1, { maxAttempts: 8 });
  console.log('generated ok');
} catch (error) {
  const e = error as ChallengeGenerationError;
  console.log(e.message);
  for (const d of e.diagnostics) console.log('  ', d);
}
