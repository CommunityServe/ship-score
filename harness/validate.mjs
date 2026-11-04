// What CI runs on every PR: each submission's shape, its evidence, and its numbers recomputed from the raw files.
// `node harness/validate.mjs [submission dir...]` (default: every submission under results/ and previews/).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, promptDef, scoreSubmission } from './score.mjs';

const MAX_SUBMISSION = 25 * 2 ** 20, MAX_FILE = 10 * 2 ** 20;
const NAME = /^\d{4}-\d{2}-\d{2}_[a-z0-9][a-z0-9._-]*$/;
const INPUTS = ['text', 'text+images'];

export const submissions = (root) => ['results', 'previews'].flatMap((area) => {
    const base = path.join(root, area);
    if (!fs.existsSync(base)) return [];
    return fs.readdirSync(base).flatMap((p) => fs.readdirSync(path.join(base, p)).flatMap((v) =>
        fs.readdirSync(path.join(base, p, v)).map((id) => path.join(base, p, v, id))));
});

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const f = path.join(dir, e.name);
    return e.isSymbolicLink() ? [{ f, link: true }] : e.isDirectory() ? walk(f) : [{ f, size: fs.statSync(f).size }];
});

export function check(dir) {
    const errs = [], err = (m) => errs.push(m);
    const [area, prompt, version, id] = dir.split(path.sep).slice(-4);
    if (!NAME.test(id)) err(`folder name must be <YYYY-MM-DD>_<lowercase-slug>, got "${id}"`);
    const f = path.join(dir, 'submission.json');
    if (!fs.existsSync(f)) return [...errs, 'no submission.json'];
    const sub = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (sub.prompt !== prompt || sub.version !== version) err(`submission.json says ${sub.prompt} ${sub.version}, folder says ${prompt} ${version}`);
    let def;
    try { def = promptDef(prompt, version); } catch { return [...errs, `unknown prompt ${prompt} ${version}`]; }
    for (const k of ['rig.machine', 'engine.name', 'engine.version', 'model.name', 'agent.name', 'judge.model']) {
        if (typeof k.split('.').reduce((o, p) => o?.[p], sub) !== 'string') err(`submission.json needs ${k}`);
    }
    if (!INPUTS.includes(sub.inputs)) err(`inputs must be one of ${INPUTS.join(', ')}`);
    const runs = fs.readdirSync(dir).filter((d) => /^run-\d+$/.test(d)).sort();
    if (runs.join() !== runs.map((_, i) => `run-${i + 1}`).join()) err('runs must be run-1, run-2, ... with no gaps');
    if (area === 'results' && runs.length !== 3) err(`an official result has exactly 3 runs (${runs.length} here); fewer go to previews/`);
    if (area === 'previews' && (runs.length < 1 || runs.length > 3)) err('a preview has 1 to 3 runs');
    for (const r of runs) {
        const rd = path.join(dir, r);
        for (const need of ['run.json', 'session.jsonl.gz', 'mem.txt', 'play.json', 'checklist.json', 'game']) {
            if (!fs.existsSync(path.join(rd, need))) err(`${r}: missing ${need}`);
        }
        if (!fs.existsSync(path.join(rd, 'checklist.json'))) continue;
        const run = fs.existsSync(path.join(rd, 'run.json')) ? JSON.parse(fs.readFileSync(path.join(rd, 'run.json'), 'utf8')) : {};
        if (run.agent && run.agent !== sub.agent.name) err(`${r}: run.json agent "${run.agent}" differs from submission agent "${sub.agent.name}"`);
        const judged = JSON.parse(fs.readFileSync(path.join(rd, 'checklist.json'), 'utf8'));
        if (judged.judge !== sub.judge?.model) err(`${r}: checklist.json judge differs from submission judge.model`);
        for (const j of judged.items ?? []) {
            if (!def.items.some((i) => i.id === j.id)) err(`${r}: checklist item "${j.id}" is not on the ${prompt} ${version} checklist`);
            if (typeof j.pass !== 'boolean') err(`${r}: checklist item "${j.id}" needs pass: true or false`);
            for (const e of j.evidence ?? []) {
                if (path.isAbsolute(e) || e.split(/[\\/]/).includes('..')) err(`${r}: evidence "${e}" must be a path inside the run`);
                else if (!fs.existsSync(path.join(rd, e))) err(`${r}: evidence "${e}" does not exist`);
            }
        }
    }
    const files = walk(dir);
    for (const x of files) {
        if (x.link) err(`symlink ${path.relative(dir, x.f)}`);
        else if (x.size > MAX_FILE) err(`${path.relative(dir, x.f)} is over 10 MB`);
    }
    if (files.reduce((a, x) => a + (x.size ?? 0), 0) > MAX_SUBMISSION) err('the submission is over 25 MB');
    if (errs.length) return errs;
    try {
        const { runs: got, score } = scoreSubmission(dir);
        for (const r of got) if (!r.prompt_matches) err(`${r.dir}: the session's first message is not ${prompt} ${version}'s prompt.txt`);
        if (JSON.stringify(got) !== JSON.stringify(sub.runs)) err('runs in submission.json differ from the recomputed ones: run harness/score.mjs <dir> --write');
        if (score !== sub.score) err(`score ${sub.score} differs from the recomputed ${score}`);
    } catch (e) {
        err(`could not score: ${e.message}`);
    }
    return errs;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const dirs = process.argv.length > 2 ? process.argv.slice(2).map((d) => path.resolve(d)) : submissions(ROOT);
    let bad = 0;
    for (const d of dirs) {
        const errs = check(d);
        console.log(`${errs.length ? 'FAIL' : 'ok  '} ${path.relative(ROOT, d)}`);
        for (const e of errs) console.log(`     ${e}`);
        bad += errs.length > 0;
    }
    console.log(`${dirs.length} submission(s), ${bad} failing`);
    process.exit(bad ? 1 : 0);
}
