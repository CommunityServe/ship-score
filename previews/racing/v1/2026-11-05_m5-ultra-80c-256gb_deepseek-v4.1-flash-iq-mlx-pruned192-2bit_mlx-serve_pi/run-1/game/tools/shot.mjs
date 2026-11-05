import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const root = path.resolve(process.cwd());
const shotsDir = path.join(root, 'shots');
const port = Number(process.env.PHOT_PORT || 5173);
const url = `http://127.0.0.1:${port}/`;
const previewCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';

fs.mkdirSync(shotsDir, { recursive: true });

if (!fs.existsSync(path.join(root, 'dist', 'index.html'))) {
  console.error('dist/index.html not found. Run `npm run build` first.');
  process.exit(1);
}

let server = spawn(previewCommand, ['vite', 'preview', '--port', String(port), '--host', '127.0.0.1'], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
server.stdout?.on('data', (data) => { serverLog += String(data); });
server.stderr?.on('data', (data) => { serverLog += String(data); });

async function waitForServer() {
  for (let i = 0; i < 80; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (res.ok) return;
    } catch {
      // not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Vite preview did not become ready.\n${serverLog}`);
}

try {
  await waitForServer();

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--disable-gpu',
      '--hide-scrollbars',
    ],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });

  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForFunction(() => window.__gameReady === true, null, { timeout: 30000 });
  await page.waitForTimeout(300);

  // Screenshot 1: idle at the start gate.
  await page.screenshot({ path: path.join(shotsDir, 'story-01-start.png') });

  // Screenshot 2: accelerate to racing speed for several seconds.
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(2200);
  await page.keyboard.up('ArrowUp');
  await page.waitForTimeout(120);
  await page.screenshot({ path: path.join(shotsDir, 'story-02-racing.png') });

  // Screenshot 3: brake down from top speed, then steer through the bend.
  await page.keyboard.down('ArrowDown');
  await page.waitForTimeout(900);
  await page.keyboard.up('ArrowDown');
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(500);
  await page.keyboard.up('ArrowLeft');
  await page.waitForTimeout(160);
  await page.screenshot({ path: path.join(shotsDir, 'story-03-steering.png') });

  console.log('Saved shots:', fs.readdirSync(shotsDir).map((f) => path.join('shots', f)));
  await browser.close();
} finally {
  server.kill('SIGTERM');
  await new Promise((resolve) => setTimeout(resolve, 250));
  if (!server.killed) server.kill('SIGKILL');
}
