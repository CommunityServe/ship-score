// The play check: build the game, publish a copy with relative paths (web/), serve it, play the same scripted
// steps for every game in headless Chromium and write play/NN-<step>.jpg + play.json. With --steps the judge plays
// extra steps against the built web/ into another folder: `node harness/play.mjs <run> --steps s.json --out play/extra-1`.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const W = 1280, H = 720;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.glb': 'model/gltf-binary' };

const sh = (cmd, cwd, log) => {
    try {
        fs.appendFileSync(log, `$ ${cmd}\n` + execSync(cmd, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 600_000 }));
        return true;
    } catch (e) {
        fs.appendFileSync(log, `${e.stdout ?? ''}${e.stderr ?? ''}\nexit ${e.status}\n`);
        return false;
    }
};

const serve = (root) => new Promise((done) => {
    const server = http.createServer((req, res) => {
        let f = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
        if (!f.startsWith(root)) return res.writeHead(403).end();
        if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
        if (!fs.existsSync(f)) return res.writeHead(404).end();
        res.writeHead(200, { 'content-type': TYPES[path.extname(f)] ?? 'application/octet-stream' }).end(fs.readFileSync(f));
    }).listen(0, '127.0.0.1', () => done(server));
});

// Luminance spread of each frame (a blank screen is ~0) and its mean change from the previous frame, on a 160x90 copy.
async function frameStats(browser, files) {
    const page = await browser.newPage();
    const urls = files.map((f) => 'data:image/jpeg;base64,' + fs.readFileSync(f).toString('base64'));
    const stats = await page.evaluate(async (urls) => {
        const c = Object.assign(document.createElement('canvas'), { width: 160, height: 90 }), g = c.getContext('2d');
        let prev = null;
        const out = [];
        for (const u of urls) {
            const img = new Image();
            img.src = u;
            await img.decode();
            g.drawImage(img, 0, 0, 160, 90);
            const d = g.getImageData(0, 0, 160, 90).data, lum = [];
            for (let i = 0; i < d.length; i += 4) lum.push(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
            const mean = lum.reduce((a, b) => a + b, 0) / lum.length;
            const sd = Math.sqrt(lum.reduce((a, b) => a + (b - mean) ** 2, 0) / lum.length);
            const diff = prev ? lum.reduce((a, b, i) => a + Math.abs(b - prev[i]), 0) / lum.length : 0;
            out.push({ stddev: Math.round(sd * 10) / 10, diff: Math.round(diff * 10) / 10 });
            prev = lum;
        }
        return out;
    }, urls);
    await page.close();
    return stats;
}

async function playSteps(browser, url, steps, outDir) {
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    // Headless Chromium refuses pointer lock: stub it so every game sees a locked pointer after the first click.
    await page.addInitScript(() => {
        let locked = null;
        const change = () => setTimeout(() => document.dispatchEvent(new Event('pointerlockchange')));
        Object.defineProperty(Document.prototype, 'pointerLockElement', { get: () => locked, configurable: true });
        Element.prototype.requestPointerLock = function () { locked = this; change(); return Promise.resolve(); };
        Document.prototype.exitPointerLock = function () { locked = null; change(); };
    });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(url, { waitUntil: 'load', timeout: 60_000 });
    const files = [];
    for (const s of steps) {
        if (s.wait) await page.waitForTimeout(s.wait);
        if (s.start) {
            const b = page.getByRole('button', { name: /play|start|enter|begin/i }).first();
            if (await b.isVisible().catch(() => false)) await b.click(); else await page.mouse.click(W / 2, H / 2);
        }
        if (s.press) await page.keyboard.press(s.press);
        if (s.hold) { await page.keyboard.down(s.hold); await page.waitForTimeout(s.ms ?? 1000); await page.keyboard.up(s.hold); }
        if (s.look) {
            // Mouse look reads movementX/Y, which synthetic events can carry; 20 small moves like a real hand.
            await page.evaluate(([dx, dy]) => {
                const t = document.pointerLockElement || document.querySelector('canvas') || document.body;
                for (let i = 0; i < 20; i++) t.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, movementX: dx / 20, movementY: dy / 20 }));
            }, s.look);
        }
        if (s.click) {
            const [x, y, button] = Array.isArray(s.click) ? s.click : [W / 2, H / 2, s.click];
            await page.mouse.move(x, y);
            await page.mouse.down({ button }); await page.waitForTimeout(120); await page.mouse.up({ button });
        }
        if (s.drag) {
            const [x1, y1, x2, y2] = s.drag;
            await page.mouse.move(x1, y1); await page.mouse.down();
            await page.mouse.move(x2, y2, { steps: 10 }); await page.mouse.up();
        }
        if (s.shot) {
            const f = path.join(outDir, `${String(files.length + 1).padStart(2, '0')}-${s.shot}.jpg`);
            await page.screenshot({ path: f, type: 'jpeg', quality: 80 });
            files.push(f);
        }
    }
    await page.close();
    return { files, errors };
}

export async function playCheck(runDir, { steps = JSON.parse(fs.readFileSync(path.join(HERE, 'steps.json'), 'utf8')), out = 'play' } = {}) {
    const { chromium } = await import('playwright');
    const game = path.join(runDir, 'game'), web = path.join(runDir, 'web'), outDir = path.join(runDir, out);
    const extra = out !== 'play';
    fs.mkdirSync(outDir, { recursive: true });
    const r = {};
    if (!extra) {
        const log = path.join(outDir, 'build.log');
        fs.writeFileSync(log, '');
        r.build = fs.existsSync(path.join(game, 'package.json'))
            && (fs.existsSync(path.join(game, 'node_modules')) || sh('npm install --no-audit --no-fund', game, log))
            && sh('npm run build', game, log);
        r.web = r.build && sh('npx vite build --base ./ --outDir ../web --emptyOutDir', game, log) && fs.existsSync(path.join(web, 'index.html'));
        r.done = fs.existsSync(path.join(game, 'DONE.md'));
    }
    if (!fs.existsSync(path.join(web, 'index.html'))) {
        if (!extra) fs.writeFileSync(path.join(runDir, 'play.json'), JSON.stringify({ ...r, pass: false }, null, 2) + '\n');
        return { ...r, pass: false };
    }
    const server = await serve(web);
    const browser = await chromium.launch({ headless: true, args: ['--ignore-gpu-blocklist', '--enable-webgl', '--use-angle=metal'] });
    try {
        const { files, errors } = await playSteps(browser, `http://127.0.0.1:${server.address().port}/`, steps, outDir);
        const stats = await frameStats(browser, files);
        const frames = files.map((f, i) => ({ file: path.relative(runDir, f), ...stats[i] }));
        if (extra) {
            fs.writeFileSync(path.join(outDir, 'frames.json'), JSON.stringify({ steps, errors, frames }, null, 2) + '\n');
            return { frames, errors };
        }
        const start = frames.findIndex((f) => f.file.includes('-start'));
        Object.assign(r, {
            n_errors: errors.length, errors: errors.slice(0, 10), frames,
            blank: frames[0].stddev < 3, changed: frames.slice(start + 1).some((f) => f.diff > 1.5),
        });
        r.pass = r.build && r.done && r.n_errors === 0 && !r.blank && r.changed;
        fs.writeFileSync(path.join(runDir, 'play.json'), JSON.stringify(r, null, 2) + '\n');
        return r;
    } finally {
        await browser.close();
        server.close();
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const args = process.argv.slice(2), opt = (k) => args[args.indexOf(k) + 1];
    const runDir = path.resolve(args[0]);
    const r = await playCheck(runDir, args.includes('--steps')
        ? { steps: JSON.parse(fs.readFileSync(opt('--steps'), 'utf8')), out: opt('--out') ?? 'play/extra' } : {});
    console.log(JSON.stringify({ ...r, frames: r.frames?.length }, null, 2));
}
