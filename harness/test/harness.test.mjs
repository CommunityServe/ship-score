// node --test harness/test/harness.test.mjs: the parsers, the score and the validator on a synthetic submission built in a temp dir.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import zlib from 'node:zlib';
import { LEVELS, ROOT, avgGib, promptDef, scoreSubmission, subdirs, total, visualPoints } from '../score.mjs';
import { parsers, stripImages } from '../sessions.mjs';
import { check, submissions } from '../validate.mjs';
import { tree } from '../memory.mjs';
import { compare } from '../compare.mjs';

const def = promptDef('voxel-sandbox', 'v1');
const T0 = Date.parse('2026-11-05T10:00:00Z'), MIN = 60_000;

const piLog = (prompt, end) => [
    { type: 'session', timestamp: new Date(T0).toISOString() },
    { type: 'message', message: { role: 'user', content: [{ type: 'text', text: prompt }], timestamp: T0 } },
    { type: 'message', message: { role: 'assistant', timestamp: T0 + MIN, content: [{ type: 'toolCall' }, { type: 'toolCall' }],
        usage: { input: 2000, output: 30000, cacheRead: 100000, cacheWrite: 0 }, durationMs: 400_000 } },
    { type: 'message', message: { role: 'toolResult', isError: true, timestamp: T0 + MIN } },
    { type: 'message', message: { role: 'assistant', timestamp: end, content: [{ type: 'text', text: 'done' }],
        usage: { input: 8000, output: 60000, cacheRead: 900000, cacheWrite: 0 }, durationMs: 800_000 } },
].map((o) => JSON.stringify(o)).join('\n');

test('stripImages drops image bytes and keeps what the parsers count', () => {
    const pi = JSON.stringify({ type: 'message', message: { role: 'toolResult', content: [{ type: 'image', data: 'A'.repeat(5000), mimeType: 'image/png' }] } });
    const cc = JSON.stringify({ message: { role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'B'.repeat(5000) } }] } });
    const usage = JSON.stringify({ type: 'message', message: { role: 'assistant', usage: { input: 7, output: 3 } } });
    const out = stripImages([pi, cc, usage, 'not json'].join('\n'));
    assert.ok(out.length < 1000);
    assert.match(out, /<5000 bytes of base64 stripped>/);
    assert.equal(out.split('\n')[2], usage);
    assert.equal(out.split('\n')[3], 'not json');
});

test('pi parser counts output, uncached input, calls and errors', () => {
    const r = parsers.pi.parse(piLog(def.text, T0 + 10 * MIN));
    assert.deepEqual(r, { prompt: def.text, start: T0, end: T0 + 10 * MIN, out: 90000, uncached: 10000, cached: 1000000, calls: 2, errors: 1, gen_ms: 1_200_000 });
});

test('claude-code parser counts a message split over several lines once', () => {
    const usage = { input_tokens: 5, cache_creation_input_tokens: 995, cache_read_input_tokens: 5000, output_tokens: 700 };
    const log = [
        { type: 'user', timestamp: new Date(T0).toISOString(), message: { content: def.text } },
        { type: 'assistant', timestamp: new Date(T0 + MIN).toISOString(), message: { id: 'm1', usage, content: [{ type: 'thinking' }] } },
        { type: 'assistant', timestamp: new Date(T0 + MIN).toISOString(), message: { id: 'm1', usage, content: [{ type: 'tool_use' }] } },
        { type: 'user', timestamp: new Date(T0 + MIN).toISOString(), message: { content: [{ type: 'tool_result', is_error: true }] } },
        { type: 'assistant', isSidechain: true, timestamp: new Date(T0 + 3 * MIN).toISOString(), message: { id: 'x', usage, content: [] } },
    ].map((o) => JSON.stringify(o)).join('\n');
    const r = parsers['claude-code'].parse(log);
    assert.deepEqual(r, { prompt: def.text, start: T0, end: T0 + MIN, out: 700, uncached: 1000, cached: 5000, calls: 1, errors: 1, gen_ms: null });
});

test('memory averages only the samples inside the run', () => {
    const g = 2 ** 30;
    assert.equal(avgGib(`${T0 - 1} ${100 * g}\n${T0} ${10 * g}\n${T0 + 5} ${30 * g}\n${T0 + 99} ${100 * g}\n`, T0, T0 + 10), 20);
});

test('three runs score 1,000 x squared qualities / costs, a failed run paying its cost', () => {
    assert.equal(total([{ quality: 1, cost: 20 }]), 50);
    assert.equal(total([{ quality: 1, cost: 20 }, { quality: 0.8, cost: 20 }, { quality: 0, cost: 20 }]), 27.3);
});

test('a visual level counts only when it is 0 to 3 with evidence in the run', () => {
    const rd = fs.mkdtempSync(path.join(os.tmpdir(), 'ship-score-'));
    fs.writeFileSync(path.join(rd, 'shot.jpg'), 'x');
    const rubric = { visual: ['a', 'b', 'c', 'd'].map((id) => ({ id })) };
    assert.equal(visualPoints(rubric, { visual: [
        { id: 'a', level: 3, evidence: ['shot.jpg'] }, { id: 'b', level: 2, evidence: [] },
        { id: 'c', level: 9, evidence: ['shot.jpg'] }, { id: 'd', level: 1, evidence: ['missing.jpg'] },
    ] }, rd), 3);
});

test('every prompt\'s checklist adds to 10 and its visual rubric is well formed, with reference frames that exist', () => {
    for (const p of subdirs(path.join(ROOT, 'prompts'))) for (const v of subdirs(path.join(ROOT, 'prompts', p))) {
        const d = promptDef(p, v);
        assert.equal(d.items.reduce((a, i) => a + i.points, 0), 10, `${p} ${v}`);
        for (const r of d.visual ?? []) {
            assert.equal(r.levels.length, LEVELS + 1, `${p} ${r.id}`);
            for (const f of Object.values(r.refs ?? {})) assert.ok(fs.existsSync(path.join(ROOT, 'prompts', p, v, f)), `${p} ${r.id} ${f}`);
        }
    }
});

// A submission whose runs all took 40 minutes in 25 GiB with 100k tokens: cost 20 each.
function makeSubmission(root, { area = 'results', runs = 3, prompt = def.text, judge = 'judge-model', model = 'm', engine = 'e' } = {}) {
    const dir = path.join(root, area, 'voxel-sandbox', 'v1', `2026-11-05_test-rig_${model}_${engine}_pi`);
    for (let n = 1; n <= runs; n++) {
        const rd = path.join(dir, `run-${n}`);
        fs.mkdirSync(path.join(rd, 'game'), { recursive: true });
        fs.mkdirSync(path.join(rd, 'play'));
        fs.writeFileSync(path.join(rd, 'game', 'DONE.md'), 'done\n');
        fs.writeFileSync(path.join(rd, 'play', '04-walk.jpg'), 'x');
        const log = piLog(prompt, T0 + 40 * MIN).replace('"input":8000,"output":60000', '"input":0,"output":68000');
        fs.writeFileSync(path.join(rd, 'session.jsonl.gz'), zlib.gzipSync(log));
        fs.writeFileSync(path.join(rd, 'mem.txt'), `${T0} ${25 * 2 ** 30}\n${T0 + 40 * MIN} ${25 * 2 ** 30}\n`);
        fs.writeFileSync(path.join(rd, 'run.json'), JSON.stringify({ agent: 'pi', capped: false }));
        fs.writeFileSync(path.join(rd, 'play.json'), JSON.stringify({ build: true, done: true, pass: true, frames: [{ file: 'play/04-walk.jpg' }] }));
        fs.writeFileSync(path.join(rd, 'checklist.json'), JSON.stringify({ judge, items: def.items.map((i) => ({
            id: i.id, pass: i.id !== 'water', evidence: i.id === 'water' ? [] : ['play/04-walk.jpg'] })) }));
    }
    const sub = { prompt: 'voxel-sandbox', version: 'v1', rig: { machine: 'Test rig' }, engine: { name: engine, version: '1' },
        model: { name: model }, agent: { name: 'pi' }, inputs: 'text', judge: { model: 'judge-model' } };
    fs.writeFileSync(path.join(dir, 'submission.json'), JSON.stringify(sub));
    const { runs: got, score } = scoreSubmission(dir);
    fs.writeFileSync(path.join(dir, 'submission.json'), JSON.stringify({ ...sub, runs: got, score }));
    return dir;
}

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ship-score-'));

test('a full checklist minus water in 25 GiB, 40 minutes and 100k tokens scores 40.5', () => {
    const { runs, score } = scoreSubmission(makeSubmission(tmp()));
    assert.equal(runs[0].checklist, 9);
    assert.equal(runs[0].cost, 20);
    assert.equal(score, 40.5);
});

test('the validator passes a correct submission and recomputes every number', () => {
    const dir = makeSubmission(tmp());
    assert.deepEqual(check(dir), []);
    const sub = JSON.parse(fs.readFileSync(path.join(dir, 'submission.json')));
    fs.writeFileSync(path.join(dir, 'submission.json'), JSON.stringify({ ...sub, score: sub.score + 1 }));
    assert.match(check(dir).join('\n'), /differs from the recomputed/);
});

test('the validator refuses a wrong prompt, a short official result and missing evidence', () => {
    assert.match(check(makeSubmission(tmp(), { prompt: 'Build a racing game.' })).join('\n'), /first message is not/);
    assert.match(check(makeSubmission(tmp(), { runs: 2 })).join('\n'), /exactly 3 runs/);
    assert.deepEqual(check(makeSubmission(tmp(), { area: 'previews', runs: 1 })), []);
    const dir = makeSubmission(tmp());
    fs.rmSync(path.join(dir, 'run-2', 'play', '04-walk.jpg'));
    assert.match(check(dir).join('\n'), /evidence "play\/04-walk.jpg" does not exist/);
});

test('the comparison draws every submission of one prompt, marks a failed run and refuses mixed prompts', () => {
    const root = tmp(), out = path.join(root, 'compare');
    const a = makeSubmission(root, { model: 'alpha', engine: 'e1' }), b = makeSubmission(root, { model: 'beta', engine: 'e2' });
    fs.writeFileSync(path.join(b, 'run-2', 'run.json'), JSON.stringify({ agent: 'pi', capped: true }));
    const html = fs.readFileSync(compare([a, b], out), 'utf8');
    for (const s of ['alpha', 'beta', 'Missed: Water is visible', 'beta run-2: hit the 90-minute cap', 'class="legend"']) assert.ok(html.includes(s), s);
    assert.ok(fs.existsSync(path.join(out, 'frames', '1.jpg')));
    const sub = JSON.parse(fs.readFileSync(path.join(b, 'submission.json')));
    fs.writeFileSync(path.join(b, 'submission.json'), JSON.stringify({ ...sub, prompt: 'racing' }));
    assert.throws(() => compare([a, b], out), /same prompt/);
});

test('the agent works outside the repo, where no AGENTS.md or CLAUDE.md above it reaches its context', async () => {
    const { execFileSync } = await import('node:child_process');
    const repo = path.resolve(import.meta.dirname, '..', '..');
    const run = path.join(repo, 'previews', 'test-run-' + process.pid, 'run-1');
    const agent = `const fs=require('fs'),p=require('path');let d=process.cwd(),ctx=[];
        for(;;){for(const f of ['AGENTS.md','CLAUDE.md'])if(fs.existsSync(p.join(d,f)))ctx.push(p.join(d,f));const u=p.dirname(d);if(u===d)break;d=u;}
        fs.writeFileSync('where.json',JSON.stringify({cwd:process.cwd(),ctx}));
        fs.mkdirSync(process.argv[1],{recursive:true});
        fs.writeFileSync(p.join(process.argv[1],'s.jsonl'),JSON.stringify({type:'message',message:{role:'user',content:[{type:'text',text:'x'}],timestamp:Date.now()}}));
        fs.mkdirSync('node_modules/.bin',{recursive:true});fs.mkdirSync('node_modules/vite/bin',{recursive:true});
        fs.writeFileSync('node_modules/vite/bin/vite.js','');fs.symlinkSync('../vite/bin/vite.js','node_modules/.bin/vite');
        const dev=require('child_process').spawn('sleep',['300'],{stdio:'ignore'});dev.unref();fs.writeFileSync('dev.pid',String(dev.pid));`;
    try {
        execFileSync('node', [path.join(repo, 'harness', 'run.mjs'), '--prompt', 'voxel-sandbox', '--dir', run, '--agent', 'pi',
            '--engine-pid', String(process.pid), '--', 'node', '-e', agent, '{run_dir}/sessions'], { stdio: 'pipe' });
        const where = JSON.parse(fs.readFileSync(path.join(run, 'game', 'where.json')));
        assert.ok(!where.cwd.startsWith(repo), `the agent ran inside the repo: ${where.cwd}`);
        assert.deepEqual(where.ctx, []);
        assert.ok(fs.existsSync(path.join(run, 'session.jsonl.gz')) && !fs.existsSync(where.cwd), 'session saved, scratch removed');
        assert.ok(fs.existsSync(path.join(run, 'game', 'node_modules', '.bin', 'vite')), 'npm\'s relative .bin links still resolve in the run');
        const dev = Number(fs.readFileSync(path.join(run, 'game', 'dev.pid'), 'utf8'));
        assert.throws(() => process.kill(dev, 0), /ESRCH/, 'a process the agent left running died with the run');
    } finally {
        fs.rmSync(path.dirname(run), { recursive: true, force: true });
    }
});

test('a run whose agent wrote no session log still keeps its game', async () => {
    const { execFileSync } = await import('node:child_process');
    const repo = path.resolve(import.meta.dirname, '..', '..');
    const run = path.join(repo, 'previews', 'test-run-nolog-' + process.pid, 'run-1');
    try {
        assert.throws(() => execFileSync('node', [path.join(repo, 'harness', 'run.mjs'), '--prompt', 'voxel-sandbox', '--dir', run,
            '--agent', 'pi', '--engine-pid', String(process.pid), '--', 'node', '-e', "require('fs').writeFileSync('main.js','game')"],
        { stdio: 'pipe' }), /no pi session log found/);
        assert.equal(fs.readFileSync(path.join(run, 'game', 'main.js'), 'utf8'), 'game');
        assert.ok(fs.existsSync(path.join(run, 'run.json')));
    } finally {
        fs.rmSync(path.dirname(run), { recursive: true, force: true });
    }
});

test('memory follows the engine\'s child processes', async () => {
    const { spawn } = await import('node:child_process');
    const kid = spawn('sleep', ['30'], { stdio: 'ignore' });
    try {
        assert.ok(tree(process.pid).includes(kid.pid));
    } finally {
        kid.kill();
    }
});

test('the validator refuses a run without memory samples', () => {
    const dir = makeSubmission(tmp());
    fs.writeFileSync(path.join(dir, 'run-2', 'mem.txt'), '');
    assert.match(check(dir).join('\n'), /run-2: mem.txt has no sample/);
});

test('the validator skips what git ignores and Finder litter, and reports bad input instead of throwing', () => {
    const root = tmp(), dir = makeSubmission(root);
    for (const d of [path.join(root, 'previews'), path.join(root, 'results', 'voxel-sandbox'), dir, path.join(dir, 'run-1')]) {
        fs.mkdirSync(d, { recursive: true });
        fs.writeFileSync(path.join(d, '.DS_Store'), 'x');
    }
    fs.mkdirSync(path.join(dir, 'run-1', 'game', 'node_modules', '.bin'), { recursive: true });
    fs.symlinkSync('../x', path.join(dir, 'run-1', 'game', 'node_modules', '.bin', 'vite'));
    fs.writeFileSync(path.join(dir, 'run-1', 'game', 'node_modules', 'big'), Buffer.alloc(30 * 2 ** 20));
    assert.deepEqual(submissions(root), [dir]);
    assert.deepEqual(check(dir), []);
    const sub = JSON.parse(fs.readFileSync(path.join(dir, 'submission.json')));
    fs.writeFileSync(path.join(dir, 'submission.json'), JSON.stringify({ ...sub, agent: undefined }));
    assert.match(check(dir).join('\n'), /needs agent.name/);
    fs.writeFileSync(path.join(dir, 'submission.json'), '{ not json');
    assert.match(check(dir).join('\n'), /^submission.json: /);
});
