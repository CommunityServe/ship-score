// Agent session logs -> what the score needs. One parser per agent harness: parse(text) reads the log,
// locate(gameDir, sinceMs) finds the log the run wrote. Add a harness by adding an entry here.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ms = (t) => (typeof t === 'number' ? t : Date.parse(t));
const text = (content) => (typeof content === 'string' ? content
    : content.filter((c) => c.type === 'text').map((c) => c.text).join(''));
const lines = (s) => s.split('\n').filter(Boolean).map((l) => JSON.parse(l));
const newest = (dir, sinceMs) => {
    if (!fs.existsSync(dir)) return null;
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl')).map((f) => path.join(dir, f))
        .filter((f) => fs.statSync(f).mtimeMs >= sinceMs).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    return files[0] ?? null;
};

// Image payloads (an agent reading its own screenshots) out of a session log, which would otherwise outgrow the
// 10 MB file limit: pi's {type: "image", data} and Claude Code's {type: "base64", data} keep their size, not their bytes.
export function stripImages(s) {
    const walk = (v) => {
        if (Array.isArray(v)) return v.map(walk);
        if (!v || typeof v !== 'object') return v;
        if ((v.type === 'image' || v.type === 'base64') && typeof v.data === 'string')
            return { ...v, data: `<${v.data.length} bytes of base64 stripped>` };
        return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    };
    return s.split('\n').map((l) => { try { return JSON.stringify(walk(JSON.parse(l))); } catch { return l; } }).join('\n');
}

// Every parser returns { prompt, start, end, out, uncached, cached, calls, errors, gen_ms }: start = the prompt's
// timestamp, end = the last assistant message, uncached = prompt tokens the engine had to prefill (cache hits excluded),
// gen_ms = the time the engine spent answering, prefill included (null when the log does not record it).
export const parsers = {
    pi: {
        // pi writes into the --session-dir the run passes it: <run>/sessions.
        locate: (gameDir, sinceMs) => newest(path.join(gameDir, '..', 'sessions'), sinceMs),
        parse(s) {
            const r = { prompt: null, start: null, end: null, out: 0, uncached: 0, cached: 0, calls: 0, errors: 0, gen_ms: null };
            for (const o of lines(s)) {
                if (o.type !== 'message') continue;
                const m = o.message;
                if (m.role === 'user' && r.prompt === null) { r.prompt = text(m.content); r.start = ms(m.timestamp); }
                if (m.role === 'assistant') {
                    r.end = ms(m.timestamp);
                    r.out += m.usage.output;
                    r.uncached += m.usage.input + (m.usage.cacheWrite ?? 0);
                    r.cached += m.usage.cacheRead ?? 0;
                    r.calls += m.content.filter((c) => c.type === 'toolCall').length;
                    if (m.durationMs !== undefined) r.gen_ms = (r.gen_ms ?? 0) + m.durationMs;
                }
                if (m.role === 'toolResult' && m.isError) r.errors++;
            }
            return r;
        },
    },
    'claude-code': {
        // Claude Code keeps sessions under ~/.claude/projects/<cwd with / and . as ->.
        locate: (gameDir, sinceMs) =>
            newest(path.join(os.homedir(), '.claude', 'projects', path.resolve(gameDir).replace(/[/.]/g, '-')), sinceMs),
        parse(s) {
            // Claude Code's log has no generation time per message: gen_ms stays null.
            const r = { prompt: null, start: null, end: null, out: 0, uncached: 0, cached: 0, calls: 0, errors: 0, gen_ms: null };
            const seen = new Set();
            for (const o of lines(s)) {
                if (o.isSidechain) continue;
                const m = o.message;
                if (o.type === 'user' && r.prompt === null && text(m.content)) { r.prompt = text(m.content); r.start = ms(o.timestamp); }
                if (o.type === 'user' && Array.isArray(m.content)) r.errors += m.content.filter((c) => c.type === 'tool_result' && c.is_error).length;
                if (o.type !== 'assistant') continue;
                r.end = ms(o.timestamp);
                r.calls += m.content.filter((c) => c.type === 'tool_use').length;
                if (seen.has(m.id)) continue; // one message spans several lines that repeat its usage
                seen.add(m.id);
                r.out += m.usage.output_tokens;
                r.uncached += m.usage.input_tokens + (m.usage.cache_creation_input_tokens ?? 0);
                r.cached += m.usage.cache_read_input_tokens ?? 0;
            }
            return r;
        },
    },
};
