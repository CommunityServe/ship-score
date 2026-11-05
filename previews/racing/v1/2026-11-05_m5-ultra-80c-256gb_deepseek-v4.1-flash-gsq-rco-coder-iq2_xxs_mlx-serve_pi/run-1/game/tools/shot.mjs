import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { execSync } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';
import fs from 'node:fs';

const ROOT = process.cwd();
const SHOTS = `${ROOT}/shots`;
fs.mkdirSync(SHOTS, { recursive: true });
for (const file of fs.readdirSync(SHOTS)) {
  if (file.endsWith('.png')) fs.unlinkSync(`${SHOTS}/${file}`);
}

console.log('Building game...');
execSync('npm run build', { cwd: ROOT, stdio: 'inherit' });

const server = spawn('npm', ['run', 'preview'], {
  cwd: ROOT,
  stdio: 'pipe',
  env: { ...process.env, FORCE_COLOR: '1' },
});
server.stdout.on('data', (data) => process.stdout.write(data));
server.stderr.on('data', (data) => process.stderr.write(data));

async function waitForServer(url, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {}
    await setTimeout(350);
  }
  throw new Error(`Server did not become available: ${url}`);
}

try {
  await waitForServer('http://127.0.0.1:4173/');

  const browser = await chromium.launch({
    headless: true,
    args: ['--enable-autoplay'],
  });
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });

  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
  await page.waitForFunction('window.__racerReady === true');
  await page.waitForFunction('document.querySelector("canvas") !== null');

  await page.waitForTimeout(2200);
  await page.screenshot({ path: `${SHOTS}/01-start.png` });

  // Accelerate and let the camera/track settle.
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('W');
    await page.waitForTimeout(50);
  }
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${SHOTS}/02-accelerated.png` });

  // Accelerate more and steer left, so the third view shows a dynamic lane change.
  for (let i = 0; i < 7; i++) {
    await page.keyboard.press('W');
    await page.waitForTimeout(35);
  }
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('A');
    await page.waitForTimeout(80);
  }
  await page.waitForTimeout(1400);
  await page.screenshot({ path: `${SHOTS}/03-steering.png` });

  console.log('Saved screenshots:', fs.readdirSync(SHOTS).join(', '));
  await browser.close();
} finally {
  server.kill('SIGTERM');
}
