// Compare submissions of one prompt on one sheet: a card per submission, bars per measure and the table, written to
// compare/<prompt>-<version>_<date>_<time>/ as compare.html (with its frames) and compare.png, then opened.
//   node harness/compare.mjs <submission dir>...
// Bars are the mean over a submission's runs; with several runs a tick marks each run.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ROOT, passed, scoreSubmission, total } from './score.mjs';
import { CSS, esc, ktok, mean, mmss, page } from './ui.mjs';

// The dark categorical palette, in its fixed order; a ninth engine folds into gray.
const SERIES = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];
const OTHER = '#8d8c85';
const json = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
// Local time as YYYY-MM-DDTHH:MM.
const now = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); };
const num = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

const METRICS = [
    { title: 'Ship Score', note: '1,000 × checklists ÷ costs, higher is better', wide: true, total: (s) => s.score, run: (r) => total([r]), fmt: num },
    { title: 'Checklist', note: 'points of 10, higher is better', run: (r) => r.checklist, fmt: (v) => `${num(v)}/10` },
    { title: 'Memory', note: 'average GiB, lower is better', run: (r) => r.avg_gib, fmt: num },
    { title: 'Time', note: "prompt to the agent's last message, lower is better", run: (r) => r.minutes, fmt: mmss },
    { title: 'Tokens', note: 'written plus uncached prompt, lower is better', run: (r) => r.tokens_out + r.tokens_uncached_in, fmt: ktok },
    { title: 'Tool calls', note: 'errors in the table, lower is better', run: (r) => r.tool_calls, fmt: (v) => String(Math.round(v)) },
];

const why = (run, play) => (run.capped ? 'hit the 90-minute cap' : !play.build ? 'npm run build failed' : !play.done ? 'no DONE.md'
    : !play.web ? 'no web build' : play.n_errors ? `${play.n_errors} page error(s)` : play.blank ? 'blank first frame'
        : !play.changed ? 'no input changed the screen' : 'did not ship');

const CMP_CSS = `.wrap{max-width:1400px}.kicker{color:var(--muted);font-size:13px;letter-spacing:.08em;text-transform:uppercase;margin:0 0 4px}
.warn{border:1px solid var(--bad);border-radius:10px;padding:10px 14px;margin:14px 0;color:var(--text)}
.legend{display:flex;flex-wrap:wrap;gap:18px;color:var(--text2);font-size:14px;margin-top:10px}
.dot{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:7px}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px;margin:24px 0}
.card{background:var(--card);border-radius:12px;overflow:hidden}.shot{position:relative;aspect-ratio:16/9;background:#000}
.shot img{width:100%;height:100%;object-fit:cover;display:block}
.badge{position:absolute;top:10px;right:10px;background:rgba(18,18,17,.85);border-radius:8px;padding:2px 10px;font-size:11px;letter-spacing:.06em;color:var(--text2)}
.badge b{font-size:22px;color:var(--text);margin-left:5px;letter-spacing:0}.meta{padding:12px 14px 14px;font-size:14px}
.meta .name{font-weight:700;font-size:15px}.meta ul{margin:6px 0 0;padding-left:18px;color:var(--text2);font-size:13px}
.panels{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px}.panel{background:var(--card);border-radius:12px;padding:16px 18px}
.panel.wide{grid-column:1/-1}.panel h3{margin:0 0 12px}.panel h3 span{color:var(--muted);font-weight:400;font-size:13px;margin-left:8px}
.rows{display:grid;grid-template-columns:max-content 1fr;gap:8px 12px;align-items:center;font-size:14px}.lbl{color:var(--text2);text-align:right}
.track{position:relative;height:16px;margin-right:90px}.bar{position:absolute;left:0;top:0;bottom:0;min-width:2px;border-radius:0 4px 4px 0}
.tick{position:absolute;top:-3px;bottom:-3px;width:2px;margin-left:-1px;border-radius:1px;background:var(--text)}
.val{position:absolute;top:50%;transform:translateY(-50%);white-space:nowrap;font-weight:600;font-variant-numeric:tabular-nums}.notes{color:var(--muted);font-size:13px;margin-top:16px}`;

// Reads the submissions, writes compare.html and the cards' frames into `out`, returns the HTML file.
export function compare(dirs, out) {
    const subs = dirs.map((dir) => ({ dir, ...scoreSubmission(dir) }));
    const prompts = new Set(subs.map((s) => `${s.sub.prompt} ${s.sub.version}`));
    if (prompts.size > 1) throw new Error(`scores only compare on the same prompt, got ${[...prompts].join(', ')}`);
    const engines = [...new Set(subs.map((s) => s.sub.engine.name))].sort();
    const rigs = [...new Set(subs.map((s) => s.sub.rig.machine))];
    const names = subs.map((s) => [s.sub.model.name, s.sub.model.quant].filter(Boolean).join(' '));
    fs.mkdirSync(path.join(out, 'frames'), { recursive: true });

    subs.forEach((s, i) => {
        s.label = names.filter((n) => n === names[i]).length > 1 ? `${names[i]} · ${s.sub.engine.name} · ${s.sub.agent.name}` : names[i];
        s.color = SERIES[engines.indexOf(s.sub.engine.name)] ?? OTHER;
        s.shipped = s.runs.filter((r) => r.shipped).length;
        s.failed = s.runs.filter((r) => !r.shipped).map((r) => {
            const rd = path.join(s.dir, r.dir);
            return `${s.label} ${r.dir}: ${why(json(path.join(rd, 'run.json')), json(path.join(rd, 'play.json')))}`;
        });
        // Missed items over the shipped runs, with how many of them missed it when not all did.
        const shipped = s.runs.filter((r) => r.shipped);
        const got = shipped.map((r) => passed(s.def, json(path.join(s.dir, r.dir, 'checklist.json')), path.join(s.dir, r.dir)).map((x) => x.id));
        s.missed = s.def.items.map((item) => [item, got.filter((ids) => !ids.includes(item.id)).length]).filter(([, n]) => n)
            .map(([item, n]) => (n === got.length ? item.text : `${item.text} (${n} of ${got.length} runs)`));
        // The card shows the best run's frame after the game started.
        const best = [...s.runs].sort((a, b) => b.shipped - a.shipped || b.checklist - a.checklist)[0];
        const frames = json(path.join(s.dir, best.dir, 'play.json')).frames ?? [];
        const f = frames.find((x) => x.file.includes('-start')) ?? frames[0];
        if (f && fs.existsSync(path.join(s.dir, best.dir, f.file))) {
            s.frame = `frames/${i + 1}.jpg`;
            fs.copyFileSync(path.join(s.dir, best.dir, f.file), path.join(out, s.frame));
        }
    });
    subs.sort((a, b) => b.score - a.score);

    const card = (s) => `<div class="card"><div class="shot">${s.frame ? `<img src="${s.frame}" alt="">` : ''}
<span class="badge">SHIP <b>${s.shipped ? num(s.score) : 'FAIL'}</b></span></div><div class="meta">
<div class="name"><i class="dot" style="background:${s.color}"></i>${esc(s.label)}</div>
<div class="muted">${esc(s.sub.engine.name)} ${esc(s.sub.engine.version)} · ${esc(s.sub.agent.name)}${rigs.length > 1 ? ` · ${esc(s.sub.rig.machine)}` : ''}
· ${s.shipped}/${s.runs.length} shipped</div>
${s.shipped ? `<div>Checklist ${num(mean(s.runs.map((r) => r.checklist)))}/10</div>
<ul>${s.missed.length ? s.missed.map((m) => `<li>Missed: ${esc(m)}</li>`).join('') : '<li>Every item</li>'}</ul>` : '<ul><li>Did not ship</li></ul>'}</div></div>`;

    // A total (the Ship Score) is not a mean of its runs, so only the other bars get run ticks.
    const panel = (m) => {
        const vals = subs.map((s) => ({ s, v: m.total ? m.total(s) : mean(s.runs.map(m.run)), runs: s.runs.map(m.run) }))
            .map((x) => ({ ...x, ticks: m.total || x.runs.length < 2 ? [] : x.runs }));
        const max = Math.max(...vals.flatMap((x) => [x.v, ...x.ticks])) || 1;
        const pct = (v) => ((100 * v) / max).toFixed(2);
        const rows = vals.map(({ s, v, runs, ticks }) => {
            const label = m.total && !s.shipped ? 'FAIL' : m.fmt(v);
            const tip = `${s.label}: ${label}${runs.length > 1 ? ` (${s.runs.map((r, i) => `${r.dir} ${m.fmt(runs[i])}`).join(', ')})` : ''}`;
            return `<div class="lbl">${esc(s.label)}</div><div class="track" title="${esc(tip)}">
<i class="bar" style="width:${pct(v)}%;background:${s.color}"></i>${ticks.map((x) => `<i class="tick" style="left:${pct(x)}%"></i>`).join('')}
<span class="val" style="left:calc(${pct(Math.max(v, ...ticks))}% + 10px)">${label}</span></div>`;
        }).join('');
        return `<div class="panel${m.wide ? ' wide' : ''}"><h3>${m.title}<span>${esc(m.note)}</span></h3><div class="rows">${rows}</div></div>`;
    };

    const avg = (s, f) => mean(s.runs.map(f));
    const table = `<table><tr><th>Submission</th><th>Engine · agent</th><th>Ship Score</th><th>Shipped</th><th>Checklist</th><th>Avg GiB</th>
<th>Time</th><th>Tokens out</th><th>Uncached in</th><th>Tool calls (errors)</th></tr>${subs.map((s) => `<tr>
<td><i class="dot" style="background:${s.color}"></i>${esc(s.label)}</td><td>${esc(s.sub.engine.name)} · ${esc(s.sub.agent.name)}</td>
<td class="score">${s.shipped ? num(s.score) : '<span class="fail">FAIL</span>'}</td><td>${s.shipped}/${s.runs.length}</td>
<td>${num(avg(s, (r) => r.checklist))}/10</td><td>${num(avg(s, (r) => r.avg_gib))}</td><td>${mmss(avg(s, (r) => r.minutes))}</td>
<td>${Math.round(avg(s, (r) => r.tokens_out)).toLocaleString()}</td><td>${Math.round(avg(s, (r) => r.tokens_uncached_in)).toLocaleString()}</td>
<td>${Math.round(avg(s, (r) => r.tool_calls))} (${Math.round(avg(s, (r) => r.tool_errors))})</td></tr>`).join('')}</table>`;

    const { prompt, version } = subs[0].sub;
    const notes = [
        ...(subs.some((s) => s.runs.length > 1) ? ['Ship Score is each submission\'s total; the other bars and the table are the mean over runs, a white tick marking each run.'] : []),
        ...subs.flatMap((s) => s.failed),
    ];
    const date = now().slice(0, 10);
    const html = page(`${prompt} ${version}: Ship Score comparison`, `<p class="kicker">Ship Score · ${esc(rigs.join(' / '))} · ${date}</p>
<h1>${esc(prompt)} ${esc(version)}: ${subs.length} submission${subs.length > 1 ? 's' : ''}</h1>
<p class="sub">Each submission built the same game from the pinned prompt through an agent, with a 90-minute cap.
<code>score = 1,000 × checklist ÷ (√avg GiB × minutes × M tokens)</code>, tokens being written plus uncached prompt tokens.
A run ships when <code>npm run build</code> passes, DONE.md exists and the play check passes; a failed run scores 0 and still pays its cost.</p>
${rigs.length > 1 ? `<div class="warn">These submissions ran on different machines (${esc(rigs.join(', '))}): their scores do not compare.</div>` : ''}
${engines.length > 1 ? `<div class="legend">${engines.map((e) => `<span><i class="dot" style="background:${SERIES[engines.indexOf(e)] ?? OTHER}"></i>${esc(e)}</span>`).join('')}</div>` : ''}
<div class="cards">${subs.map(card).join('')}</div>
<div class="panels">${METRICS.map(panel).join('')}</div>${table}
${notes.length ? `<ul class="notes">${notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}`, `<style>${CSS}\n${CMP_CSS}</style>`);
    const file = path.join(out, 'compare.html');
    fs.writeFileSync(file, html);
    return file;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const dirs = process.argv.slice(2).map((d) => path.resolve(d));
    if (!dirs.length) {
        console.error('usage: compare.mjs <submission dir>...');
        process.exit(2);
    }
    const first = json(path.join(dirs[0], 'submission.json'));
    const stamp = now().replace('T', '_').replace(':', '');
    const out = path.join(ROOT, 'compare', `${first.prompt}-${first.version}_${stamp}`);
    const html = compare(dirs, out);
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true });
    const tab = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2 });
    await tab.goto(pathToFileURL(html).href, { waitUntil: 'load' });
    await tab.screenshot({ path: path.join(out, 'compare.png'), fullPage: true });
    await browser.close();
    const opener = { darwin: ['open'], win32: ['cmd', '/c', 'start', ''] }[process.platform] ?? ['xdg-open'];
    spawn(opener[0], [...opener.slice(1), html], { detached: true, stdio: 'ignore' }).unref();
    console.log(`${path.relative(process.cwd(), html)} and compare.png beside it`);
}
