// Headless screenshot + smoke-test driver. Serves dist/, drives the car with
// simulated key presses, verifies audio/engine telemetry, and saves 3 shots.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../dist', import.meta.url));
const shotsDir = fileURLToPath(new URL('../shots', import.meta.url));
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

async function serve() {
  const server = createServer(async (req, res) => {
    try {
      let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (pathname === '/') pathname = '/index.html';
      const filePath = resolve(join(root, normalize(pathname)));
      if (!filePath.startsWith(root)) {
        res.writeHead(403);
        res.end('forbidden');
        return;
      }
      const info = await stat(filePath);
      if (!info.isFile()) {
        res.writeHead(404);
        res.end('not found');
        return;
      }
      const data = await readFile(filePath);
      res.writeHead(200, {
        'Content-Type': mime[extname(filePath)] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(data);
    } catch (err) {
      res.writeHead(404);
      res.end('not found');
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return server;
}

const errors = [];
const logs = [];

function log(...args) {
  logs.push(args.join(' '));
  console.log(...args);
}

(async () => {
  await mkdir(shotsDir, { recursive: true });
  const server = await serve();
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}/`;

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--autoplay-policy=no-user-gesture-required',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--enable-features=WebGL2',
      '--disable-frame-rate-limit',
    ],
  });

  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  page.on('console', (msg) => {
    const text = msg.text();
    if (msg.type() === 'error') {
      errors.push(text);
      log('PAGE ERROR:', text);
    } else {
      log('PAGE LOG:', text);
    }
  });
  page.on('pageerror', (err) => {
    errors.push(String(err));
    log('PAGE EXCEPTION:', String(err));
  });

  try {
    log('Loading', url);
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__gameReady === true, null, {
      timeout: 30000,
    });
    await page.mouse.click(720, 450);

    const canvasInfo = await page.evaluate(() => {
      const c = document.getElementById('scene');
      let gl = 'none';
      try {
        const ctx = c.getContext('webgl2') || c.getContext('webgl');
        if (ctx) {
          gl = ctx.getParameter(ctx.VERSION);
        }
      } catch (e) {
        gl = 'error: ' + e.message;
      }
      return {
        width: c.width,
        height: c.height,
        gl,
        state: window.__game.state(),
      };
    });
    log('Canvas:', canvasInfo.width, 'x', canvasInfo.height, '| GL:', canvasInfo.gl);

    // 1) Cold-start grid shot while the countdown is showing.
    await page.waitForTimeout(800);
    await page.screenshot({ path: join(shotsDir, 'shot1-start.png') });
    log('Saved shot1-start.png');

    // Wait for the lights to go out, then test the keyboard controls directly.
    await page.waitForFunction(
      () => window.__game.state().started,
      null,
      { timeout: 15000 }
    );
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(1300);
    const driveCheckA = await page.evaluate(() => window.__game.debug());
    await page.keyboard.down('KeyD');
    await page.waitForTimeout(450);
    const driveCheckB = await page.evaluate(() => window.__game.debug());
    await page.keyboard.up('KeyD');
    const yawDelta = Math.abs(
      ((driveCheckB.carYaw - driveCheckA.carYaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI
    );
    log(
      'Keyboard check: speed', driveCheckA.speedKmh.toFixed(1),
      'km/h ->', driveCheckB.speedKmh.toFixed(1),
      '| yaw delta from D:', yawDelta.toFixed(3), 'rad'
    );

    // From here on, use the hidden demo autopilot only to obtain clean shots.
    await page.evaluate(() => window.__game.setDemo(true));

    await page.waitForFunction(
      () => window.__game.state().speed > 175,
      null,
      { timeout: 25000 }
    );
    await page.waitForTimeout(250);
    const speedA = await page.evaluate(() => window.__game.state().speed);
    const audioA = await page.evaluate(() => window.__game.state().audio);
    log('Speed after launch:', speedA.toFixed(1), 'km/h | ENGINE:', audioA.engineHz, 'Hz');
    await page.screenshot({ path: join(shotsDir, 'shot2-race.png') });
    log('Saved shot2-race.png');

    // Capture the lap-flash moment; this also verifies lap counting.
    try {
      await page.waitForFunction(
        () => {
          const s = window.__game.state();
          return s.laps >= 1 || s.phase === 'finished';
        },
        null,
        { timeout: 40000 }
      );
    } catch (e) {
      log('Did not complete a lap within the timeout; capturing the moving view.');
    }
    const state = await page.evaluate(() => window.__game.state());

    // Let the pack settle after the lap line: shoot the next corner once the
    // car has recovered and no rival is sitting on top of the chase camera.
    try {
      await page.waitForFunction(
        () => {
          const s = window.__game.debug();
          return s.speedKmh > 230 && s.opponents.every(
            (o) => Math.abs(o.along) > 17 || Math.abs(o.lat) > 3.4
          );
        },
        null,
        { timeout: 8000 }
      );
    } catch (e) {
      log('No clear high-speed frame after the lap; shooting the current view.');
    }
    await page.waitForTimeout(150);
    const mid = await page.evaluate(() => window.__game.debug());
    const speedB = mid.speedKmh;
    const audioB = mid.audio;
    log(
      'Lap checkpoint: speed', mid.speedKmh.toFixed(1),
      'km/h | pos', mid.position,
      '| laps', mid.laps,
      '| engine', mid.audio.engineHz, 'Hz | camera', mid.camera
    );
    await page.screenshot({ path: join(shotsDir, 'shot3-corner.png') });
    log('Saved shot3-corner.png');

    // Verify the alternate bumper camera can be toggled with C.
    await page.keyboard.press('KeyC');
    await page.waitForTimeout(220);
    const bumperCheck = await page.evaluate(
      () => window.__game.state().camera === 'BUMPER CAM'
    );
    log('Bumper camera toggle:', bumperCheck);
    await page.keyboard.press('KeyC');
    await page.waitForTimeout(120);

    // Final control check: keep the demo off and prove S brakes hard.
    await page.evaluate(() => window.__game.setDemo(false));
    await page.keyboard.up('KeyW');
    await page.waitForTimeout(120);
    const speedBeforeBrake = await page.evaluate(() => window.__game.state().speed);
    await page.keyboard.down('KeyS');
    await page.waitForTimeout(900);
    const speedAfterBrake = await page.evaluate(() => window.__game.state().speed);
    await page.keyboard.up('KeyS');
    log(
      'Brake check:', speedBeforeBrake.toFixed(1), '->',
      speedAfterBrake.toFixed(1), 'km/h'
    );

    const lowPitch = driveCheckA.audio.engineHz;
    log(
      'Engine pitch: idle-ish', lowPitch.toFixed(1),
      'Hz -> high speed', audioB.engineHz.toFixed(1), 'Hz'
    );

    const shotChecks = await Promise.all(
      ['shot1-start.png', 'shot2-race.png', 'shot3-corner.png'].map(async (f) => {
        const s = await stat(join(shotsDir, f));
        return `${f}: ${s.size} bytes`;
      })
    );
    log('Screenshots:', shotChecks.join(' | '));

    const passed =
      driveCheckA.speedKmh > 25 &&
      yawDelta > 0.03 &&
      speedBeforeBrake > speedAfterBrake + 15 &&
      speedA > 100 &&
      speedB > 100 &&
      bumperCheck === true &&
      state.laps >= 1 &&
      driveCheckA.audio.started === true &&
      audioB.engineHz > lowPitch + 10 &&
      errors.length === 0;

    log(
      'PASS CONDITIONS: keyboard speed > 25?',
      driveCheckA.speedKmh > 25,
      '| steering?', yawDelta > 0.03,
      '| braking?', speedBeforeBrake > speedAfterBrake + 15,
      '| bumper camera?', bumperCheck,
      '| lap counted?', state.laps >= 1,
      '| audio pitch tracks speed?', audioB.engineHz > lowPitch + 10
    );
    log(passed ? 'RESULT: PASS' : 'RESULT: NEEDS REVIEW');
    if (errors.length) log('Errors:', errors.join('\n'));
  } catch (err) {
    log('FATAL:', err && err.stack ? err.stack : err);
    process.exitCode = 1;
  } finally {
    await browser.close();
    server.close();
  }
})();
