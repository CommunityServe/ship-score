import { chromium } from 'playwright';
import { spawn, execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const shotsDir = path.join(root, 'shots');
mkdirSync(shotsDir, { recursive: true });

console.log('[shot] building production bundle...');
execSync('npm run build', { cwd: root, stdio: 'inherit' });

const PORT = 4173;
console.log(`[shot] starting vite preview on :${PORT}`);
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--host', '127.0.0.1', '--strictPort'], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stdout.on('data', (d) => process.stdout.write(d));
server.stderr.on('data', (d) => process.stderr.write(d));

const waitForServer = async () => {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/`);
      if (res.ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error('vite preview did not start');
};

try {
  await waitForServer();

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--autoplay-policy=no-user-gesture-required',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
    ],
  });
  const page = await browser.newPage({
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor: 1,
  });

  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });

  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__gameReady === true && window.__game && window.__game.frames() > 20, null, { timeout: 45000 });

  // Focus the page so keyboard events reach the game and audio can start.
  await page.mouse.click(800, 450);
  await page.waitForTimeout(900);
  const idleAudio = await page.evaluate(() => window.__game.telemetry().audio);
  console.log('[shot] idle audio:', JSON.stringify(idleAudio));

  await page.screenshot({ path: path.join(shotsDir, '01-start.png') });
  console.log('[shot] saved 01-start.png');

  // Drive with keyboard inputs. A small steering assistant nudges A/D so the
  // car follows the racing line while still using the real control path.
  await page.keyboard.down('w');
  let steerKey = null;
  const steerToLine = async () => {
    const t = await page.evaluate(() => window.__game.telemetry());
    // pure-pursuit: aim at a point on the racing line ~25 m ahead
    let diff = Math.atan2(t.targetX - t.x, t.targetZ - t.z) - t.heading;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    let want = null;
    if (diff < -0.035) want = 'd';
    else if (diff > 0.035) want = 'a';
    if (want !== steerKey) {
      if (steerKey) await page.keyboard.up(steerKey);
      if (want) await page.keyboard.down(want);
      steerKey = want;
    }
    return t;
  };

  const started = Date.now();
  while (Date.now() - started < 2600) {
    await steerToLine();
    await page.waitForTimeout(80);
  }
  const t2 = await page.evaluate(() => window.__game.telemetry());
  console.log('[shot] telemetry #2:', JSON.stringify(t2));
  await page.screenshot({ path: path.join(shotsDir, '02-accelerating.png') });
  console.log('[shot] saved 02-accelerating.png');

  // Keep pushing toward top speed for the final action frame.
  while (Date.now() - started < 5600) {
    await steerToLine();
    await page.waitForTimeout(80);
  }
  const t3 = await steerToLine();
  console.log('[shot] telemetry #3:', JSON.stringify(t3));
  await page.screenshot({ path: path.join(shotsDir, '03-highspeed.png') });
  console.log('[shot] saved 03-highspeed.png');

  if (steerKey) await page.keyboard.up(steerKey);
  await page.keyboard.up('w');

  if (!idleAudio.ready || idleAudio.contextState !== 'running') {
    throw new Error(`engine audio context not running: ${JSON.stringify(idleAudio)}`);
  }
  if (t2.audio.level <= 0.0005) {
    throw new Error(`engine audio did not produce signal: ${JSON.stringify(t2.audio)}`);
  }
  if (!(t2.audio.oscHz > idleAudio.oscHz + 20)) {
    throw new Error(`engine pitch did not rise with speed: idle ${idleAudio.oscHz}, driving ${t2.audio.oscHz}`);
  }
  if (t2.speedKmh < 80) throw new Error(`expected speed > 80 km/h after accelerating, got ${t2.speedKmh}`);
  if (t3.speedKmh < 130) throw new Error(`expected high speed for screenshot 3, got ${t3.speedKmh}`);
  if (errors.length) throw new Error(`browser errors:\n${errors.join('\n')}`);

  await browser.close();
  console.log('[shot] done');
} finally {
  server.kill('SIGTERM');
}
