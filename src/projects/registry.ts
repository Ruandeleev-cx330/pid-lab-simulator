import { balancingRobotProject } from './balancing-robot';
import { dcMotorProject } from './dc-motor';
import { invertedPendulumProject } from './inverted-pendulum';
import { liquidLevelProject } from './liquid-level';
import { temperatureProject } from './temperature';
import type { ProjectAdapter } from './types';

/**
 * Project registry. Adding a project means adding a model, its tests, a project
 * definition and one entry here - nothing else in the app changes.
 */
export const PROJECTS: ProjectAdapter[] = [
  temperatureProject,
  dcMotorProject,
  liquidLevelProject,
  balancingRobotProject,
  invertedPendulumProject
];

const registry = new Map(PROJECTS.map((p) => [p.meta.id, p]));

export function getProject(id: string): ProjectAdapter {
  const project = registry.get(id);
  if (!project) throw new Error(`unknown project: ${id}`);
  return project;
}

export function findProject(id: string): ProjectAdapter | undefined {
  return registry.get(id);
}

export const PROJECT_IDS = PROJECTS.map((p) => p.meta.id);
