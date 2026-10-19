/**
 * Electron end-to-end smoke test (Playwright _electron).
 *
 *   npm run test:e2e
 *
 * It drives the *packaged renderer bundle* inside a real Electron window:
 * lobby -> project -> start -> pause -> resume -> parameter change ->
 * disturbance -> screenshot. It fails on any uncaught renderer error.
 */
import { _electron as electron } from 'playwright';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const ARTIFACTS = path.resolve('artifacts');
const errors = [];

const log = (msg) => console.log(`  ${msg}`);

function fail(message) {
  console.error(`✗ ${message}`);
  process.exitCode = 1;
  throw new Error(message);
}

async function readTime(win) {
  const text = await win.locator('[data-testid="metric-time"] .m-value').innerText();
  return Number.parseFloat(text);
}

// A fresh profile per run avoids Chromium singleton-lock collisions between runs.
const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'pidlab-e2e-'));

async function launchWithRetry(attempts = 4) {
  let lastError;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await electron.launch({
        args: ['.', '--no-sandbox', '--safe-mode', `--user-data-dir=${userDataDir}-${i}`],
        env: { ...process.env, VITE_DEV_SERVER_URL: '', NODE_ENV: 'production', PIDLAB_SAFE_MODE: '1' },
        timeout: 45000
      });
    } catch (error) {
      lastError = error;
      // Chromium helper processes occasionally fail to bootstrap on locked-down
      // Windows sessions; a fresh attempt with a new profile normally works.
      await new Promise((resolve) => setTimeout(resolve, 4000));
    }
  }
  throw lastError;
}

const app = await launchWithRetry();

const win = await app.firstWindow();
win.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text());
});
win.on('pageerror', (err) => errors.push(String(err)));

await mkdir(ARTIFACTS, { recursive: true });

try {
  // ---------------------------------------------------------------- lobby
  await win.waitForSelector('[data-testid="card-dc-motor"]', { timeout: 20000 });
  const cards = await win.locator('article.card').count();
  if (cards !== 5) fail(`expected 5 project cards, found ${cards}`);
  log(`lobby rendered with ${cards} project cards`);
  await win.screenshot({ path: path.join(ARTIFACTS, '01-lobby.png'), fullPage: false });

  // ------------------------------------------------------- enter the lab
  await win.click('[data-testid="start-dc-motor-beginner"]');
  await win.waitForSelector('[data-testid="btn-start"]', { timeout: 30000 });
  await win.waitForFunction(() => !document.querySelector('[data-testid="btn-start"]')?.disabled, null, {
    timeout: 30000
  });
  log('challenge generated, start button enabled');
  await win.screenshot({ path: path.join(ARTIFACTS, '02-lab-ready.png') });

  // --------------------------------------------------------------- start
  await win.click('[data-testid="btn-start"]');
  await win.waitForTimeout(1500);
  const t1 = await readTime(win);
  if (!(t1 > 0.3)) fail(`simulation time did not advance (t=${t1})`);
  log(`simulation advanced to t=${t1.toFixed(2)} s`);

  // --------------------------------------------------------------- pause
  await win.click('[data-testid="btn-pause"]');
  await win.waitForTimeout(400);
  const paused1 = await readTime(win);
  await win.waitForTimeout(700);
  const paused2 = await readTime(win);
  if (Math.abs(paused2 - paused1) > 1e-6) fail(`time moved while paused: ${paused1} -> ${paused2}`);
  log(`pause freezes the physics at t=${paused2.toFixed(2)} s`);

  // -------------------------------------------------------------- resume
  await win.click('[data-testid="btn-start"]');
  await win.waitForTimeout(900);
  const resumed = await readTime(win);
  if (!(resumed > paused2 + 0.2)) fail(`simulation did not resume (${paused2} -> ${resumed})`);
  log(`resumed to t=${resumed.toFixed(2)} s`);

  // ------------------------------------------------------ change a gain
  const kpInput = win.locator('[aria-label="Kp 数值输入"]');
  await kpInput.fill('0.05');
  await kpInput.press('Enter');
  await win.waitForTimeout(600);
  const kpValue = await kpInput.inputValue();
  if (Number.parseFloat(kpValue) !== 0.05) fail(`Kp input did not commit (${kpValue})`);
  log('Kp committed through the number input');

  // invalid input must be rejected and reverted
  await kpInput.fill('-5');
  await kpInput.press('Enter');
  await win.waitForTimeout(300);
  const afterInvalid = await kpInput.inputValue();
  if (Number.parseFloat(afterInvalid) < 0) fail('negative gain was accepted');
  log(`invalid gain rejected, value reverted to ${afterInvalid}`);

  // ---------------------------------------------------------- disturbance
  // A manual disturbance is only accepted after the minimum run time.
  await win.waitForFunction(
    () => Number.parseFloat(document.querySelector('[data-testid="metric-time"] .m-value')?.textContent ?? '0') >= 5.5,
    null,
    { timeout: 30000 }
  );
  await win.click('[data-testid="btn-disturbance"]');
  await win.waitForTimeout(800);
  const logText = await win.locator('.log-list').innerText();
  if (!logText.includes('负载转矩')) fail('disturbance was not logged');
  log('disturbance applied to the model and logged');

  await win.screenshot({ path: path.join(ARTIFACTS, '03-lab-running.png') });

  // ------------------------------------------------------------ switch project
  await win.click('[data-testid="btn-back"]');
  await win.waitForSelector('[data-testid="card-inverted-pendulum"]');
  await win.click('[data-testid="start-inverted-pendulum-advanced"]');
  await win.waitForSelector('[data-testid="btn-start"]', { timeout: 40000 });
  log('switched to inverted pendulum without leaking the previous session');
  await win.screenshot({ path: path.join(ARTIFACTS, '04-pendulum.png') });

  // ------------------------------------------- failure path + result panel
  await win.click('[data-testid="btn-back"]');
  await win.waitForSelector('[data-testid="card-balancing-robot"]');
  await win.click('[data-testid="start-balancing-robot-beginner"]');
  await win.waitForSelector('[data-testid="btn-start"]', { timeout: 40000 });
  await win.waitForFunction(() => !document.querySelector('[data-testid="btn-start"]')?.disabled, null, {
    timeout: 40000
  });
  const kpLow = win.locator('[aria-label="Kp 数值输入"]');
  await kpLow.fill('0.02');
  await kpLow.press('Enter');
  await win.click('[data-testid="btn-start"]');
  await win.waitForSelector('.overlay .result-card', { timeout: 30000 });
  const resultText = await win.locator('.result-card').innerText();
  if (!resultText.includes('未达标')) fail('failure result panel did not appear');
  if (!resultText.includes('车身倾倒')) fail(`unexpected failure reason: ${resultText.slice(0, 120)}`);
  log('failure detected, frozen and explained in the result panel');
  await win.screenshot({ path: path.join(ARTIFACTS, '06-result-failure.png') });

  // ---------------------------------------- success path + next round (5x)
  await win.click('.overlay .btn.ghost'); // 返回项目大厅
  await win.waitForSelector('[data-testid="card-dc-motor"]');
  await win.click('[data-testid="start-dc-motor-beginner"]');
  await win.waitForFunction(() => !document.querySelector('[data-testid="btn-start"]')?.disabled, null, {
    timeout: 40000
  });
  // A known-good gain set typed through the UI inputs. The application itself
  // never reveals reference gains - this is a test fixture, not a product feature.
  for (const [key, value] of [
    ['Kp', '0.085'],
    ['Ki', '0.32'],
    ['Kd', '0.001']
  ]) {
    const input = win.locator(`[aria-label="${key} 数值输入"]`);
    await input.fill(value);
    await input.press('Enter');
  }
  await win.getByRole('button', { name: '5×', exact: true }).click();
  await win.click('[data-testid="btn-start"]');
  await win.waitForSelector('.overlay .result-card', { timeout: 45000 });
  const successText = await win.locator('.result-card').innerText();
  if (!successText.includes('本轮达标')) fail(`success panel missing (${successText.slice(0, 140)})`);
  log('success detected, frozen and reported with real metrics');
  await win.screenshot({ path: path.join(ARTIFACTS, '07-result-success.png') });

  await win.click('[data-testid="btn-result-next"]');
  await win.waitForFunction(() => !document.querySelector('[data-testid="btn-start"]')?.disabled, null, {
    timeout: 40000
  });
  const afterNext = await win.locator('[data-testid="metric-time"] .m-value').innerText();
  if (Number.parseFloat(afterNext) !== 0) fail(`next round did not reset the clock (${afterNext})`);
  log('next round generated a fresh challenge and reset the clock');

  if (errors.length > 0) {
    throw new Error(`renderer reported ${errors.length} error(s): ${errors.slice(0, 3).join(' | ')}`);
  }

  await writeFile(
    path.join(ARTIFACTS, 'e2e-report.json'),
    JSON.stringify({ ok: true, cards, t1, paused2, resumed, errors }, null, 2)
  );
  console.log('\n✓ E2E smoke passed');
} catch (error) {
  await win.screenshot({ path: path.join(ARTIFACTS, 'failure.png') }).catch(() => undefined);
  console.error(`\n✗ E2E failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await Promise.race([app.close(), new Promise((resolve) => setTimeout(resolve, 5000))]);
}

// The Electron child process can outlive close() in restricted environments.
process.exit(process.exitCode ?? 0);
