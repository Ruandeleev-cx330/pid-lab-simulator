import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

/**
 * UI flow test. The solvability validation is bypassed (it runs the full physics
 * for every candidate) - the validation itself is covered by
 * tests/challenge/generator.test.ts against the real generator.
 */
vi.mock('../../src/challenges/generator', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../src/challenges/generator')>();
  return {
    ...mod,
    generateChallenge: (
      project: Parameters<typeof mod.generateChallenge>[0],
      difficulty: Parameters<typeof mod.generateChallenge>[1],
      seed: number,
      options: Parameters<typeof mod.generateChallenge>[3]
    ) => mod.generateChallenge(project, difficulty, seed, { ...options, validate: false })
  };
});

const { App } = await import('../../src/app/App');

describe('application flow', () => {
  test('lobby lists every project and enters a lab with a generated challenge', async () => {
    render(<App />);

    expect(screen.getByTestId('card-temperature')).toBeInTheDocument();
    expect(screen.getByTestId('card-dc-motor')).toBeInTheDocument();
    expect(screen.getByTestId('card-liquid-level')).toBeInTheDocument();
    expect(screen.getByTestId('card-balancing-robot')).toBeInTheDocument();
    expect(screen.getByTestId('card-inverted-pendulum')).toBeInTheDocument();

    await userEvent.click(screen.getByTestId('start-dc-motor-beginner'));

    await waitFor(() => expect(screen.getByTestId('btn-start')).toBeEnabled(), { timeout: 15000 });
    expect(screen.getByTestId('metrics-strip')).toBeInTheDocument();
    expect(screen.getByLabelText('Kp 滑块')).toBeInTheDocument();

    // the initial gains come from the challenge generator, not from a constant
    const kp = Number((screen.getByLabelText('Kp 数值输入') as HTMLInputElement).value);
    expect(Number.isFinite(kp)).toBe(true);
    expect(kp).toBeGreaterThanOrEqual(0);
  }, 30000);

  test('starting and pausing switches the toolbar state machine', async () => {
    render(<App />);
    await userEvent.click(screen.getByTestId('start-dc-motor-beginner'));
    await waitFor(() => expect(screen.getByTestId('btn-start')).toBeEnabled(), { timeout: 15000 });

    await userEvent.click(screen.getByTestId('btn-start'));
    await waitFor(() => expect(screen.getByTestId('btn-pause')).toBeInTheDocument());

    await userEvent.click(screen.getByTestId('btn-pause'));
    await waitFor(() => expect(screen.getByTestId('btn-start')).toBeInTheDocument());
    expect(screen.getByTestId('btn-start')).toHaveTextContent('继续');
  }, 30000);

  test('returning to the lobby unmounts the lab', async () => {
    render(<App />);
    await userEvent.click(screen.getByTestId('start-temperature-beginner'));
    await waitFor(() => expect(screen.getByTestId('btn-start')).toBeEnabled(), { timeout: 15000 });
    await userEvent.click(screen.getByTestId('btn-back'));
    await waitFor(() => expect(screen.getByTestId('card-temperature')).toBeInTheDocument());
    expect(screen.queryByTestId('btn-start')).toBeNull();
  }, 30000);
});
