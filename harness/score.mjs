// The Ship Score, from a submission's raw files. `node harness/score.mjs <submission dir> [--write]` prints the
// table and, with --write, fills submission.json's runs and score. CI runs the same code and diffs the result.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { parsers } from './sessions.mjs';
import { mmss } from './ui.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CAP_MIN = 90;
const round = (x, d) => Math.round(x * 10 ** d) / 10 ** d;
const json = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

export const promptDef = (name, version) => {
    const d = path.join(ROOT, 'prompts', name, version);
    return { text: fs.readFileSync(path.join(d, 'prompt.txt'), 'utf8'), ...json(path.join(d, 'checklist.json')) };
};

export const readSession = (runDir) => zlib.gunzipSync(fs.readFileSync(path.join(runDir, 'session.jsonl.gz'))).toString('utf8');

// Mean of the footprint samples ("epoch_ms bytes" lines) taken between the prompt and the last assistant message.
export const avgGib = (memText, start, end) => {
    const xs = memText.split('\n').filter(Boolean).map((l) => l.split(/\s+/).map(Number))
        .filter(([t]) => t >= start && t <= end).map(([, b]) => b);
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length / 2 ** 30 : null;
};

// The checklist items a run earns: the judge passed them AND cited evidence that exists in the run.
export const passed = (def, judged, runDir) => def.items.filter((item) => {
    const j = judged.items.find((x) => x.id === item.id);
    return j?.pass && j.evidence?.length && j.evidence.every((e) => fs.existsSync(path.join(runDir, e)));
});

export function scoreRun(runDir, def) {
    const run = json(path.join(runDir, 'run.json'));
    const s = parsers[run.agent].parse(readSession(runDir));
    const play = json(path.join(runDir, 'play.json'));
    const minutes = Math.min((s.end - s.start) / 60000, CAP_MIN);
    const gib = avgGib(fs.readFileSync(path.join(runDir, 'mem.txt'), 'utf8'), s.start, s.end);
    const shipped = !run.capped && play.pass && fs.existsSync(path.join(runDir, 'game', 'DONE.md'));
    const pts = shipped ? passed(def, json(path.join(runDir, 'checklist.json')), runDir).reduce((a, i) => a + i.points, 0) : 0;
    const mtok = (s.out + s.uncached) / 1e6;
    return {
        dir: path.basename(runDir), shipped, checklist: pts, avg_gib: round(gib, 2), minutes: round(minutes, 2),
        tokens_out: s.out, tokens_uncached_in: s.uncached, tokens_cached_in: s.cached, tool_calls: s.calls, tool_errors: s.errors,
        cost: round(Math.sqrt(gib) * minutes * mtok, 4), prompt_matches: s.prompt?.trim() === def.text.trim(),
    };
}

// 1,000 x the checklists added (a failed run adds 0) / the costs added (failed runs included).
export const total = (runs) => {
    const cost = runs.reduce((a, r) => a + r.cost, 0);
    return cost ? round((1000 * runs.reduce((a, r) => a + r.checklist / 10, 0)) / cost, 1) : 0;
};

export function scoreSubmission(dir) {
    const sub = json(path.join(dir, 'submission.json'));
    const def = promptDef(sub.prompt, sub.version);
    const runs = fs.readdirSync(dir).filter((d) => /^run-\d+$/.test(d)).sort().map((d) => scoreRun(path.join(dir, d), def));
    return { sub, def, runs, score: total(runs) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const dir = path.resolve(process.argv[2] ?? '.');
    const { sub, runs, score } = scoreSubmission(dir);
    for (const r of runs) {
        console.log(`${r.dir}  ${r.shipped ? 'shipped' : 'FAILED '}  checklist ${r.checklist}/10  ${r.avg_gib} GiB  ${mmss(r.minutes)}`
            + `  ${r.tokens_out.toLocaleString()} out / ${r.tokens_uncached_in.toLocaleString()} uncached in  ${r.tool_calls} (${r.tool_errors}) calls`
            + `${r.prompt_matches ? '' : '  PROMPT MISMATCH'}`);
    }
    console.log(`Ship Score ${score}`);
    if (process.argv.includes('--write')) {
        fs.writeFileSync(path.join(dir, 'submission.json'), JSON.stringify({ ...sub, runs, score }, null, 2) + '\n');
    }
}
