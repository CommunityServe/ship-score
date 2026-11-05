// The engine's memory footprint in bytes, summed over its whole process tree (engines like Ollama load the model in
// a child process): macOS phys_footprint (MLX weights are wired, RSS misses them); Linux each process's VRAM from
// nvidia-smi plus its host RSS.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const run = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

// The process and all its descendants.
export function tree(pid) {
    const kids = new Map();
    for (const line of run('ps', ['-A', '-o', 'pid=,ppid=']).trim().split('\n')) {
        const [p, pp] = line.trim().split(/\s+/).map(Number);
        kids.set(pp, [...(kids.get(pp) ?? []), p]);
    }
    const out = [pid];
    for (let i = 0; i < out.length; i++) out.push(...(kids.get(out[i]) ?? []));
    return out;
}

export function footprint(pid) {
    const pids = tree(pid);
    if (process.platform === 'darwin') {
        const m = [...run('footprint', pids.flatMap((p) => ['-p', String(p)]).concat(['-f', 'bytes'])).matchAll(/phys_footprint:\s+(\d+)/g)];
        return m.reduce((a, x) => a + Number(x[1]), 0) || null;
    }
    const rss = pids.reduce((a, p) => {
        try {
            return a + Number(fs.readFileSync(`/proc/${p}/status`, 'utf8').match(/VmRSS:\s+(\d+)/)?.[1] ?? 0) * 1024;
        } catch { return a; } // exited since ps listed it
    }, 0);
    let vram = 0;
    try {
        for (const line of run('nvidia-smi', ['--query-compute-apps=pid,used_memory', '--format=csv,noheader,nounits']).split('\n')) {
            const [p, mib] = line.split(',').map((x) => Number(x.trim()));
            if (pids.includes(p)) vram += mib * 2 ** 20;
        }
    } catch { /* no NVIDIA GPU: RSS is the footprint */ }
    return rss + vram || null;
}

// Appends "epoch_ms bytes" to `file` now and every 30 s; returns a stop function. A failed sample is not fatal (the
// engine may be restarting) but is reported once: a run without samples does not validate.
export function sampler(pid, file) {
    let warned = false;
    const tick = () => {
        try {
            const b = footprint(pid);
            if (!b) throw new Error(`no footprint for PID ${pid}`);
            fs.appendFileSync(file, `${Date.now()} ${b}\n`);
        } catch (e) {
            if (!warned) console.error(`memory sample failed (${e.message}); the run needs samples to validate`);
            warned = true;
        }
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => { clearInterval(id); tick(); };
}
