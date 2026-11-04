// node --test harness/test: the parsers, the score and the validator on a synthetic submission built in a temp dir.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import zlib from 'node:zlib';
import { avgGib, promptDef, scoreSubmission, total } from '../score.mjs';
import { parsers } from '../sessions.mjs';
import { check } from '../validate.mjs';

const def = promptDef('voxel-sandbox', 'v1');
const T0 = Date.parse('2026-11-05T10:00:00Z'), MIN = 60_000;

const piLog = (prompt, end) => [
    { type: 'session', timestamp: new Date(T0).toISOString() },
    { type: 'message', message: { role: 'user', content: [{ type: 'text', text: prompt }], timestamp: T0 } },
    { type: 'message', message: { role: 'assistant', timestamp: T0 + MIN, content: [{ type: 'toolCall' }, { type: 'toolCall' }],
        usage: { input: 2000, output: 30000, cacheRead: 100000, cacheWrite: 0 } } },
    { type: 'message', message: { role: 'toolResult', isError: true, timestamp: T0 + MIN } },
    { type: 'message', message: { role: 'assistant', timestamp: end, content: [{ type: 'text', text: 'done' }],
        usage: { input: 8000, output: 60000, cacheRead: 900000, cacheWrite: 0 } } },
].map((o) => JSON.stringify(o)).join('\n');

test('pi parser counts output, uncached input, calls and errors', () => {
    const r = parsers.pi.parse(piLog(def.text, T0 + 10 * MIN));
    assert.deepEqual(r, { prompt: def.text, start: T0, end: T0 + 10 * MIN, out: 90000, uncached: 10000, cached: 1000000, calls: 2, errors: 1 });
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
    assert.deepEqual(r, { prompt: def.text, start: T0, end: T0 + MIN, out: 700, uncached: 1000, cached: 5000, calls: 1, errors: 1 });
});

test('memory averages only the samples inside the run', () => {
    const g = 2 ** 30;
    assert.equal(avgGib(`${T0 - 1} ${100 * g}\n${T0} ${10 * g}\n${T0 + 5} ${30 * g}\n${T0 + 99} ${100 * g}\n`, T0, T0 + 10), 20);
});

test('three runs score 1,000 x checklists / costs, a failed run paying its cost', () => {
    assert.equal(total([{ checklist: 10, cost: 20 }]), 50);
    assert.equal(total([{ checklist: 10, cost: 20 }, { checklist: 8, cost: 20 }, { checklist: 0, cost: 20 }]), 30);
});

// A submission whose runs all took 40 minutes in 25 GiB with 100k tokens: cost 20 each.
function makeSubmission(root, { area = 'results', runs = 3, prompt = def.text, judge = 'judge-model' } = {}) {
    const dir = path.join(root, area, 'voxel-sandbox', 'v1', '2026-11-05_test-rig_test-model_test-engine_pi');
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
        fs.writeFileSync(path.join(rd, 'play.json'), JSON.stringify({ build: true, done: true, pass: true }));
        fs.writeFileSync(path.join(rd, 'checklist.json'), JSON.stringify({ judge, items: def.items.map((i) => ({
            id: i.id, pass: i.id !== 'water', evidence: i.id === 'water' ? [] : ['play/04-walk.jpg'] })) }));
    }
    const sub = { prompt: 'voxel-sandbox', version: 'v1', rig: { machine: 'Test rig' }, engine: { name: 'e', version: '1' },
        model: { name: 'm' }, agent: { name: 'pi' }, inputs: 'text', judge: { model: 'judge-model' } };
    fs.writeFileSync(path.join(dir, 'submission.json'), JSON.stringify(sub));
    const { runs: got, score } = scoreSubmission(dir);
    fs.writeFileSync(path.join(dir, 'submission.json'), JSON.stringify({ ...sub, runs: got, score }));
    return dir;
}

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ship-score-'));

test('a full checklist minus water in 25 GiB, 40 minutes and 100k tokens scores 45', () => {
    const { runs, score } = scoreSubmission(makeSubmission(tmp()));
    assert.equal(runs[0].checklist, 9);
    assert.equal(runs[0].cost, 20);
    assert.equal(score, 45);
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
