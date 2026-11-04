// The engine process's memory footprint in bytes: macOS phys_footprint (MLX weights are wired, RSS misses them);
// Linux the process's VRAM from nvidia-smi plus its host RSS.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const run = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

export function footprint(pid) {
    if (process.platform === 'darwin') {
        const m = run('footprint', ['-p', String(pid), '-f', 'bytes']).match(/phys_footprint:\s+(\d+)/);
        return m ? Number(m[1]) : null;
    }
    const rss = Number(fs.readFileSync(`/proc/${pid}/status`, 'utf8').match(/VmRSS:\s+(\d+)/)?.[1] ?? 0) * 1024;
    let vram = 0;
    try {
        for (const line of run('nvidia-smi', ['--query-compute-apps=pid,used_memory', '--format=csv,noheader,nounits']).split('\n')) {
            const [p, mib] = line.split(',').map((x) => Number(x.trim()));
            if (p === pid) vram += mib * 2 ** 20;
        }
    } catch { /* no NVIDIA GPU: RSS is the footprint */ }
    return rss + vram;
}

// Appends "epoch_ms bytes" to `file` now and every 30 s; returns a stop function.
export function sampler(pid, file) {
    const tick = () => {
        try {
            const b = footprint(pid);
            if (b) fs.appendFileSync(file, `${Date.now()} ${b}\n`);
        } catch { /* the engine restarting between samples is not fatal */ }
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => { clearInterval(id); tick(); };
}
