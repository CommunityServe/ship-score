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

// Every parser returns { prompt, start, end, out, uncached, cached, calls, errors }: start = the prompt's timestamp,
// end = the last assistant message, uncached = prompt tokens the engine had to prefill (cache hits excluded).
export const parsers = {
    pi: {
        // pi writes into the --session-dir the run passes it: <run>/sessions.
        locate: (gameDir, sinceMs) => newest(path.join(gameDir, '..', 'sessions'), sinceMs),
        parse(s) {
            const r = { prompt: null, start: null, end: null, out: 0, uncached: 0, cached: 0, calls: 0, errors: 0 };
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
            const r = { prompt: null, start: null, end: null, out: 0, uncached: 0, cached: 0, calls: 0, errors: 0 };
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
