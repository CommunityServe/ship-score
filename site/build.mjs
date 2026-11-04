// The GitHub Pages site: one leaderboard per prompt (official = 3 runs, previews below), a page per submission with
// every run's frames, checklist and a playable copy of the game. `node site/build.mjs [out dir]` (default _site).
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, scoreSubmission } from '../harness/score.mjs';
import { submissions } from '../harness/validate.mjs';

const OUT = path.resolve(process.argv[2] ?? path.join(ROOT, '_site'));
const REPO = 'https://github.com/CommunityServe/ship-score';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const mmss = (m) => `${Math.floor(m)}:${String(Math.round((m % 1) * 60)).padStart(2, '0')}`;
const ktok = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : `${Math.round(n / 1e3)}k`);

const CSS = `:root{--bg:#121211;--card:#1a1a19;--line:#2e2e2b;--text:#f0efec;--text2:#c3c2b7;--muted:#8d8c85;--accent:#3987e5;--bad:#e5484d}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 -apple-system,"SF Pro Text","Helvetica Neue",Arial,sans-serif}
.wrap{max-width:1180px;margin:0 auto;padding:36px 24px 80px}a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
h1{font-size:34px;margin:0 0 6px}h2{font-size:22px;margin:40px 0 8px}h3{font-size:17px;margin:22px 0 8px}.sub,.muted{color:var(--text2)}.muted{color:var(--muted)}
code{font:13px ui-monospace,Menlo,monospace;background:var(--card);padding:1px 5px;border-radius:5px}
table{width:100%;border-collapse:collapse;background:var(--card);border-radius:12px;overflow:hidden;font-size:14px;margin:8px 0}
th,td{padding:9px 12px;border-bottom:1px solid var(--line);text-align:right;vertical-align:middle}th{color:var(--muted);font-weight:500}
th:nth-child(-n+2),td:nth-child(-n+2){text-align:left}tr:last-child td{border-bottom:0}td img{width:96px;border-radius:6px;display:block}
.score{font-weight:700;font-size:16px}.fail{color:var(--bad);font-weight:700}.empty{background:var(--card);border-radius:12px;padding:18px;color:var(--text2)}
.frames{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.frames figure{margin:0}.frames img{width:100%;border-radius:8px;display:block}
.frames figcaption{color:var(--muted);font-size:12px;margin-top:3px}.ok{color:#3ecf8e}.no{color:var(--bad)}nav{margin-bottom:24px}`;

const page = (title, body, depth) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<link rel="stylesheet" href="${'../'.repeat(depth)}style.css"></head><body><div class="wrap">${body}</div></body></html>`;

const prompts = fs.readdirSync(path.join(ROOT, 'prompts')).flatMap((p) => fs.readdirSync(path.join(ROOT, 'prompts', p)).map((v) => {
    const c = JSON.parse(fs.readFileSync(path.join(ROOT, 'prompts', p, v, 'checklist.json'), 'utf8'));
    return { ...c, key: `${p}/${v}` };
})).sort((a, b) => a.difficulty - b.difficulty || a.prompt.localeCompare(b.prompt));

const subs = submissions(ROOT).map((dir) => {
    const [area, p, v, id] = dir.split(path.sep).slice(-4);
    const { sub, def, runs, score } = scoreSubmission(dir);
    return { dir, area, key: `${p}/${v}`, id, sub, def, runs, score, href: `s/${p}/${v}/${id}/` };
});

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'style.css'), CSS);

const thumb = (s) => {
    const f = s.runs.map((r) => JSON.parse(fs.readFileSync(path.join(s.dir, r.dir, 'play.json'), 'utf8')).frames?.find((x) => x.file.includes('-start')))
        .find(Boolean);
    return f ? `<img src="${s.href}${s.runs[0].dir}/${f.file}" alt="">` : '';
};
const rowsFor = (list) => list.sort((a, b) => b.score - a.score).map((s, i) => `<tr><td>${i + 1}</td>
<td><a href="${s.href}">${esc(s.sub.model.name)}</a><div class="muted">${esc(s.sub.model.quant ?? '')} · ${esc(s.sub.engine.name)} · ${esc(s.sub.agent.name)} · ${esc(s.sub.rig.machine)}</div></td>
<td>${thumb(s)}</td><td class="score">${s.score}</td><td>${mean(s.runs.map((r) => r.checklist)).toFixed(1)}/10</td>
<td>${s.runs.filter((r) => r.shipped).length}/${s.runs.length}</td><td>${mean(s.runs.map((r) => r.avg_gib)).toFixed(1)}</td>
<td>${mmss(mean(s.runs.map((r) => r.minutes)))}</td><td>${ktok(mean(s.runs.map((r) => r.tokens_out + r.tokens_uncached_in)))}</td></tr>`).join('');
const table = (list) => `<table><tr><th>#</th><th>Model</th><th></th><th>Score</th><th>Checklist</th><th>Shipped</th><th>Avg GiB</th><th>Time</th><th>Tokens</th></tr>${rowsFor(list)}</table>`;

const boards = prompts.map((p) => {
    const mine = subs.filter((s) => s.key === p.key), official = mine.filter((s) => s.area === 'results'), previews = mine.filter((s) => s.area === 'previews');
    return `<h2 id="${esc(p.prompt)}">${esc(p.prompt)} ${esc(p.version)} <span class="muted">· difficulty ${p.difficulty}/5</span></h2>
<p class="muted"><a href="${REPO}/blob/main/prompts/${p.key}/prompt.txt">prompt</a> · <a href="${REPO}/blob/main/prompts/${p.key}/checklist.json">checklist</a></p>
${official.length ? table(official) : '<div class="empty">No official results yet: three runs on one rig, submitted through a PR.</div>'}
${previews.length ? `<h3>Previews <span class="muted">(fewer than 3 runs, not ranked)</span></h3>${table(previews)}` : ''}`;
}).join('');

fs.writeFileSync(path.join(OUT, 'index.html'), page('Ship Score', `<h1>Ship Score</h1>
<p class="sub">Give a model one real job: build a game from a pinned prompt with an agent, on your machine. The score is what the game got
right (a checklist judged from screenshots) per unit of what finishing cost: <code>1,000 × checklist ÷ (√avg GiB × minutes × M tokens)</code>.
Scores compare only runs of the same prompt on the same machine class. Play every game from its page.</p>
<p><a href="${REPO}">Run it and submit</a> · <a href="${REPO}/blob/main/AGENTS.md">AGENTS.md</a> · <a href="https://mlxserve.com/blog/ship-score/">Why this eval</a></p>
${boards}`, 0));

for (const s of subs) {
    const out = path.join(OUT, s.href);
    const runs = s.runs.map((r) => {
        const rd = path.join(s.dir, r.dir), ro = path.join(out, r.dir);
        for (const d of ['play', 'web']) if (fs.existsSync(path.join(rd, d))) fs.cpSync(path.join(rd, d), path.join(ro, d), { recursive: true });
        const play = JSON.parse(fs.readFileSync(path.join(rd, 'play.json'), 'utf8'));
        const judged = JSON.parse(fs.readFileSync(path.join(rd, 'checklist.json'), 'utf8'));
        const items = s.def.items.map((i) => {
            const j = judged.items.find((x) => x.id === i.id);
            const ev = (j?.evidence ?? []).map((e) => `<a href="${r.dir}/${esc(e)}">${esc(path.basename(e))}</a>`).join(' ');
            return `<tr><td>${j?.pass ? '<span class="ok">yes</span>' : '<span class="no">no</span>'}</td><td>${esc(i.text)}</td><td>${i.points}</td><td>${ev}</td></tr>`;
        }).join('');
        const frames = (play.frames ?? []).map((f) => `<figure><a href="${r.dir}/${f.file}"><img src="${r.dir}/${f.file}" loading="lazy" alt=""></a>
<figcaption>${esc(path.basename(f.file, '.jpg'))}</figcaption></figure>`).join('');
        const playLink = fs.existsSync(path.join(rd, 'web', 'index.html')) ? ` · <a href="${r.dir}/web/">play this game</a>` : '';
        return `<h2>${r.dir}: ${r.shipped ? `checklist ${r.checklist}/10` : '<span class="fail">FAILED</span>'}</h2>
<p class="muted">${r.avg_gib} GiB · ${mmss(r.minutes)} · ${r.tokens_out.toLocaleString()} tokens out / ${r.tokens_uncached_in.toLocaleString()} uncached in
· ${r.tool_calls} tool calls (${r.tool_errors} errors) · play check ${play.pass ? 'passed' : 'failed'}${playLink}
· <a href="${REPO}/tree/main/${path.relative(ROOT, rd)}/game">source</a></p>
<table><tr><th></th><th>Checklist item</th><th>Points</th><th>Evidence</th></tr>${items}</table><div class="frames">${frames}</div>`;
    }).join('');
    const m = s.sub;
    fs.writeFileSync(path.join(out, 'index.html'), page(`${m.model.name}: Ship Score`, `<nav><a href="../../../../">← Ship Score</a></nav>
<h1>${esc(m.model.name)} <span class="muted">${esc(m.model.quant ?? '')}</span></h1>
<p class="sub">${esc(s.key)} · score <b>${s.score}</b>${s.area === 'previews' ? ' (preview)' : ''} · ${esc(m.rig.machine)} · ${esc(m.engine.name)} ${esc(m.engine.version)}
· ${esc(m.agent.name)} ${esc(m.agent.version ?? '')} · ${esc(m.inputs)} input · judged by ${esc(m.judge.model)}</p>
${m.notes ? `<p class="muted">${esc(m.notes)}</p>` : ''}${runs}`, 4));
}
console.log(`${subs.length} submission(s), ${prompts.length} prompt(s) -> ${OUT}`);
