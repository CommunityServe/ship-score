// What CI runs on every PR: each submission's shape, its evidence, and its numbers recomputed from the raw files.
// `node harness/validate.mjs [submission dir...]` (default: every submission under results/ and previews/).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, promptDef, scoreSubmission, subdirs } from './score.mjs';

const MAX_SUBMISSION = 25 * 2 ** 20, MAX_FILE = 10 * 2 ** 20;
const NAME = /^\d{4}-\d{2}-\d{2}_[a-z0-9][a-z0-9._-]*$/;
const INPUTS = ['text', 'text+images'];

export const submissions = (root) => ['results', 'previews'].flatMap((area) => {
    const base = path.join(root, area);
    if (!fs.existsSync(base)) return [];
    return subdirs(base).flatMap((p) => subdirs(path.join(base, p)).flatMap((v) =>
        subdirs(path.join(base, p, v)).map((id) => path.join(base, p, v, id))));
});

// What a PR would carry: the files .gitignore leaves out (a local run's game/node_modules, game/dist, agent.log,
// pi's sessions/, .DS_Store) are skipped, so a local check matches CI's.
const IGNORED = new Set(['node_modules', 'agent.log', 'sessions', '.DS_Store']);
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const f = path.join(dir, e.name);
    if (IGNORED.has(e.name) || (e.name === 'dist' && path.basename(dir) === 'game')) return [];
    return e.isSymbolicLink() ? [{ f, link: true }] : e.isDirectory() ? walk(f) : [{ f, size: fs.statSync(f).size }];
});

// A JSON file, or null with the problem recorded.
const read = (f, label, err) => {
    try {
        return JSON.parse(fs.readFileSync(f, 'utf8'));
    } catch (e) {
        err(`${label}: ${e.code === 'ENOENT' ? 'missing' : e.message}`);
        return null;
    }
};

// Every problem with one submission, as messages: bad input is reported, never thrown.
export function check(dir) {
    const errs = [], err = (m) => errs.push(m);
    try {
        checkInto(dir, err, errs);
    } catch (e) {
        err(`could not check: ${e.message}`);
    }
    return errs;
}

function checkInto(dir, err, errs) {
    const [area, prompt, version, id] = dir.split(path.sep).slice(-4);
    if (!NAME.test(id)) err(`folder name must be <YYYY-MM-DD>_<lowercase-slug>, got "${id}"`);
    const sub = read(path.join(dir, 'submission.json'), 'submission.json', err);
    if (!sub) return;
    if (sub.prompt !== prompt || sub.version !== version) err(`submission.json says ${sub.prompt} ${sub.version}, folder says ${prompt} ${version}`);
    let def;
    try { def = promptDef(prompt, version); } catch { return err(`unknown prompt ${prompt} ${version}`); }
    for (const k of ['rig.machine', 'engine.name', 'engine.version', 'model.name', 'agent.name', 'judge.model']) {
        if (typeof k.split('.').reduce((o, p) => o?.[p], sub) !== 'string') err(`submission.json needs ${k}`);
    }
    if (!INPUTS.includes(sub.inputs)) err(`inputs must be one of ${INPUTS.join(', ')}`);
    const runs = subdirs(dir).filter((d) => /^run-\d+$/.test(d)).sort();
    if (runs.join() !== runs.map((_, i) => `run-${i + 1}`).join()) err('runs must be run-1, run-2, ... with no gaps');
    if (area === 'results' && runs.length !== 3) err(`an official result has exactly 3 runs (${runs.length} here); fewer go to previews/`);
    if (area === 'previews' && (runs.length < 1 || runs.length > 3)) err('a preview has 1 to 3 runs');
    for (const r of runs) {
        const rd = path.join(dir, r);
        for (const need of ['session.jsonl.gz', 'mem.txt', 'play.json', 'game']) {
            if (!fs.existsSync(path.join(rd, need))) err(`${r}: missing ${need}`);
        }
        const run = read(path.join(rd, 'run.json'), `${r}/run.json`, err);
        if (run?.agent && run.agent !== sub.agent?.name) err(`${r}: run.json agent "${run.agent}" differs from submission agent "${sub.agent?.name}"`);
        const judged = read(path.join(rd, 'checklist.json'), `${r}/checklist.json`, err);
        if (!judged) continue;
        if (judged.judge !== sub.judge?.model) err(`${r}: checklist.json judge differs from submission judge.model`);
        if (!Array.isArray(judged.items)) { err(`${r}: checklist.json needs an items list`); continue; }
        for (const j of judged.items) {
            if (!def.items.some((i) => i.id === j?.id)) err(`${r}: checklist item "${j?.id}" is not on the ${prompt} ${version} checklist`);
            if (typeof j?.pass !== 'boolean') err(`${r}: checklist item "${j?.id}" needs pass: true or false`);
            for (const e of Array.isArray(j?.evidence) ? j.evidence : []) {
                if (typeof e !== 'string' || path.isAbsolute(e) || e.split(/[\\/]/).includes('..')) err(`${r}: evidence "${e}" must be a path inside the run`);
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
    if (errs.length) return;
    let scored;
    try {
        scored = scoreSubmission(dir);
    } catch (e) {
        return err(`could not score: ${e.message}`);
    }
    for (const r of scored.runs) {
        if (!r.prompt_matches) err(`${r.dir}: the session's first message is not ${prompt} ${version}'s prompt.txt`);
        // A run without memory samples between the prompt and the last message would cost nothing.
        if (r.avg_gib === null) err(`${r.dir}: mem.txt has no sample between the prompt and the agent's last message`);
        else if (!(r.cost > 0)) err(`${r.dir}: the run's cost is 0`);
    }
    if (JSON.stringify(scored.runs) !== JSON.stringify(sub.runs)) err('runs in submission.json differ from the recomputed ones: run harness/score.mjs <dir> --write');
    if (scored.score !== sub.score) err(`score ${sub.score} differs from the recomputed ${scored.score}`);
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
