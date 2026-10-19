import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PidPanel } from '../../src/components/PidPanel';
import { Toolbar } from '../../src/components/Toolbar';
import { GateBar } from '../../src/components/GateBar';
import { MetricsStrip } from '../../src/components/MetricsStrip';
import { ResultOverlay } from '../../src/components/ResultOverlay';
import type { ChallengeSession } from '../../src/state/session';
import { makeSnapshot } from '../helpers/snapshot';

function fakeSession(overrides: Partial<ChallengeSession> = {}) {
  const calls: Array<[string, unknown]> = [];
  const session = {
    setGains: (patch: unknown) => {
      calls.push(['setGains', patch]);
      return { ok: true };
    },
    start: () => calls.push(['start', null]),
    pause: () => calls.push(['pause', null]),
    reset: () => calls.push(['reset', null]),
    nextRound: async () => {
      calls.push(['nextRound', null]);
    },
    addDisturbance: () => ({ ok: true }),
    setSpeed: () => undefined,
    setTarget: () => ({ ok: true }),
    ...overrides
  } as unknown as ChallengeSession;
  return { session, calls };
}

const limits = {
  kp: { min: 0, max: 0.3, step: 0.001 },
  ki: { min: 0, max: 1, step: 0.002 },
  kd: { min: 0, max: 0.05, step: 0.0005 },
  decimals: 3
};
const help = { kp: 'Kp 帮助', ki: 'Ki 帮助', kd: 'Kd 帮助' };

describe('PidPanel', () => {
  test('the slider and the number input drive the same value', async () => {
    const { session, calls } = fakeSession();
    const snapshot = makeSnapshot();
    render(<PidPanel session={session} snapshot={snapshot} limits={limits} help={help} onError={() => undefined} />);

    const slider = screen.getByLabelText('Kp 滑块') as HTMLInputElement;
    expect(slider.value).toBe('0.05');

    await userEvent.clear(screen.getByLabelText('Kp 数值输入'));
    await userEvent.type(screen.getByLabelText('Kp 数值输入'), '0.12');
    await userEvent.tab();

    expect(calls.some(([name, payload]) => name === 'setGains' && (payload as { kp: number }).kp === 0.12)).toBe(true);
  });

  test('an out of range value is rejected, shown as an error and reverted', async () => {
    const { session } = fakeSession({
      setGains: () => ({ ok: false, message: 'Kp 超出允许范围 0 – 0.3' })
    });
    render(
      <PidPanel
        session={session}
        snapshot={makeSnapshot()}
        limits={limits}
        help={help}
        onError={() => undefined}
      />
    );
    const input = screen.getByLabelText('Kp 数值输入') as HTMLInputElement;
    await userEvent.clear(input);
    await userEvent.type(input, '99');
    await userEvent.tab();

    await waitFor(() => expect(screen.getByText('Kp 超出允许范围 0 – 0.3')).toBeInTheDocument());
    expect(input.value).toBe('0.050');
  });

  test('gains are locked once the round is over', () => {
    const { session } = fakeSession();
    render(
      <PidPanel
        session={session}
        snapshot={makeSnapshot({ status: 'success' })}
        limits={limits}
        help={help}
        onError={() => undefined}
      />
    );
    expect((screen.getByLabelText('Kp 数值输入') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText('Kp 滑块') as HTMLInputElement).disabled).toBe(true);
  });
});

describe('Toolbar', () => {
  test('shows start for a ready round and disables the disturbance button without a scenario', () => {
    const { session } = fakeSession();
    render(
      <Toolbar
        session={session}
        snapshot={makeSnapshot({ status: 'ready' })}
        hasDisturbance={false}
        onNotice={() => undefined}
        onOpenResult={() => undefined}
      />
    );
    expect(screen.getByTestId('btn-start')).toBeEnabled();
    expect(screen.getByTestId('btn-disturbance')).toBeDisabled();
  });

  test('shows pause while running', () => {
    const { session } = fakeSession();
    render(
      <Toolbar
        session={session}
        snapshot={makeSnapshot({ status: 'running' })}
        hasDisturbance
        onNotice={() => undefined}
        onOpenResult={() => undefined}
      />
    );
    expect(screen.getByTestId('btn-pause')).toBeInTheDocument();
    expect(screen.queryByTestId('btn-start')).toBeNull();
  });

  test('a rejected disturbance shows a notice instead of silently failing', async () => {
    const notices: string[] = [];
    const { session } = fakeSession({
      addDisturbance: () => ({ ok: false, message: '只有仿真运行中才能施加扰动' })
    });
    render(
      <Toolbar
        session={session}
        snapshot={makeSnapshot({ status: 'running' })}
        hasDisturbance
        onNotice={(m) => notices.push(m)}
        onOpenResult={() => undefined}
      />
    );
    await userEvent.click(screen.getByTestId('btn-disturbance'));
    expect(notices).toEqual(['只有仿真运行中才能施加扰动']);
  });
});

describe('GateBar', () => {
  test('renders the published conditions with their live values', () => {
    render(
      <GateBar
        snapshot={makeSnapshot({
          checklist: [
            { key: 'time', label: '运行时间', ok: true, detail: '6.0 / 5 s' },
            { key: 'iae', label: 'IAE', ok: false, blocked: true, detail: '120 / ≤110' }
          ]
        })}
      />
    );
    expect(screen.getByTestId('check-time')).toHaveClass('ok');
    expect(screen.getByTestId('check-iae')).toHaveClass('blocked');
    expect(screen.getByText('6.0 / 5 s')).toBeInTheDocument();
  });
});

describe('MetricsStrip', () => {
  test('shows the same numbers that are in the snapshot', () => {
    render(
      <MetricsStrip
        snapshot={makeSnapshot({ time: 12.34, error: 8.5, control: 5.5, saturated: true })}
        outputUnit="rad/s"
        controlUnit="V"
        decimals={1}
      />
    );
    expect(screen.getByTestId('metrics-strip')).toHaveTextContent('12.34');
    expect(screen.getByTestId('metrics-strip')).toHaveTextContent('8.5');
    expect(screen.getByTestId('metrics-strip')).toHaveTextContent('饱和');
  });
});

describe('ResultOverlay', () => {
  test('reports the user gains and the real metrics, never a reference answer', () => {
    render(
      <ResultOverlay
        result={{
          status: 'success',
          reason: '达标',
          detail: '稳态误差 0.02',
          time: 12.3,
          gains: { kp: 0.09, ki: 0.3, kd: 0.001 },
          metrics: makeSnapshot().metrics!,
          target: 200,
          challengeId: 'x',
          difficulty: 'beginner',
          projectId: 'dc-motor',
          disturbanceCount: 1,
          completedAt: Date.now()
        }}
        initialGains={{ kp: 0.03, ki: 0.06, kd: 0 }}
        decimals={3}
        outputUnit="rad/s"
        onNextRound={() => undefined}
        onRetry={() => undefined}
        onClose={() => undefined}
        onLobby={() => undefined}
      />
    );
    expect(screen.getByText('本轮达标')).toBeInTheDocument();
    expect(screen.getByText('0.090')).toBeInTheDocument();
    expect(screen.getByText('0.030')).toBeInTheDocument();
    expect(screen.getByTestId('btn-result-next')).toBeInTheDocument();
    expect(screen.queryByTestId('btn-result-retry')).toBeNull();
  });
});
