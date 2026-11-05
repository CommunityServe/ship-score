// One Ship Score run. Makes <run>/game, samples the engine's memory, starts the agent on the pinned prompt with the
// 90-minute cap, saves the agent's session log (home paths scrubbed), then runs the play check.
//   node harness/run.mjs --prompt voxel-sandbox --dir previews/voxel-sandbox/v1/<id>/run-1 --agent pi --engine-pid 1234 \
//     -- pi -p --approve --provider local --model my-model --session-dir {run_dir}/sessions {prompt_text}
// Placeholders in the agent command: {prompt_text} {prompt_file} {run_dir} {game_dir}. The agent works in a scratch
// folder outside this repo (TMPDIR), copied to <run>/game when it exits: agent harnesses load every AGENTS.md and
// CLAUDE.md above their folder, and this repo's is the referee's.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { sampler } from './memory.mjs';
import { playCheck } from './play.mjs';
import { CAP_MIN, promptDef } from './score.mjs';
import { parsers } from './sessions.mjs';

const argv = process.argv.slice(2), sep = argv.indexOf('--');
const flags = sep < 0 ? argv : argv.slice(0, sep), cmd = sep < 0 ? [] : argv.slice(sep + 1);
const opt = (k, d) => (flags.includes(k) ? flags[flags.indexOf(k) + 1] : d);
const [name, version, agent, pid] = [opt('--prompt'), opt('--version', 'v1'), opt('--agent'), Number(opt('--engine-pid'))];
const runDir = path.resolve(opt('--dir') ?? '');
if (!name || !agent || !pid || !cmd.length || !opt('--dir')) {
    console.error('usage: run.mjs --prompt <name> [--version v1] --dir <run dir> --agent <pi|claude-code> --engine-pid <pid> -- <agent command>');
    process.exit(2);
}
if (!parsers[agent]) throw new Error(`no session parser for agent "${agent}" (harness/sessions.mjs has: ${Object.keys(parsers)})`);
if (fs.existsSync(runDir) && fs.readdirSync(runDir).length) throw new Error(`${runDir} is not empty: every run starts in a new folder`);

const def = promptDef(name, version);
if (crypto.createHash('sha256').update(def.text).digest('hex') !== def.sha256) throw new Error('prompt.txt does not match its sha256');
fs.mkdirSync(runDir, { recursive: true });
fs.writeFileSync(path.join(runDir, 'prompt.txt'), def.text);
const work = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ship-score-')));
const game = path.join(work, 'game');
fs.mkdirSync(game);
const promptFile = path.join(work, 'prompt.txt');
fs.writeFileSync(promptFile, def.text);

const fill = (a) => a.replaceAll('{prompt_text}', def.text).replaceAll('{prompt_file}', promptFile)
    .replaceAll('{run_dir}', work).replaceAll('{game_dir}', game);
const scrub = (s) => s.replaceAll(work, '<run>').replaceAll(os.homedir(), '~');

const started = Date.now();
const stop = sampler(pid, path.join(runDir, 'mem.txt'));
const log = fs.openSync(path.join(runDir, 'agent.log'), 'w');
// The agent leads its own process group, so dev servers and browsers it started die with it instead of running into
// the next run's time and memory.
const child = spawn(cmd[0], cmd.slice(1).map(fill), { cwd: game, stdio: ['ignore', log, log], detached: true });
const killGroup = (sig) => { try { process.kill(-child.pid, sig); } catch { /* already gone */ } };
let capped = false;
const cap = setTimeout(() => {
    capped = true; // the 90-minute cap is the only stop a run gets
    killGroup('SIGTERM');
    setTimeout(() => killGroup('SIGKILL'), 10_000).unref();
}, CAP_MIN * 60_000);
console.log(`run started ${new Date(started).toISOString()}: hands off until the agent exits (cap ${CAP_MIN} min)`);
const exit = await new Promise((done) => child.on('exit', (code, signal) => done(code ?? signal)));
clearTimeout(cap);
stop();
killGroup('SIGTERM');
await new Promise((done) => setTimeout(done, 2000));
killGroup('SIGKILL');

// The game first: a missing session log must not lose it.
fs.cpSync(game, path.join(runDir, 'game'), { recursive: true, verbatimSymlinks: true }); // npm's .bin links are relative
const session = parsers[agent].locate(game, started);
if (session) fs.writeFileSync(path.join(runDir, 'session.jsonl.gz'), zlib.gzipSync(scrub(fs.readFileSync(session, 'utf8'))));
fs.rmSync(work, { recursive: true, force: true, maxRetries: 5 }); // the unscrubbed session goes with it (retries: Finder drops .DS_Store mid-delete)
fs.writeFileSync(path.join(runDir, 'run.json'), JSON.stringify({
    prompt: name, version, agent, command: cmd.map((a) => scrub(a.replaceAll('{prompt_text}', '<prompt.txt>'))),
    started: new Date(started).toISOString(), ended: new Date().toISOString(), capped, exit,
}, null, 2) + '\n');
if (!session) throw new Error(`no ${agent} session log found: the game is in ${path.join(runDir, 'game')}, the run does not validate`);
console.log(`agent exited (${exit})${capped ? ' at the cap' : ''}; play check...`);
const play = await playCheck(runDir);
console.log(`play check ${play.pass ? 'passed' : 'FAILED'}: build ${play.build}, DONE.md ${play.done}, errors ${play.n_errors ?? '-'}, `
    + `blank ${play.blank ?? '-'}, changed ${play.changed ?? '-'}. Next: judge the checklist (AGENTS.md step 4).`);
